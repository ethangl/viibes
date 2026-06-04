import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { getConvexErrorMessage } from "./convex-error";

describe("getConvexErrorMessage", () => {
  it("reads message from a typed-error ConvexError data object", () => {
    const error = new ConvexError({
      _tag: "InvalidInput",
      message: "Room name is required.",
    });

    expect(getConvexErrorMessage(error, "fallback")).toBe(
      "Room name is required.",
    );
  });

  it("reads a string ConvexError payload directly", () => {
    const error = new ConvexError("Only owners can do that.");

    expect(getConvexErrorMessage(error, "fallback")).toBe(
      "Only owners can do that.",
    );
  });

  it("does not surface the JSON-stringified data blob", () => {
    const error = new ConvexError({
      _tag: "Forbidden",
      message: "You need a room role to do that.",
    });

    // error.message is the stringified data; we must not show that.
    expect(getConvexErrorMessage(error, "fallback")).not.toContain("_tag");
  });

  it("falls back to a plain Error message", () => {
    expect(getConvexErrorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("uses the fallback for non-errors and empty messages", () => {
    expect(getConvexErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(getConvexErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(getConvexErrorMessage(new ConvexError({}), "fallback")).toBe(
      "fallback",
    );
  });
});
