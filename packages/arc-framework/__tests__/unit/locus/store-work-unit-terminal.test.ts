/** Terminal lineage resolves a removed primary without inventing metadata or active work. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readStoreWorkUnitEvidence } from "../../../src/lib/locus/store-work-unit-evidence.js";
import { runWorktreeRoster } from "../../../src/lib/git/worktree-roster.js";
import { runActiveRoster } from "../../../src/commands/active/roster.js";
import { resolveInFlightComposition } from "../../../src/lib/session-init/in-flight-composition.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { batchLifecycleWrites } from "../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { LineageRecordSchema, writeLineageRecord } from "../../../src/lib/store/kinds/lineage/index.js";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../../helpers/store/lifecycle-harness.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { runStoreAbandon } from "../../../src/lib/work-unit/verbs/abandon-store.js";
import { buildExecutorContext } from "../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../src/lib/work-unit/locus-ports.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";

async function fixture(kind: "abandon" | "decompose" = "abandon") {
  const h = createLifecycleHarness();
  if (kind === "decompose") await h.seedMeta("successor");
  const retire = async () => {
    const primary = await h.seedMeta("ended", { owner: "andrew" }, { kind: "active" },
      { branches: [{ repository: "project", ref: "feat/ended", linkedAs: "created", excluded: [] }] });
    const reference = recordReferences["lineage/transition"](primary.reference.owner);
    const lineage = LineageRecordSchema.parse({ schemaVersion: 2, kind, origin: { name: primary.reference.owner.name,
      ...("uid" in primary.reference.owner ? { uid: primary.reference.owner.uid } : {}) },
      successors: kind === "decompose" ? [{ name: "successor" }] : [], incoming: [], retiredBranches: primary.links?.branches ?? [],
      ...(kind === "decompose" ? { outgoing: [] } : {}) });
    ok(await batchLifecycleWrites(h.store, [{ action: "remove", reference: primary.reference, expected: primary.version },
      { action: "put", reference, expected: null, content: writeLineageRecord(lineage) }], { verb: kind, lifecycleAction: kind }));
    return ok(await h.store.read({ reference }));
  };
  const terminal = await retire();
  const input = { store: h.store, slug: "ended", head: "a".repeat(40) };
  return { ...h, terminal, retire, input };
}

it.each((["manual", "with-integration"] as const).flatMap(archiveCadence =>
  (["abandon", "decompose"] as const).map(kind => ({ archiveCadence, kind }))))(
  "$archiveCadence resolves $kind after primary removal without primary fields", async ({ archiveCadence, kind }) => {
    const h = await fixture(kind), result = await readStoreWorkUnitEvidence({ ...h.input, archiveCadence });
    expect(result).toMatchObject({ kind: "terminal", subject: { kind: "work-unit", key: "ended" },
      lifecycle: { state: "retired", expectedTopology: {} } });
    expect(result).not.toHaveProperty("record"); expect(result).not.toHaveProperty("fields"); expect(result).not.toHaveProperty("branch");
    expect(await h.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(h.terminal.reference.owner.name) } }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

it("keeps a terminal physical association out of logical rosters and class composition", async () => {
  const h = await fixture(), cwd = await mkdtemp(join(tmpdir(), "arc-terminal-roster-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc"));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "ended" }, spawningIdentity: "andrew", now: 0 });
  const options = { store: h.store, cwd, exec: async () => ({ stdout: `worktree ${cwd}\0HEAD ${"a".repeat(40)}\0detached\0\0` }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No primary projection exists"); } } };
  const physical = await runWorktreeRoster(options);
  expect(physical.warnings).toEqual([]);
  expect(physical.entries).toEqual([{ worktreePath: cwd, workUnit: "ended", retired: true }]);
  expect((await runActiveRoster({ ...options, identity: "andrew", teamMode: false })).entries).toEqual([]);
  expect(resolveInFlightComposition(physical.entries)).toBeNull();
});

it("reports ambiguous terminal generations instead of choosing a retirement", async () => {
  const h = await fixture(); await h.retire();
  const result = await readStoreWorkUnitEvidence(h.input);
  expect(result).toMatchObject({ kind: "unreadable", code: "subject-unresolved", reason: expect.stringMatching(/more than one record generation.*retry/iu) });
});

it("reports a failed terminal read with its remedy and retires after authority is restored", async () => {
  const h = await fixture(), store = Object.create(h.store) as Store; let repaired = false;
  store.read = input => input.reference.kind !== "lineage/transition" || repaired ? h.store.read(input)
    : Promise.resolve({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "lineage",
      condition: "Terminal lineage unavailable.", remedy: { text: "Restore its record, then retry." } } });
  expect(await readStoreWorkUnitEvidence({ ...h.input, store })).toMatchObject({ kind: "unreadable", reason: expect.stringContaining("Terminal lineage unavailable. Restore its record, then retry.") });
  repaired = true;
  expect(await readStoreWorkUnitEvidence({ ...h.input, store })).toMatchObject({ kind: "terminal", lifecycle: { state: "retired" } });
});

it("withholds conflicted terminal authority after primary removal and retries after explicit resolution", async () => {
  const h = await fixture(), remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  ok(await writer.write({ action: "put", reference: recordReferences["work-item/meta"](h.terminal.reference.owner), expected: null,
    content: renderMetaFile("ended", { owner: "andrew", state: "Active", currentWorkflow: "process-task-loop" }), placement: { kind: "active" },
    provenance: { verb: "seed-lifecycle", lifecycleAction: "create" } }));
  const exec = async () => { throw new Error("No checkout artifact applies"); };
  const executor = buildExecutorContext({ cwd: "/absent", store: writer, io: { ...createUserIOContext(), exec }, identity: "andrew",
    teamMode: false, internalTemplateDir: "/templates", projectId: async () => "project",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null } });
  expect(await runStoreAbandon({ executor }, { name: "ended", confirmed: true })).toMatchObject({ status: "abandoned" });
  ok(await h.store.sync());
  const disputed = ok(await h.store.read({ reference: h.terminal.reference })); expect(disputed.conflicts.length).toBeGreaterThan(0);
  const blocked = await readStoreWorkUnitEvidence(h.input);
  expect(blocked).toMatchObject({ kind: "unreadable", code: "subject-unresolved", reason: expect.stringMatching(/conflicts.*resolve.*retry/iu) });
  for (const reference of disputed.conflicts) {
    expect(blocked).toMatchObject({ reason: expect.stringContaining(JSON.stringify(reference)) });
    const conflict = ok(await h.store.read({ reference }));
    ok(await h.store.write({ action: "remove", reference, expected: conflict.version, resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  }
  expect(await readStoreWorkUnitEvidence(h.input)).toMatchObject({ kind: "terminal", lifecycle: { state: "retired" } });
});
