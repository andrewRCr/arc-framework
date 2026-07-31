/** Persistent-shell sequence capture, parsing, and failure propagation. */

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, runArcAnchoredSequence } from "./helpers.js";

describe("anchored command sequences", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => cleanupTempDir(root)));
  });

  it("preserves interior exit lines and valid JSON beside malformed transcript noise", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-anchored-sequence-"));
    roots.push(cwd);

    const result = await runArcAnchoredSequence([{
      command: [
        process.execPath,
        "-e",
        "process.stdout.write('exit\\n{\"ok\":true}\\n{broken\\n')",
      ],
    }], cwd);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("exit\n");
    expect(result.results).toEqual([{ ok: true }]);
  });

  it("stops after the first failed entry and preserves its exit status", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-anchored-sequence-"));
    roots.push(cwd);
    const marker = join(cwd, "second-entry-ran");

    const result = await runArcAnchoredSequence([
      { command: [process.execPath, "-e", "process.exit(7)"] },
      {
        command: [
          process.execPath,
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'ran')",
          marker,
        ],
      },
    ], cwd);

    expect(result.exitCode).toBe(7);
    await expect(readFile(marker, "utf-8")).rejects.toThrow();
  });
});
