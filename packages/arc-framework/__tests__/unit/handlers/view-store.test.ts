/** Store-backed view targets preserve exact work-unit identity and lifecycle placement. */
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createViewDependencies } from "../../../src/handlers/view.js";
import { OwnerIdentitySchema, recordReferences, RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { resolveViewArtifact } from "../../../src/lib/view-artifact.js";
import { runView } from "../../../src/commands/view.js";
import { WorkUnitReadPlacementSchema } from "../../../src/lib/store/placement.js";
import { workItemArtifactPath } from "../../../src/lib/store/lifecycle-storage.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../../src/lib/errand/identity-record.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-view-store-")); folders.push(cwd);
  const h = createLifecycleHarness();
  const { exec } = scriptGitExec([{ match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] }]);
  const deps = createViewDependencies(cwd, path => readFile(path, "utf8"), exec, "alice", h.store);
  return { ...h, cwd, deps };
}

it.each(["former", "reused"] as const)("resolves a %s slug to the selected live store identity", async scenario => {
  const f = await fixture(), original = await f.seedMeta("original");
  let expected: typeof original;
  if (scenario === "former") {
    const reference = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "renamed" } });
    lifecycleSuccess(await f.store.write({ ...recordPut(original, { content: original.content.replaceAll("original", "renamed") }), reference,
      provenance: { verb: "rename", lifecycleAction: "rename" } }));
    expected = lifecycleSuccess(await f.store.read({ reference }));
  } else {
    lifecycleSuccess(await f.store.write({ ...recordPut(original, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
    expected = await f.seedMeta("original");
  }
  const result = await f.deps.resolveExplicitTarget({ cwd: f.cwd, slug: "original" });
  expect(result).toMatchObject({ status: "resolved", slug: expected.reference.owner.name, location: "active",
    placement: { kind: "active", scope: { kind: "project" } }, artifactSource: { kind: "store", reference: expected.reference } });
  if (result.status === "resolved") expect(result.metaPath).toBe(join(f.cwd, `.arc/active/meta-${expected.reference.owner.name}.md`));
});


it("opens a completed work unit's projected meta by default", async () => {
  const f = await fixture(), meta = await f.seedMeta("archived", { state: "Shipped", currentWorkflow: null });
  lifecycleSuccess(await f.store.write({ ...recordPut(meta, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const archived = lifecycleSuccess(await f.store.read({ reference: meta.reference }));
  const placement = WorkUnitReadPlacementSchema.parse(archived.placement);
  if (placement.kind !== "completed") throw new Error("Expected completed fixture");
  const path = join(f.cwd, workItemArtifactPath("archived", "meta", placement, null));
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, archived.content);
  const result = await runView({ cwd: f.cwd, project: false, identity: "alice", forSlug: "archived", path: true }, {
    resolveArtifact: input => resolveViewArtifact(input, f.deps), readFile: f.deps.readFile });
  expect(result).toEqual({ stdout: `${path}\n`, stderr: "", exitCode: 0 });
});

it("preserves ambiguous completed lookup evidence and the projected-file route", async () => {
  const f = await fixture();
  for (let index = 0; index < 2; index++) {
    const meta = await f.seedMeta("archived", { state: "Shipped", currentWorkflow: null });
    lifecycleSuccess(await f.store.write({ ...recordPut(meta, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  }
  const lookup = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("archived") });
  expect(lookup.status).toBe("refused");
  if (lookup.status !== "refused") throw new Error("Expected ambiguous fixture");
  const artifact = await resolveViewArtifact({ cwd: f.cwd, project: false, identity: "alice", forSlug: "archived", kind: "meta" }, f.deps);
  expect(artifact.status).toBe("error");
  if (artifact.status !== "error") throw new Error("Expected ambiguous target refusal");
  expect(artifact.message).toContain(lookup.refusal.condition);
  expect(artifact.message).toContain(lookup.refusal.remedy.text);
  expect(artifact.message).toContain("completed/");
});


it.each(["missing", "errand"] as const)("keeps a %s subject on the ordinary unknown-work-unit refusal", async scenario => {
  const f = await fixture();
  if (scenario === "errand") {
    const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "fix-it", owner: "alice", intent: "Fix it",
      claimId: "a".repeat(32), branch: "chore/fix-it", origin: "description", originEntry: null, state: "open", savedHead: null,
      changeRequest: null, createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
    await f.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "fix-it" })), serializeTransientIdentityRecord(record), { kind: "active" });
  }
  const result = await runView({ cwd: f.cwd, project: false, identity: "alice", kind: "meta", forSlug: "fix-it" }, {
    resolveArtifact: input => resolveViewArtifact(input, f.deps), readFile: f.deps.readFile });
  expect(result).toEqual({ stdout: "", stderr: 'Work unit "fix-it" is unavailable in this checkout.\n', exitCode: 1 });
});

it("retains malformed metadata's repair evidence and resolves after repair", async () => {
  const f = await fixture(), meta = await f.seedMeta("damaged"), read = f.store.read.bind(f.store);
  f.store.read = async () => ({ status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: meta.reference,
    rule: "lifecycle.meta-fields", condition: "Metadata fields are damaged.", remedy: { text: "Repair metadata fields and retry." } } });
  const artifact = await resolveViewArtifact({ cwd: f.cwd, project: false, identity: "alice", forSlug: "damaged", kind: "meta" }, f.deps);
  expect(artifact).toMatchObject({ status: "error", message: expect.stringContaining("Metadata fields are damaged. Repair metadata fields and retry.") });
  f.store.read = read;
  expect(await f.deps.resolveExplicitTarget({ cwd: f.cwd, slug: "damaged" })).toMatchObject({ status: "resolved", artifactSource: { kind: "store", reference: meta.reference } });
});
