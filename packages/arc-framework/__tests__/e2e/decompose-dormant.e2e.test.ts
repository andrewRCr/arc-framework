/** The installed CLI advertises both storage arms and refuses dormant cut operations. */
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc, runArcNoTty } from "./helpers.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";

let root: string;
beforeEach(async () => {
  root = await createTempRepo();
  expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
});
afterEach(async () => { await cleanupTempDir(root); });
const authority = `sha256:${"a".repeat(64)}`;
it.each([
  { args: ["--revise"], reason: "unsupported", remedy: "explicit cleanup direction" },
  { args: ["--revise", "cut.json"], reason: "unsupported", remedy: "explicit cleanup direction" },
  { args: ["--revise", "cut.json", "--apply", authority], reason: "unsupported", remedy: "explicit cleanup direction" },
  { args: ["--discard"], reason: "unsupported", remedy: "explicit cleanup direction" },
  { args: ["--discard", "--apply", authority], reason: "unsupported", remedy: "explicit cleanup direction" },
  { args: ["--finish"], reason: "finish-map-operand", remedy: "arc decompose origin --finish <cut-map>" },
  { args: ["--finish", "--apply", authority], reason: "finish-map-operand", remedy: "arc decompose origin --finish <cut-map>" },
])("refuses $args as clean canonical JSON", async ({ args, reason, remedy }) => {
  const result = await runArcNoTty(["--no-input", "decompose", "origin", ...args], root);
  expect(result.exitCode).toBe(1);
  expect(result.stdout.length).toBeGreaterThan(0);
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ status: "refused", reason, class: "recoverable", remedy: { text: expect.stringContaining(remedy) } });
  expect(result.stdout).toBe(`${canonicalize(report)}\n`);
  expect(result.stderr).toContain(`${reason}\n${report.remedy.text}\n`);
});
it("lists every mode and the optional finish and revision operands in help", async () => {
  const result = await runArcNoTty(["decompose", "--help"], root);
  expect(result.exitCode).toBe(0);
  for (const flag of ["--preflight", "--execute <cut-map>", "--extract <cut-map>", "--finish [cut-map]", "--revise [cut-map]", "--discard", "--advance-base <cut-map>"])
    expect(result.stdout).toContain(flag);
});
