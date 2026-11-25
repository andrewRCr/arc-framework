/** Platform budgets account for native encoding and Windows command escaping. */
import { expect, it } from "vitest";
import { batchCheckPaths, batchPortableCheckPaths, checkArgumentBudget, checkFileArguments, portableCheckArgumentBatches } from "../../../../src/lib/checks/batching.js";
import { CheckDeclarationSchema } from "../../../../src/lib/checks/declaration.js";

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

it.each(["linux", "win32"] as const)("refuses an oversized fixed command without any received paths on %s", platform => {
  expect(() => batchCheckPaths(["node", "x".repeat(17000)], [], platform)).toThrow(/argument budget.*shorten.*retry/u);
});

it("budgets final consumer arguments and Windows escaping before portable path partitioning", () => {
  const paths = Array.from({ length: 20 }, (_, index) => `src/${index}/${"&".repeat(100)}`);
  const command = ["npm", "run", "lint", "--", "--consumer-option", "x".repeat(500)];
  const batches = batchPortableCheckPaths(command, paths);
  expect(batches.map(batch => batch.length)).toEqual([17, 3]);
  expect(batches.flat()).toEqual(paths);
});

it.each([
  { command: ["node", "x".repeat(9000)], paths: [] },
  { command: ["node", "lint.cjs"], paths: ["src/" + "&".repeat(2000)] },
])("refuses a portable Windows overflow with a shortening remedy", ({ command, paths }) => {
  expect(() => batchPortableCheckPaths(command, paths)).toThrow(/argument budget.*shorten.*retry/u);
});

it("measures portable POSIX bytes independently from Windows units while retaining literal Unicode and quoting", () => {
  const large = `src/${"漢".repeat(5000)}/"😀\\é".ts`;
  expect(batchPortableCheckPaths(["node", "lint.cjs"], [large])).toEqual([[large]]);
  const paths = Array.from({ length: 6 }, (_, index) => `src/${index}/${"漢".repeat(1000)}`);
  const batches = batchPortableCheckPaths(["node", "lint.cjs"], paths);
  expect(batches.map(batch => batch.length)).toEqual([5, 1]);
  expect(batches.flat()).toEqual(paths);
});

it("refuses a portable single-path overflow measured in POSIX bytes", () => {
  expect(() => batchPortableCheckPaths(["node", "lint.cjs"], ["src/" + "漢".repeat(6000)]))
    .toThrow(/argument budget.*shorten.*retry/u);
});

it.each([
  { mode: "files", pass_paths: true, lengths: [17, 3] },
  { mode: "files", pass_paths: false, lengths: [0] },
  { mode: "project", pass_paths: true, lengths: [0] },
] as const)("retains portable $mode path policy with pass_paths=$pass_paths without expanding declared shards", ({ mode, pass_paths, lengths }) => {
  const command = ["npm", "run", "lint", "--", "--consumer-option", "x".repeat(500)];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode, pass_paths,
    shards: { count: 3, argument: "--partition={index}" } } } }).checks.example!;
  const paths = Array.from({ length: 20 }, (_, index) => `src/${index}/${"&".repeat(100)}`);
  const batches = portableCheckArgumentBatches(check, command, paths);
  expect(batches.map(batch => batch.length)).toEqual(lengths);
  expect(batches.flat()).toEqual(mode === "files" && pass_paths ? paths : []);
});

it.each(["files", "project"] as const)("checks portable fixed overflow when %s receives no arguments", mode => {
  const command = ["node", "x".repeat(9000)];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode,
    ...(mode === "files" ? { pass_paths: false } : {}) } } }).checks.example!;
  expect(() => portableCheckArgumentBatches(check, command, [])).toThrow(/argument budget.*shorten.*retry/u);
});

it("does not budget unreceived paths for a portable files check that withholds them", () => {
  const command = ["node", "lint.cjs"];
  const check = CheckDeclarationSchema.parse({ checks: { example: { command, mode: "files", pass_paths: false } } }).checks.example!;
  expect(portableCheckArgumentBatches(check, command, ["&".repeat(9000)])).toEqual([[]]);
});

it("budgets portable shell text literally without normalizing it as an executable path and permits a shorter command", () => {
  const check = (command: string) => CheckDeclarationSchema.parse({ checks: { example: { command, shell: true } } }).checks.example!;
  const oversized = "echo " + "x/../".repeat(1700);
  expect(() => portableCheckArgumentBatches(check(oversized), [oversized], []))
    .toThrow(/argument budget.*shorten.*retry/u);
  const repaired = "printf 'literal & punctuation /../text'";
  expect(portableCheckArgumentBatches(check(repaired), [repaired], [])).toEqual([[]]);
});
