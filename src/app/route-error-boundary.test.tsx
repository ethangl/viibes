import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockError: unknown = null;
vi.mock("react-router-dom", () => ({
  useRouteError: () => mockError,
}));

import { RouteErrorBoundary } from "./route-error-boundary";

const assignMock = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  // jsdom's window.location.assign isn't spyable, so swap the whole object.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: assignMock, href: "https://viibes.localhost/" },
  });
  assignMock.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("RouteErrorBoundary", () => {
  it("auto-recovers an Unauthorized error by reloading /", () => {
    mockError = new Error(
      'Server Error Uncaught ConvexError: {"_tag":"Unauthorized"}',
    );

    render(<RouteErrorBoundary />);

    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
    expect(assignMock).toHaveBeenCalledWith("/");
  });

  it("does not loop — shows a fallback if it just recovered", () => {
    sessionStorage.setItem("auth-recovery-at", String(Date.now()));
    mockError = new Error('ConvexError: {"_tag":"Unauthorized"}');

    render(<RouteErrorBoundary />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("shows a reload fallback for a non-auth error", () => {
    mockError = new Error("boom");

    render(<RouteErrorBoundary />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
