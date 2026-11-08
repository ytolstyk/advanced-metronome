import { describe, expect, it } from "vitest";
import { isTakedownContactSet, TAKEDOWN_CONTACT } from "./legalContact";

describe("isTakedownContactSet", () => {
  it("is false for the TODO placeholder", () => {
    expect(isTakedownContactSet("TODO-set-before-launch")).toBe(false);
    expect(isTakedownContactSet("TODO")).toBe(false);
  });

  it("is true for a real email address", () => {
    expect(isTakedownContactSet("takedown@example.com")).toBe(true);
  });

  it("defaults to the exported contact", () => {
    expect(isTakedownContactSet()).toBe(isTakedownContactSet(TAKEDOWN_CONTACT));
  });
});
