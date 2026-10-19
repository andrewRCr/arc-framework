/** Store-backed roster includes every registration, including detached work. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished, vi } from "vitest";
import { runWorktreeRoster, filterRosterByIdentity } from "../../../src/lib/git/worktree-roster.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { success, testProvenance } from "../../helpers/store/suite-tools.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";

it("preserves primary read refusal repair guidance and reads the owner after repair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-roster-refusal-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness(); await h.seedMeta("demo", { owner: "andrew" });
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "andrew", now: 0 });
  const roster = () => runWorktreeRoster({ cwd, store: h.store,
    exec: async () => ({ stdout: [`worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "detached", "", ""].join("\0") }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No checkout metadata"); } } });
  const read = vi.spyOn(h.store, "read").mockImplementationOnce(async input => ({ status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference: input.reference, rule: "fixture",
    condition: "Primary record cannot be decoded.", remedy: { text: "Repair the primary encoding, then retry." },
  } }));
  try {
    const failed = await roster();
    expect(failed.entries).toEqual([{ worktreePath: cwd, workUnit: "demo" }]);
    expect(failed.warnings.join(" ")).toContain("Primary record cannot be decoded.");
    expect(failed.warnings.join(" ")).toContain("Repair the primary encoding, then retry.");
  } finally { read.mockRestore(); }
  expect(await roster()).toMatchObject({ warnings: [], entries: [{ workUnit: "demo", identity: "andrew" }] });
});

it("withholds disputed primary fields after sync while retaining the marked checkout, then reads its resolved owner", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-roster-conflicts-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo", { state: "Planning", currentWorkflow: "draft-design", owner: "original" });
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference: meta.reference })), other = lifecycleSuccess(await writer.read({ reference: meta.reference }));
  const content = (owner: string) => renderMetaFile("demo", { state: "Planning", currentWorkflow: "draft-design", owner });
  const provenance = { verb: "race-owner", lifecycleAction: "race-owner" };
  lifecycleSuccess(await h.store.write({ action: "put", reference: meta.reference, expected: local.version, placement: { kind: "active" }, content: content("andrew"), provenance }));
  lifecycleSuccess(await writer.write({ action: "put", reference: meta.reference, expected: other.version, placement: { kind: "active" }, content: content("another"), provenance }));
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference: meta.reference })); expect(disputed.conflicts).toHaveLength(1);
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "andrew", now: 0 });
  const readRoster = () => runWorktreeRoster({ cwd, store: h.store,
    exec: async () => ({ stdout: [`worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "detached", "", ""].join("\0") }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No checkout metadata"); } } });
  const roster = await readRoster();
  expect(roster.entries).toEqual([{ worktreePath: cwd, workUnit: "demo" }]);
  expect(filterRosterByIdentity(roster, { identity: "andrew", teamMode: true }).entries).toEqual(roster.entries);
  const warning = roster.warnings.join(" ");
  for (const conflict of disputed.conflicts) expect(warning).toContain(JSON.stringify(conflict));
  expect(warning).toMatch(/resolve.*retry/iu);
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version, resolves: disputed.conflicts,
    content: content("andrew"), placement: { kind: "active" }, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference })).conflicts).toEqual([]);
  const repaired = await readRoster();
  expect(repaired).toMatchObject({ warnings: [], entries: [{ workUnit: "demo", identity: "andrew", state: "Planning" }] });
  expect(filterRosterByIdentity(repaired, { identity: "andrew", teamMode: true }).entries).toHaveLength(1);
  expect(filterRosterByIdentity(repaired, { identity: "another", teamMode: true }).entries).toEqual([]);
});

it("lists detached marked Planning work with its store owner while no checkout has active metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-roster-store-"));
  const holder = join(cwd, "planning");
  await mkdir(holder);
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const fixture = createReferenceFixture();
  const reference = fixture.reference("work-item/meta");
  const fields = parseMetaRecord(makeMetaFixture(reference.owner.name, { state: "Planning", owner: "andrew" }));
  success(await fixture.store.write({ action: "put", reference, content: JSON.stringify(fields), expected: null,
    placement: { kind: "active" }, provenance: testProvenance }));
  await writeWorktreeOwnershipMarker(holder, { createdByArc: true, createdFor: { kind: "work-unit", name: reference.owner.name }, spawningIdentity: "andrew", now: 0 });
  const roster = await runWorktreeRoster({ cwd, store: fixture.store,
    exec: async () => ({ stdout: [`worktree ${cwd}`, `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "", "",
      `worktree ${holder}`, `HEAD ${"b".repeat(40)}`, "detached", "", ""].join("\0") }),
    fs: { readdir: async () => [], readFile: async () => { throw new Error("No checkout metadata"); } } });
  expect(roster.entries).toEqual([{ worktreePath: cwd, branch: "main" }, { worktreePath: holder,
    workUnit: reference.owner.name, placement: "active", identity: "andrew", state: "Planning", class: fields.workClass, priority: fields.priority }]);
  expect(filterRosterByIdentity(roster, { identity: "someone-else", teamMode: true }).entries).toEqual([{ worktreePath: cwd, branch: "main" }]);
});
