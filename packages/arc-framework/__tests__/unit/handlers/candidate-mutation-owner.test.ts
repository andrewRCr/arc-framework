/** A native Candidate mutation writes the generation its checkout continues, never a namesake reusing its slug. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { resolveCandidateMutationGeneration, resolveCompletedCandidateOwners, resolveCompletedCandidateWorkUnits }
  from "../../../src/handlers/candidate-mutation-owner.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { RecordReferenceSchema, recordReferences } from "../../../src/lib/store/identity.js";
import { StoreRefusalError } from "../../../src/lib/store/refusal-error.js";

async function reusedSlug() {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("example", { branch: null, state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("example");
  return { h, archived: archived.reference.owner, live: live.reference.owner };
}

it("resolves the completed generation from a free primary while a live work unit reuses its slug", async () => {
  const { h, archived, live } = await reusedSlug();
  expect(archived).not.toEqual(live);
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned")).toEqual(archived);
});

it("resolves the live generation from the work unit's own checkout", async () => {
  const { h, live } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned")).toEqual(live);
});

it("keeps an owner the invocation already selected", async () => {
  const { h, archived } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", archived)).toEqual(archived);
});

it("keeps a bound owner from a free primary only when it is a completed generation", async () => {
  const { h, archived, live } = await reusedSlug();
  await expect(resolveCandidateMutationGeneration(h.store, "example", "unowned", live)).rejects.toMatchObject({
    code: "invalid-input", condition: "The selected `example` work item is not a completed generation." });
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", archived)).toEqual(archived);
});

it("refuses a slug two completed generations share, naming both, and resolves once one is renamed", async () => {
  const h = createLifecycleHarness();
  const shipped = { branch: null, state: "Shipped", currentWorkflow: null } as const;
  const completed = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } as const;
  const first = await h.seedMeta("example", shipped, completed), second = await h.seedMeta("example", shipped, completed);
  const refused = resolveCandidateMutationGeneration(h.store, "example", "unowned");
  await expect(refused).rejects.toBeInstanceOf(StoreRefusalError);
  await expect(refused).rejects.toMatchObject({ refusal: { code: "ambiguous-match", class: "recoverable",
    candidates: [first.reference, second.reference].map(({ owner }) => recordReferences["work-item/meta"](owner)),
    remedy: { text: "Rename one of them to a free slug, then retry." } } });
  lifecycleSuccess(await h.store.write({ action: "put", expected: first.version, content: first.content, placement: completed,
    reference: RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "renamed" } }),
    provenance: { verb: "rename", lifecycleAction: "edit" } }));
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned")).toEqual(second.reference.owner);
});

it("refuses an incomplete completed inventory naming what it could not read, and resolves once it is complete", async () => {
  const { h, archived } = await reusedSlug();
  const list = h.store.list.bind(h.store), diagnostic = { kind: "malformed" as const, key: "meta-other",
    condition: "Metadata for `other` is malformed.", remedy: { text: "Repair its metadata." } };
  let incomplete = true;
  h.store.list = async input => {
    const result = await list(input);
    return incomplete && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true, diagnostics: [diagnostic] } } : result;
  };
  await expect(resolveCandidateMutationGeneration(h.store, "example", "unowned")).rejects.toMatchObject({
    code: "corrupt-state", message: expect.stringContaining(diagnostic.condition) });
  incomplete = false;
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned")).toEqual(archived);
});

it("carries the store's refusal whole when the checkout's own work unit cannot be read", async () => {
  const h = createLifecycleHarness();
  await expect(resolveCandidateMutationGeneration(h.store, "example", "owned")).rejects.toMatchObject({
    refusal: { code: "not-found" } });
  await h.seedMeta("example");
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned")).toMatchObject({ name: "example" });
});

it("keeps an in-repo completed name that is no slug in the name list, selecting no owner for it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-completed-names-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc", "completed", "2026-q4"), { recursive: true });
  const meta = renderMetaFile("example", { state: "Shipped", owner: "andrew", workClass: "Light", currentWorkflow: null });
  for (const name of ["example", "Legacy_Name"]) {
    await writeFile(join(cwd, ".arc", "completed", "2026-q4", `meta-${name}.md`), meta);
  }
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: scriptGitExec([]).exec }));
  expect([...await resolveCompletedCandidateWorkUnits(cwd, store)].sort()).toEqual(["Legacy_Name", "example"]);
  expect(await resolveCompletedCandidateOwners(cwd, store)).toEqual([{ type: "work-item", name: "example" }]);
});
