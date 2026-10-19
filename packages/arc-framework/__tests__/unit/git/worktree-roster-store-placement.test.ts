/** Physical registrations stay complete while logical roster consumers use active placement. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { runWorktreeRoster } from "../../../src/lib/git/worktree-roster.js";
import { runActiveRoster } from "../../../src/commands/active/roster.js";
import { resolveInFlightComposition } from "../../../src/lib/session-init/in-flight-composition.js";
import { enumerateOwnedIntegratingWorkUnits } from "../../../src/lib/session-init/in-flight-work-unit-sweep.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-roster-placement-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness();
  const worktrees: string[] = [];
  for (const [name, placement, workClass] of [
    ["active", { kind: "active" }, "Light"],
    ["backlog", { kind: "backlog", commitment: "planned" }, "Heavy"],
    ["completed", { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") }, "Novel"],
  ] as const) {
    const path = join(cwd, name); await mkdir(path);
    await h.seedMeta(name, { state: "Integrating", currentWorkflow: "integrate-work-unit", owner: "andrew", workClass }, placement);
    await writeWorktreeOwnershipMarker(path, { createdByArc: true, createdFor: { kind: "work-unit", name }, spawningIdentity: "andrew", now: 0 });
    worktrees.push(`worktree ${path}`, `HEAD ${"a".repeat(40)}`, ...(name === "completed" ? ["detached"] : [`branch refs/heads/feat/${name}`]), "", "");
  }
  return { cwd, store: h.store, exec: async () => ({ stdout: worktrees.join("\0") }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("Metadata is in the Store"); } } };
}

it("retains every marked physical registration with its authoritative placement", async () => {
  const options = await fixture(), roster = await runWorktreeRoster(options);
  expect(roster.warnings).toEqual([]);
  expect(roster.entries.map(entry => ({ name: entry.workUnit, placement: entry.placement }))).toEqual([
    { name: "active", placement: "active" }, { name: "backlog", placement: "backlog" }, { name: "completed", placement: "completed" },
  ]);
  expect(roster.entries.find(entry => entry.workUnit === "completed")).not.toHaveProperty("branch");
});

it("uses only active placement for the logical roster, class tally and Integrating sweep", async () => {
  const options = await fixture(), physical = await runWorktreeRoster(options);
  const logical = await runActiveRoster({ ...options, identity: "andrew", teamMode: false });
  expect(logical.entries.map(entry => entry.workUnit)).toEqual(["active"]);
  expect(resolveInFlightComposition(physical.entries)).toEqual({ novel: 0, heavy: 0, light: 1 });
  expect(enumerateOwnedIntegratingWorkUnits({ roster: physical.entries, identity: "andrew", committerDates: new Map() }))
    .toEqual([{ name: "active", branch: "feat/active", committerDate: null }]);
});

it("emits no class composition when the supplied work-unit rows all have inactive placement", async () => {
  const options = await fixture(), physical = await runWorktreeRoster(options);
  expect(resolveInFlightComposition(physical.entries.filter(entry => entry.workUnit !== "active"))).toBeNull();
});

it("preserves the legacy empty tally for a degraded tuple with no placement or resolved metadata", () => {
  expect(resolveInFlightComposition([{ worktreePath: "/legacy", branch: "feat/unreadable" }]))
    .toEqual({ novel: 0, heavy: 0, light: 0 });
});
