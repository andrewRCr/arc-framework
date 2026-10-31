/** Release identity resolution follows current marker claims and qualified branch links. */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, onTestFinished } from "vitest";
import { raiseNativeResolutionRefusal, resolveActiveWu, resolveOriginatingMetaPath } from "../../../src/lib/release/wu-resolution.js";
import { createProjectIdentityReader, ProjectIdentityError } from "../../../src/lib/store/project-identity.js";
import type { Store } from "../../../src/lib/store/contract.js";
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
  success(await fixture.store.push());
  const local = success(await fixture.store.read({ reference })), other = success(await remote.read({ reference }));
  success(await fixture.store.write({ action: "put", reference, expected: local.version, content, placement: { kind: "active" },
    links: branches("feat/local"), provenance: testProvenance }));
  success(await remote.write({ action: "put", reference, expected: other.version, content, placement: { kind: "active" },
    links: branches("feat/remote"), provenance: testProvenance }));
  success(await fixture.store.push());
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

async function linkedWorkUnit(prefix: string, onTestFinished: (cleanup: () => Promise<void>) => void) {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const fixture = createReferenceFixture({}, { "work-item/meta": { parser: content => ({ success: true, data: parseMetaRecord(content) }) } });
  const reference = fixture.reference("work-item/meta");
  success(await fixture.store.write({ action: "put", reference, content: makeMetaFixture(reference.owner.name, { branch: null }),
    placement: { kind: "active" }, links: { branches: [{ repository: "project-1", ref: "feat/demo", linkedAs: "created", excluded: [] }] },
    expected: null, provenance: testProvenance }));
  await writeWorktreeOwnershipMarker(cwd, { createdByArc: true, createdFor: { kind: "work-unit", name: reference.owner.name },
    spawningIdentity: "andrew", now: 0 });
  return { cwd, store: fixture.store, reference };
}

it("carries a missing project ID behind an ambiguous resolution for delivery to raise, and resolves once the clone holds it", async ({
  onTestFinished,
}) => {
  const { cwd, store } = await linkedWorkUnit("arc-release-project-", onTestFinished);
  const unseeded = createProjectIdentityReader(store);
  let repaired = false;
  const input = { cwd, store, projectId: async () => repaired ? "project-1" : unseeded() };
  const result = await resolveActiveWu(input);
  if (result.status !== "ambiguous" || result.cause === undefined) throw new Error(JSON.stringify(result));
  expect(result.cause).toBeInstanceOf(ProjectIdentityError);
  expect(result.hint).toBe(result.cause.message);
  expect(() => raiseNativeResolutionRefusal(result)).toThrow(result.cause);
  repaired = true;
  const resolved = await resolveActiveWu(input);
  expect(resolved).toMatchObject({ status: "resolved", branch: "feat/demo" });
  expect(raiseNativeResolutionRefusal(resolved)).toBe(resolved);
});

it("carries a refused primary read as the store's own refusal with the same hint, and resolves once it reads", async ({
  onTestFinished,
}) => {
  const { cwd, store, reference } = await linkedWorkUnit("arc-release-refused-", onTestFinished);
  let refusing = true;
  const refused = Object.create(store) as Store;
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [], reference,
    condition: "The work unit's primary record objects are missing.", remedy: { text: "Fetch the missing objects, then retry." } };
  // The occupancy resolver reads the claimed primary first; the branch read is the second.
  let primaryReads = 0;
  refused.read = async readInput => readInput.reference.kind === "work-item/meta" && ++primaryReads % 2 === 0 && refusing
    ? { status: "refused", refusal } : store.read(readInput);
  const input = { cwd, store: refused, projectId: async () => "project-1" };
  const result = await resolveActiveWu(input);
  if (result.status !== "ambiguous") throw new Error(JSON.stringify(result));
  expect(result).toMatchObject({ hint: `${refusal.condition} ${refusal.remedy.text}`,
    cause: { offBranch: true, refusal: { code: "state-unresolvable" } } });
  refusing = false;
  expect(await resolveActiveWu(input)).toMatchObject({ status: "resolved", branch: "feat/demo" });
});
