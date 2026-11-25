/** Activating over the ref backend removes a superseded draft in the write that flips the work unit to Active. */
import { afterEach, expect, it, vi } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runActivate, type ActivateContext } from "../../src/lib/work-unit/verbs/activate-deactivate.js";
import { runRepointDesign } from "../../src/lib/work-unit/verbs/repoint-design.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";
import { createDefaultRefStorePorts, createRefStore, OwnerIdentitySchema, recordReferences, type Store } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await cleanupTempDir(root); root = undefined; });
const ACTIVATION_TIMEOUT_MS = 30_000;
const identity = SlugSchema.parse("test-user");
const draftContent = "# Draft: example\n";
const concurrentDraft = "# Draft: example\n\nEdited elsewhere.\n";

function openPersistedStore(checkoutRoot: string): Store {
  const ports = createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null });
  return createRefStore({ ...ports, identity: async () => identity });
}

async function planningUnit(options: { design: string[]; currentWorkflow: string; withDraft: boolean; withDependency?: boolean }) {
  const checkoutRoot = await createTempRepo();
  root = checkoutRoot;
  const exec = makeGitExec(checkoutRoot);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const reopen = () => openPersistedStore(checkoutRoot);
  const store = reopen();
  const seedMeta = async (slug: string, fields: Parameters<typeof renderMetaFile>[1]) => {
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: slug }));
    const written = lifecycleSuccess(await store.write({ action: "put", reference, expected: null, placement: { kind: "active" },
      content: renderMetaFile(slug, { owner: identity, workClass: "Light", ...fields }),
      provenance: { verb: "fixture", lifecycleAction: "seed" } }));
    return written.reference;
  };
  if (options.withDependency) await seedMeta("done", { state: "Integrating", currentWorkflow: "integrate-work-unit" });
  const meta = await seedMeta("example", { state: "Planning", currentWorkflow: options.currentWorkflow, design: options.design,
    dependsOn: options.withDependency ? ["done"] : [] });
  const draft = recordReferences["work-item/draft"](meta.owner);
  const writeDraft = async (writer: Store, content: string, expected: Parameters<Store["write"]>[0]["expected"] = null) => {
    lifecycleSuccess(await writer.write({ action: "put", reference: draft, expected, content,
      provenance: { verb: "fixture", lifecycleAction: "edit" } }));
  };
  if (options.withDraft) await writeDraft(store, draftContent);
  const unsupported = async (): Promise<never> => { throw new Error("Unexpected in-repo adapter"); };
  const context: ActivateContext = { cwd: checkoutRoot, store, exec, projectId: async () => "repo",
    indexFs: { readdir: unsupported, readFile: unsupported }, setPhase: unsupported, relocateArtifacts: unsupported,
    reconcileBranch: unsupported, reconcileWorkUnitWorktree: unsupported, writeSoftFields: unsupported,
    writeBranchField: unsupported, writeCurrentWorkflowField: unsupported, writeDesignField: unsupported,
    currentWuReconcile: buildStoreCurrentWuReconcile(checkoutRoot, store) };
  const params = { name: "example", toBranch: "feat/example", baseBranch: "main", nextAction: "Begin work" };
  return { store, meta, draft, exec, context, params, reopen, writeDraft };
}

it("removes a draft the design no longer names in the activation write", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: true });

  const result = await runActivate(h.context, h.params);

  expect(result).toMatchObject({ status: "activated", removedDraft: "draft-example.md" });
  const persisted = h.reopen();
  expect(lifecycleSuccess(await persisted.read({ reference: h.meta })).fields).toMatchObject({ state: "Active", design: ["spec-example.md"] });
  expect(await persisted.read({ reference: h.draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, ACTIVATION_TIMEOUT_MS);

it("keeps a draft the design still names", async () => {
  const h = await planningUnit({ design: ["draft-example.md"], currentWorkflow: "draft-design", withDraft: true });

  const result = await runActivate(h.context, h.params);

  expect(result).toMatchObject({ status: "activated" });
  expect(result).not.toHaveProperty("removedDraft");
  expect(lifecycleSuccess(await h.reopen().read({ reference: h.draft })).content).toBe(draftContent);
}, ACTIVATION_TIMEOUT_MS);

it("keeps the draft when another writer selects it during activation", async () => {
  const h = await planningUnit({ design: [], currentWorkflow: "draft-design", withDraft: true });
  const reconcile = h.context.currentWuReconcile;
  const result = await runActivate({ ...h.context, currentWuReconcile: { ...reconcile, prepare: async (op) => {
    const repoint = await runRepointDesign({ ...h.context, store: h.reopen() }, { owner: h.meta.owner, event: "draft-created" });
    expect(repoint).toMatchObject({ status: "ok", design: "draft-example.md" });
    return reconcile.prepare(op);
  } } }, h.params);

  const persisted = h.reopen();
  expect(result.status).toMatch(/^(activated|rejected)$/u);
  expect(lifecycleSuccess(await persisted.read({ reference: h.meta })).fields).toMatchObject({
    state: result.status === "activated" ? "Active" : "Planning", design: ["draft-example.md"],
  });
  const selected = await persisted.read({ reference: h.draft });
  expect(selected.status === "ok" ? selected.result.content : selected.refusal.code).toBe(draftContent);
}, ACTIVATION_TIMEOUT_MS);

it("activates a work unit with no draft without removing anything", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: false });

  const result = await runActivate(h.context, h.params);

  expect(result).toMatchObject({ status: "activated" });
  expect(result).not.toHaveProperty("removedDraft");
}, ACTIVATION_TIMEOUT_MS);

it("cannot commit Active with an undesignated draft created just before the activation batch", async () => {
  const h = await planningUnit({ design: [], currentWorkflow: "draft-design", withDraft: false });
  const batch = h.store.batch.bind(h.store);
  const activationBatch = vi.spyOn(h.store, "batch").mockImplementation(async (input) => {
    if (input.provenance.verb === "activate") {
      activationBatch.mockRestore();
      await h.writeDraft(h.reopen(), concurrentDraft);
    }
    return batch(input);
  });

  const result = await runActivate(h.context, h.params);

  const persisted = h.reopen();
  const saved = await persisted.read({ reference: h.draft });
  if (saved.status === "ok") {
    expect(saved.result.content).toBe(concurrentDraft);
    expect(result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict",
      remedy: { text: expect.stringContaining("arc activate example") } } });
    expect(lifecycleSuccess(await persisted.read({ reference: h.meta })).fields).toMatchObject({ state: "Planning", design: [] });
    expect(await runActivate(h.context, h.params)).toMatchObject({ status: "activated", removedDraft: "draft-example.md" });
  } else {
    expect(saved.refusal.code).toBe("not-found");
    expect(result).toMatchObject({ status: "activated" });
  }
  expect(lifecycleSuccess(await persisted.read({ reference: h.meta })).fields).toMatchObject({ state: "Active", design: [] });
  expect(await persisted.read({ reference: h.draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, ACTIVATION_TIMEOUT_MS);

it("refuses the whole activation when the draft changes after reconciliation captures it", async () => {
  const h = await planningUnit({ design: ["spec-example.md"], currentWorkflow: "generate-tasks", withDraft: true, withDependency: true });
  const reconcile = h.context.currentWuReconcile;
  const prepare = reconcile.prepare.bind(reconcile);
  vi.spyOn(reconcile, "prepare").mockImplementationOnce(async (op) => {
    const result = await prepare(op);
    const writer = h.reopen();
    const draft = lifecycleSuccess(await writer.read({ reference: h.draft }));
    await h.writeDraft(writer, concurrentDraft, draft.version);
    return result;
  });

  const result = await runActivate(h.context, h.params);

  expect(result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict",
    remedy: { text: expect.stringContaining("arc activate example") } } });
  expect((await h.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("main");
  const persisted = h.reopen();
  expect({ meta: lifecycleSuccess(await persisted.read({ reference: h.meta })).fields,
    draft: lifecycleSuccess(await persisted.read({ reference: h.draft })).content }).toMatchObject({
    meta: { state: "Planning", design: ["spec-example.md"], dependsOn: ["done"] },
    draft: concurrentDraft,
  });
  expect(await runActivate(h.context, h.params)).toMatchObject({ status: "activated", removedDraft: "draft-example.md" });
  expect(lifecycleSuccess(await persisted.read({ reference: h.meta })).fields).toMatchObject({ state: "Active", dependsOn: [] });
  expect(await persisted.read({ reference: h.draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, ACTIVATION_TIMEOUT_MS);
