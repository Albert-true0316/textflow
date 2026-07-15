import { describe, expect, it } from "vitest";
import { buildDecomposeUtterance } from "./mapper";

describe("buildDecomposeUtterance", () => {
  it("includes parent due when provided", () => {
    const utterance = buildDecomposeUtterance("p1a2", "准备答辩", 4, "2026-07-17");
    expect(utterance).toContain("2026-07-17");
    expect(utterance).toContain("id=p1a2");
  });
});
