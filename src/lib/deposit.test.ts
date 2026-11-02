import { describe, expect, it } from "vitest";
import { depositCentsFor } from "./deposit";
describe("depositCentsFor", () => {
  it("charges 50% of the total when required", () => expect(depositCentsFor(10000, true)).toBe(5000));
  it("rounds odd cents up", () => expect(depositCentsFor(3001, true)).toBe(1501));
  it("charges nothing when no service requires it", () => expect(depositCentsFor(10000, false)).toBe(0));
});
