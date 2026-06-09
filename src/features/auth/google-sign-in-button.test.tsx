import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GoogleSignInButton } from "./google-sign-in-button";

const mockSocial = vi.fn();
vi.mock("@/app/app-runtime", () => ({
  useAppAuth: () => ({ signIn: { social: (...args: unknown[]) => mockSocial(...args) } }),
}));

describe("GoogleSignInButton", () => {
  it("starts Google social sign-in on click", () => {
    render(<GoogleSignInButton />);

    fireEvent.click(
      screen.getByRole("button", { name: /Sign in with Google/i }),
    );

    expect(mockSocial).toHaveBeenCalledTimes(1);
    expect(mockSocial.mock.calls[0][0]).toMatchObject({ provider: "google" });
  });
});
