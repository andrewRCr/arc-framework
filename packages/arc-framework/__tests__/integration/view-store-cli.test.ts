/** Registered view commands read one selected store and preserve file/content destinations. */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { formatConflictToken } from "../../src/lib/status/conflict-token.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { conflictViewRecord } from "../helpers/store/view-conflicts.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runHandlerAt } from "../helpers/handler.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/handlers/lifecycle-shared.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/handlers/lifecycle-shared.js")>();
  return { ...original, openDefaultStore: (...args: Parameters<typeof original.openDefaultStore>) => binding.store ?? original.openDefaultStore(...args) };
});
async function fixture() {
  const cwd = await createTempRepo();
  onTestFinished(async () => { binding.store = null; await cleanupTempDir(cwd); });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await makeGitExec(cwd)("git", ["config", "arc.identity", "alice"]);
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo", { owner: "alice" });
  const spec = await h.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\n**Purpose:** Selected record content.\n");
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, spawningIdentity: "alice", now: 0, createdFor: { kind: "work-unit", name: "demo" } });
  binding.store = h.store;
  return { ...h, cwd, meta, spec, run: (args: string[]) => runHandlerAt(cwd, () => dispatchRegisteredCli(["--no-input", "view", ...args])) };
}

it("renders the claimed work unit's furthest record without a projected file or file writes", async () => {
  const f = await fixture(), before = await readdir(f.cwd, { recursive: true });
  const result = await f.run([]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Selected record content.");
  expect(await readdir(f.cwd, { recursive: true })).toEqual(before);
}, 30_000);

it("keeps a projected conflict's path usable and emits its notice in text and path modes", async () => {
  const f = await fixture(), current = await conflictViewRecord(f, f.spec,
    f.spec.content.replace("Selected record content.", "Local intent."), f.spec.content.replace("Selected record content.", "Incoming intent."));
  if (current.conflicts.length === 0) throw new Error("Expected genuine merge conflict evidence");
  const path = join(f.cwd, ".arc/active/spec-demo.md");
  await mkdir(join(f.cwd, ".arc/active"), { recursive: true });
  await writeFile(path, "# Spec\n\n**Purpose:** Projected content.\n");
  const result = await f.run(["spec", "--for", "demo", "--path"]);
  expect(result.exitCode).toBe(0); expect(result.stdout).toBe(`${path}\n`);
  for (const conflict of current.conflicts) expect(result.stderr).toContain(`arc status --conflicts ${formatConflictToken(conflict)}`);
  const text = await f.run(["spec", "--for", "demo"]);
  expect(text.exitCode).toBe(0); expect(text.stdout).toContain("Projected content.");
  for (const conflict of current.conflicts) expect(text.stderr).toContain(`arc status --conflicts ${formatConflictToken(conflict)}`);
}, 30_000);

it("refuses a registered path request for unprojected record content with the rendering remedy", async () => {
  const f = await fixture(), result = await f.run(["spec", "--for", "demo", "--path"]);
  expect(result.exitCode).toBe(1); expect(result.stdout).toBe("");
  expect(result.stderr).toContain("has no file in this checkout");
  expect(result.stderr).toContain("arc view spec --for demo");
  expect(result.stderr).not.toContain("without a registered checkout");
}, 30_000);
