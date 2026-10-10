/** Platform budgets account for native encoding and Windows command escaping. */
import { expect, it } from "vitest";
import { batchCheckPaths, checkArgumentBudget, checkFileArguments } from "../../../../src/lib/checks/batching.js";

it.each([
  ["win32", 7936], ["linux", 16384], ["darwin", 16384], ["freebsd", 16384],
] as const)("provides a fixed %s budget with space for process framing", (platform, budget) => {
  expect(checkArgumentBudget(platform)).toBe(budget);
});

it.each(["C:\\repository", "C:\\repository\\docs"])("retains Git slash separators from a Windows working directory %s", cwd => {
  expect(checkFileArguments("C:\\repository", cwd, ["src/a.ts"], "win32"))
    .toEqual([cwd.endsWith("docs") ? "../src/a.ts" : "src/a.ts"]);
});

it("preserves literal backslashes in POSIX filenames", () => {
  expect(checkFileArguments("/repository", "/repository/docs", ["src/a\\b.ts"], "linux"))
    .toEqual(["../src/a\\b.ts"]);
});

it("splits Windows batches after command-file metacharacters are escaped twice", () => {
  const paths = Array.from({ length: 20 }, (_, index) => `src/${index}/${"&".repeat(100)}`);
  const batches = batchCheckPaths(["npm", "run", "lint"], paths, "win32");
  expect(batches.map(batch => batch.length)).toEqual([19, 1]);
  expect(batches.flat()).toEqual(paths);
  expect(batchCheckPaths(["npm", "run", "lint"], paths, "linux")).toEqual([paths]);
});

it("measures POSIX argument bytes with UTF-8 encoding", () => {
  const paths = Array.from({ length: 20 }, (_, index) => `src/${index}/${`${"é".repeat(50)}/`.repeat(10)}file.ts`);
  const batches = batchCheckPaths(["node", "lint.cjs"], paths, "linux");
  expect(batches.map(batch => batch.length)).toEqual([15, 5]);
  expect(batches.flat()).toEqual(paths);
});

it.each(["command", "path"])("keeps an oversized %s from producing an over-budget batch", oversized => {
  const command = ["node", oversized === "command" ? "x".repeat(17000) : "lint.cjs"];
  const paths = [oversized === "path" ? "src/" + "x".repeat(17000) : "src/a.ts"];
  expect(() => batchCheckPaths(command, paths, "linux")).toThrow(/argument budget.*shorten.*retry/u);
});
