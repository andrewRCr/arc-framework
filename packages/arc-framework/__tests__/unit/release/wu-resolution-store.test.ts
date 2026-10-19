/** Release identity resolution follows current marker claims and qualified branch links. */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { resolveActiveWu, resolveOriginatingMetaPath } from "../../../src/lib/release/wu-resolution.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { writeWorktreeOwnershipMarker } from "../../../src/lib/git/worktree-marker.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { success, testProvenance } from "../../helpers/store/suite-tools.js";

it("resolves a marker's work unit and its qualified branch link without an active file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-release-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: content => ({ success: true, data: parseMetaRecord(content) }) } });
  const reference = fixture.reference("work-item/meta");
  success(await fixture.store.write({ action: "put", reference, content: makeMetaFixture(reference.owner.name, { branch: null }),
    placement: { kind: "active" }, links: { branches: [{ repository: "project-1", ref: "feat/demo", linkedAs: "created", excluded: [] }] }, expected: null, provenance: testProvenance }));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: reference.owner.name }, spawningIdentity: "andrew", now: 0 });
  const store = fixture.store;
  expect(await resolveActiveWu({ cwd, store, projectId: async () => "project-1" })).toEqual({ status: "resolved",
    name: reference.owner.name, path: `.arc/active/meta-${reference.owner.name}.md`, branch: "feat/demo" });
  expect(await resolveOriginatingMetaPath(cwd, store, async () => "project-1")).toBe(`.arc/active/meta-${reference.owner.name}.md`);
});

it("withholds a disputed primary's branch until an explicit resolution", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-release-conflict-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: content => ({ success: true, data: parseMetaRecord(content) }) } });
  const reference = fixture.reference("work-item/meta"), content = makeMetaFixture(reference.owner.name, { branch: null });
  const branches = (ref: string) => ({ branches: [{ repository: "project-1", ref, linkedAs: "created" as const, excluded: [] }] });
  success(await fixture.store.write({ action: "put", reference, expected: null, content, placement: { kind: "active" },
    links: branches("feat/base"), provenance: testProvenance }));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: reference.owner.name }, spawningIdentity: "andrew", now: 0 });
  const remote = fixture.remote(true);
  if (remote === undefined) throw new Error("Expected a remote writer");
  success(await fixture.store.sync());
  const local = success(await fixture.store.read({ reference })), other = success(await remote.read({ reference }));
  success(await fixture.store.write({ action: "put", reference, expected: local.version, content, placement: { kind: "active" },
    links: branches("feat/local"), provenance: testProvenance }));
  success(await remote.write({ action: "put", reference, expected: other.version, content, placement: { kind: "active" },
    links: branches("feat/remote"), provenance: testProvenance }));
  success(await fixture.store.sync());
  const disputed = success(await fixture.store.read({ reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  const input = { cwd, store: fixture.store, projectId: async () => "project-1" };
  const result = await resolveActiveWu(input);
  expect(result).toMatchObject({ status: "ambiguous" });
  if (result.status !== "ambiguous") throw new Error("Disputed branch authority must be withheld");
  for (const conflict of disputed.conflicts) expect(result.hint).toContain(JSON.stringify(conflict));
  expect(result.hint).toMatch(/resolve.*retry/iu);
  expect(await resolveOriginatingMetaPath(cwd, fixture.store, input.projectId)).toBeUndefined();
  success(await fixture.store.write({ action: "put", reference, expected: disputed.version, content, placement: { kind: "active" },
    links: branches("feat/local"), resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await resolveActiveWu(input)).toMatchObject({ status: "resolved", branch: "feat/local" });
});
