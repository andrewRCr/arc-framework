/** Faithful public results include pending cases and successful retry errors. */
import { expect, it } from "vitest";
import type { TestResult } from "vitest/node";
import { countCompletedVitestCases } from "../../src/lib/vitest-completion.js";

it("counts completed results without treating pending, skip, or retry errors as completion failures", () => {
  const results: TestResult[] = [
    { state: "pending", errors: undefined },
    { state: "skipped", errors: undefined, note: undefined },
    { state: "passed", errors: [{ name: "Error", message: "recovered retry" }] },
    { state: "failed", errors: [{ name: "Error", message: "completed failure" }] },
  ];
  const module = { children: { allTests: () => results.map((result) => ({ result: () => result })) } };
  expect(countCompletedVitestCases([module])).toBe(2);
});
