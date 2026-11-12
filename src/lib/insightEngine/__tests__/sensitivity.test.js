import { describe, it, expect } from "vitest";
import { checkSensitivity } from "../sensitivityCheck.mjs";

// The contract itself lives in sensitivityCheck.mjs so the same assertions run
// before every build (`prebuild`) and here in the suite.
describe("sensitivity — the shape responds to its inputs", () => {
  it("doubling insulin steepens the fall, and doubling carbs raises the peak", () => {
    expect(checkSensitivity()).toEqual([]);
  });
});