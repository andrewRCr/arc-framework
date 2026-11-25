import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessResult } from "../../../../src/scripts/typecheck/processes.js";
import { lintLaunchPlan, parseHeap, runLint } from "../../../../src/scripts/typecheck/lint.js";

it("runs the package eslint through the current Node with literal caller arguments and its own heap file", () => {
  const env = { NODE_OPTIONS: "--max-old-space-size=4096", ARC_TYPECHECK_HEAP_FILE: "inherited" };
  const plan = lintLaunchPlan({
    packageRoot: "/package", eslintBin: "/eslint/bin/eslint.js", preload: "/package/heap report.ts",
    heapFile: "/scratch/heap.json", forwarded: ["src/", "a file.ts", "--prune-suppressions"], env,
  });
  expect(plan).toEqual({
    command: process.execPath,
    args: ["--import", pathToFileURL("/package/heap report.ts").href, "/eslint/bin/eslint.js", "src/", "a file.ts", "--prune-suppressions"],
    cwd: "/package", expectedExecutable: realpathSync(process.execPath),
    env: { NODE_OPTIONS: "--max-old-space-size=4096", ARC_TYPECHECK_HEAP_FILE: "/scratch/heap.json" },
  });
  expect(env.ARC_TYPECHECK_HEAP_FILE).toBe("inherited");
});


describe("eslint terminal reports", () => {
  const directories: string[] = [];
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
  function scenario(result: ProcessResult, heapText?: string) {
    const directory = mkdtempSync(join(tmpdir(), "lint-heap-test-"));
    directories.push(directory);
    const heapFile = join(directory, "heap.json");
    const lines: string[] = [];
    const options = {
      packageRoot: directory, eslintBin: "/eslint.js", preload: "/heap-report.ts", heapFile,
      forwarded: [], env: {}, writeLine: (line: string) => { lines.push(line); },
    };
    const launch = (): Promise<ProcessResult> => {
      if (heapText !== undefined) writeFileSync(heapFile, heapText);
      return Promise.resolve(result);
    };
    return { options, launch, lines };
  }
  it.each([0, 1, 2])("preserves eslint status %s and reports its heap observations in MiB", async code => {
    const s = scenario({ code, signal: null, peak: { rssMiB: 2500 } }, JSON.stringify({ used_heap_size: 1024 * 1024 * 2048, heap_size_limit: 1024 * 1024 * 4144 }));
    expect(await runLint(s.options, s.launch)).toBe(code);
    expect(s.lines).toEqual(["lint:ts: peak: 2500 MiB; heap in use: 2048 MiB; heap limit: 4144 MiB"]);
  });
  it("retains a signal's status and RSS while rejecting even a present heap file", async () => {
    const s = scenario({ code: null, signal: "SIGTERM", peak: { rssMiB: 2900 } }, JSON.stringify({ used_heap_size: 1024, heap_size_limit: 2048 }));
    expect(await runLint(s.options, s.launch)).toBe(143);
    expect(s.lines).toEqual(["lint:ts: peak: 2900 MiB; signal: SIGTERM; heap: unavailable"]);
  });
  it("reports an unavailable heap for a missing file without changing eslint's status", async () => {
    const s = scenario({ code: 2, signal: null, peak: {} });
    expect(await runLint(s.options, s.launch)).toBe(2);
    expect(s.lines).toEqual(["lint:ts: peak: unavailable; heap: unavailable"]);
  });
});

it("parses the preload's heap observations from bytes to MiB", () => {
  expect(parseHeap(JSON.stringify({ used_heap_size: 1572864, heap_size_limit: 4345298944 }))).toEqual({ usedMiB: 1.5, limitMiB: 4144 });
});
