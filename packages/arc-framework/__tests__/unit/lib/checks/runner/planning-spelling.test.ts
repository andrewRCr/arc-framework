/** Fixed argv uses the captured spelling proven by the source producer. */
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CheckDeclarationSchema } from "../../../../../src/lib/checks/declaration.js";
import { freezeSourcePresentation } from "../../../../../src/lib/checks/runner/source-presentation.js";
import { nodeSourcePresentationIO } from "../../../../../src/lib/checks/runner/source-io.js";
import { planCheckExecution } from "../../../../../src/lib/checks/runner/planning.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

it.each([{ code: "SOURCE.TXT", stored: "source.txt" }, { code: "é.txt", stored: "e\u0301.txt" }])(
  "plans readable stored spelling $stored for canonical alias $code", async ({ code, stored }) => {
    const callerRoot = await mkdtemp(join(tmpdir(), "arc-plan-spelling-"));
    directories.push(callerRoot);
    await writeFile(join(callerRoot, stored), "literal captured bytes\n");
    const source = await freezeSourcePresentation(callerRoot, Buffer.from(`${code}\0${stored}\0`), { tree: "a".repeat(40), merged: [] },
      { ...nodeSourcePresentationIO, lstat: path => nodeSourcePresentationIO.lstat(path === join(callerRoot, code) ? join(callerRoot, stored) : path) });
    try {
      const check = CheckDeclarationSchema.parse({ checks: { example: { runner: true, mode: "files", command: ["node", "check.cjs"] } } }).checks.example;
      if (check === undefined) throw new Error("Expected files declaration");
      const plan = await planCheckExecution({ callerRoot, source, check, paths: [code, stored] });
      // A second catalog spelling can name the same entry on a compatible caller filesystem.
      const invocation = plan.invocations[0];
      expect(invocation?.argv).toEqual(["node", "check.cjs", stored, stored]);
      if (invocation === undefined) throw new Error("Expected a fixed invocation");
      for (const path of invocation.argv.slice(2)) {
        expect(await readFile(resolve(source.root, invocation.cwd, path), "utf8")).toBe("literal captured bytes\n");
      }
    } finally { await source.remove(); }
  });

it("refuses an unmapped forwarded path and accepts a repaired selection", async () => {
  const callerRoot = await mkdtemp(join(tmpdir(), "arc-plan-spelling-"));
  directories.push(callerRoot);
  await writeFile(join(callerRoot, "source.txt"), "captured\n");
  const source = await freezeSourcePresentation(callerRoot, Buffer.from("source.txt\0"), { tree: "a".repeat(40), merged: [] });
  try {
    const check = CheckDeclarationSchema.parse({ checks: { example: { runner: true, mode: "files", command: ["node", "check.cjs"] } } }).checks.example;
    if (check === undefined) throw new Error("Expected files declaration");
    await expect(planCheckExecution({ callerRoot, source, check, paths: ["not-captured.txt"] })).rejects.toThrow(/captured.*spelling.*repair.*retry/iu);
    expect((await planCheckExecution({ callerRoot, source, check, paths: ["source.txt"] })).invocations[0]?.argv)
      .toEqual(["node", "check.cjs", "source.txt"]);
  } finally { await source.remove(); }
});

it("keeps historical deleted paths out of argv when the declaration withholds paths", async () => {
  const callerRoot = await mkdtemp(join(tmpdir(), "arc-plan-spelling-"));
  directories.push(callerRoot);
  const source = await freezeSourcePresentation(callerRoot, Buffer.alloc(0), { tree: "a".repeat(40), merged: [] });
  try {
    const check = CheckDeclarationSchema.parse({ checks: { example: { runner: true, mode: "files", pass_paths: false, command: ["node", "check.cjs"] } } }).checks.example;
    if (check === undefined) throw new Error("Expected files declaration");
    expect((await planCheckExecution({ callerRoot, source, check, paths: ["deleted.txt"] })).invocations[0])
      .toMatchObject({ argv: ["node", "check.cjs"], commandContent: { tree: "a".repeat(40) } });
  } finally { await source.remove(); }
});
