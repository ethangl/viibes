import { ReactNode } from "react";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppRuntimeProvider,
  useAppAuth,
  useAppCapabilities,
} from "./app-runtime";

const mockUseSession = vi.fn();
const mockSignInSocial = vi.fn();
const mockSignInAnonymous = vi.fn(async () => {});
const mockSignOut = vi.fn();

vi.mock("@/lib/convex-auth-client", () => ({
  convexSignIn: {
    social: (...args: unknown[]) => mockSignInSocial(...args),
    anonymous: () => mockSignInAnonymous(),
  },
  convexSignOut: (...args: unknown[]) => mockSignOut(...args),
  useConvexSession: () => mockUseSession(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AppRuntimeProvider>{children}</AppRuntimeProvider>;
}

function useRuntimeProbe() {
  return {
    auth: useAppAuth(),
    capabilities: useAppCapabilities(),
  };
}

describe("AppRuntimeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a signed out status after the session settle delay when there is no session", async () => {
    vi.useFakeTimers();
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });

    const { result } = renderHook(() => useRuntimeProbe(), { wrapper });

    expect(result.current.auth.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.auth.session).toBeNull();
    expect(result.current.auth.isPending).toBe(false);
    expect(result.current.capabilities.canCreateRoom).toBe(false);
    vi.useRealTimers();
  });

  it("disallows room creation for an anonymous guest session", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "guest-1", isAnonymous: true } },
      isPending: false,
    });

    const { result } = renderHook(() => useRuntimeProbe(), { wrapper });

    expect(result.current.capabilities.canCreateRoom).toBe(false);
    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });

  it("allows room creation for a real (non-anonymous) account", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
    });

    const { result } = renderHook(() => useRuntimeProbe(), { wrapper });

    expect(result.current.capabilities.canCreateRoom).toBe(true);
  });

  it("silently creates an anonymous guest session once the session settles to none", async () => {
    vi.useFakeTimers();
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    renderHook(() => useRuntimeProbe(), { wrapper });

    // Not while still settling/pending.
    expect(mockSignInAnonymous).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(mockSignInAnonymous).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not create an anonymous session when one already exists", () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-1" } },
      isPending: false,
    });

    renderHook(() => useRuntimeProbe(), { wrapper });

    expect(mockSignInAnonymous).not.toHaveBeenCalled();
  });

  it("does not bounce back to pending when the same session user re-renders", () => {
    const sessionValue = {
      data: { user: { id: "user-1" } },
      isPending: false,
    };

    mockUseSession.mockImplementation(() => sessionValue);

    const { result, rerender } = renderHook(() => useRuntimeProbe(), {
      wrapper,
    });

    expect(result.current.auth.isPending).toBe(false);

    sessionValue.data = { user: { id: "user-1" } };
    rerender();

    expect(result.current.auth.isPending).toBe(false);
    expect(result.current.auth.session).toEqual({ user: { id: "user-1" } });
  });

  it("does not flash signed_out if a session appears during the settle window", async () => {
    vi.useFakeTimers();
    const sessionState: {
      data: { user: { id: string } } | null;
      isPending: boolean;
    } = {
      data: null,
      isPending: true,
    };

    mockUseSession.mockImplementation(() => sessionState);

    const { result, rerender } = renderHook(() => useRuntimeProbe(), {
      wrapper,
    });

    expect(result.current.auth.isPending).toBe(true);

    sessionState.isPending = false;
    sessionState.data = null;
    await act(async () => {
      rerender();
    });

    expect(result.current.auth.isPending).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    sessionState.data = { user: { id: "user-1" } };
    await act(async () => {
      rerender();
      await Promise.resolve();
    });

    expect(result.current.auth.session).toEqual({ user: { id: "user-1" } });
    vi.useRealTimers();
  });

  it("throws when used outside the runtime provider", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });

    expect(() => renderHook(() => useRuntimeProbe())).toThrow(
      "useAppAuth must be used within an AppRuntimeProvider.",
    );
  });
});
