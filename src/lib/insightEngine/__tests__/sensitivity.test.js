import { describe, it, expect } from "vitest";
import { checkAll } from "../sensitivityCheck.mjs";

// The contracts themselves live in sensitivityCheck.mjs so the same assertions
// run before every build (`prebuild`) and here in the suite.
describe("forecast contracts", () => {
  it("responds to its inputs, draws the clean afternoon, and seeds a prior band", () => {
    expect(checkAll()).toEqual([]);
  });
});