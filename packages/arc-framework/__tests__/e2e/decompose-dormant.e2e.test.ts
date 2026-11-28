/** The installed CLI describes stored cuts and preserves in-repo refusals. */
import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc, runArcNoTty } from "./helpers.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { decomposeDiscardStep, decomposeRevisionStep } from "../../src/lib/store/pre-flip-steps.js";

let root: string;
useInRepoStoreForEach();
beforeEach(async () => {
  root = await createTempRepo();
  expect((await runArc(["init", "--yes", "--name", "test-project"], root)).exitCode).toBe(0);
});
afterEach(async () => { await cleanupTempDir(root); });
const authority = `sha256:${"a".repeat(64)}`;
it.each([
  { args: ["--revise"], reason: "unsupported", remedy: decomposeRevisionStep("origin") },
  { args: ["--revise", "cut.json"], reason: "unsupported", remedy: decomposeRevisionStep("origin") },
  { args: ["--revise", "cut.json", "--apply", authority], reason: "unsupported", remedy: decomposeRevisionStep("origin") },
  { args: ["--discard"], reason: "unsupported", remedy: decomposeDiscardStep() },
  { args: ["--discard", "--apply", authority], reason: "unsupported", remedy: decomposeDiscardStep() },
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
it("explains the stored cut modes and the base-advance refusal in help", async () => {
  const result = await runArcNoTty(["decompose", "--help"], root);
  expect(result.exitCode).toBe(0);
  const help = result.stdout.replace(/\s+/gu, " ");
  expect(help).toContain("--preflight");
  expect(help).toContain("--execute <cut-map> Create members and store a cut");
  expect(help).toContain("--extract <cut-map> Create members and store an extraction");
  const finishOption = result.stdout.match(/^ {2}--finish\b.*(?:\n {4,}\S.*)*/mu)?.[0].replace(/\s+/gu, " ");
  expect.soft(finishOption).toMatch(/\bpreview\b.*--finish(?=\.|\s+(?:without|on)\b)/iu);
  expect.soft(finishOption).toMatch(/--finish --apply <authority>/u);
  expect.soft(finishOption).toMatch(/\b(?:cut-map|map operand)\b[^.]*\bin-repo\b[^.]*\bonly\b/iu);
  expect(help).toContain("--revise [cut-map] Emit a fresh map without an operand");
  expect(help).toContain("--discard Preview discarding a stored cut");
  expect(help).toContain("--advance-base <cut-map> Unsupported for stored cuts");
});
