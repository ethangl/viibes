import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomCreateForm } from "./room-create-form";

let canCreateRoom = true;
const mockSocial = vi.fn();
const mockCreateRoom = vi.fn();

vi.mock("@/app/app-runtime", () => ({
  useAppCapabilities: () => ({ canCreateRoom }),
  useAppAuth: () => ({ signIn: { social: (...a: unknown[]) => mockSocial(...a) } }),
}));

vi.mock("../runtime/rooms-provider", () => ({
  useRooms: () => ({ createRoom: mockCreateRoom }),
}));

// Avoid the account menu's own session/context deps in this unit test.
vi.mock("@/features/chat/user-menu", () => ({ UserMenu: () => null }));

afterEach(() => {
  canCreateRoom = true;
  vi.clearAllMocks();
});

describe("RoomCreateForm", () => {
  it("shows the create form for a real account", () => {
    canCreateRoom = true;
    render(<RoomCreateForm />);

    expect(screen.getByPlaceholderText("Weekend warmup")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create room/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Sign in with Google/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a sign-in gate for a guest", () => {
    canCreateRoom = false;
    render(<RoomCreateForm />);

    expect(
      screen.queryByPlaceholderText("Weekend warmup"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in to create a room/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign in with Google/i }),
    ).toBeInTheDocument();
  });
});
