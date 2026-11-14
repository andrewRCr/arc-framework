/** Hold every projection index header and partition an integration test's writes publish against the index schemas. */
import { afterEach, expect, vi } from "vitest";

const violations = vi.hoisted(() => [] as { path: string; issues: string }[]);

vi.mock("../../../../src/lib/fs.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/fs.js")>();
  return { ...actual, atomicWriteFile: async (...args: Parameters<typeof actual.atomicWriteFile>) => {
    // Loaded at the first write, once the modules this check reads have finished loading through this mock.
    const { projectionIndexIssues } = await import("./index-schema-check.js");
    const issues = projectionIndexIssues(args[0], args[1]);
    if (issues !== null) violations.push({ path: args[0], issues });
    await actual.atomicWriteFile(...args);
  } };
});

// A command may turn a failed write into a diagnostic, so a refused file fails the test that published it.
afterEach(() => { expect(violations.splice(0)).toEqual([]); });
