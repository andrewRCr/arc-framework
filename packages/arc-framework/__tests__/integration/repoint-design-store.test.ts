/** Finalizing a spec over the ref backend retires the work unit's draft in the same write that repoints its design. */
import { readFile } from "node:fs/promises";
import { describe, expect, it, onTestFinished } from "vitest";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { runPause, runResumePaused } from "../../src/lib/work-unit/verbs/pause-handover.js";
import { runRepointDesign } from "../../src/lib/work-unit/verbs/repoint-design.js";
import { runSetStage } from "../../src/lib/work-unit/verbs/set-stage.js";
import { makeGitExec } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { removeStoreRecord, seedStore, type SeedRecord } from "../helpers/store/seed-store.js";
import { success } from "../helpers/store/suite-tools.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const identity = SlugSchema.parse("test-user");
const name = "draft-retire";
const owner = { type: "work-item", name } as const;
const meta = RecordReferenceSchema.parse({ kind: "work-item/meta", owner });
const draft = RecordReferenceSchema.parse({ kind: "work-item/draft", owner });
const spec = RecordReferenceSchema.parse({ kind: "work-item/spec", owner });
const specRecord = { reference: spec, content: `# Spec (\`brief\`): ${name}\n` };

async function seededRepository(withDraft: boolean, withSpec = true): Promise<{ root: string; store: ReturnType<typeof selectStore> }> {
  const root = await createTempRepoCore({ prefix: "arc-repoint-design-" });
  onTestFinished(() => removeGitBackedDir(root));
  const records: SeedRecord[] = [{ reference: meta, placement: { kind: "active" },
    content: makeMetaFixture(name, { state: "Planning", owner: identity, currentWorkflow: "create-spec",
      design: withDraft ? [`draft-${name}.md`] : [] }) }];
  if (withDraft) records.push({ reference: draft, content: `# Draft: ${name}\n` });
  if (withSpec) records.push(specRecord);
  await seedStore(root, identity, records);
  return { root, store: selectStore(createDefaultStorePorts({ checkoutRoot: root }), {}) };
}

async function finalize(root: string, store: ReturnType<typeof selectStore>) {
  const selected = success(await store.read({ reference: meta }));
  return runRepointDesign({ cwd: root, store, writeDesignField: () => Promise.reject(new Error("tracked write")) },
    { owner: selected.reference.owner, event: "spec-finalized" });
}

describe("repoint-design spec-finalized over the ref backend", () => {
  it("distinguishes spec finalization from the stage command in the pause workflow", async () => {
    const workflow = await readFile(
      new URL("../../arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md", import.meta.url), "utf8",
    );
    const intro = workflow.split("## Steps")[0];
    expect(intro).toMatch(/`arc set-stage`[^.]*\brefuses\b[^.]*\bresumes\b/u);
    expect(intro).toMatch(/`arc repoint-design[^\x60]* spec-finalized`[^.]*\b(?:advances?|advance)\b[^.]*\bpause\b/u);
  });
  it("removes the draft record in the write that points the design at the spec", async () => {
    const { root, store } = await seededRepository(true);

    const result = await finalize(root, store);

    expect(result).toMatchObject({ status: "ok", design: `spec-${name}.md`, removedDraft: `draft-${name}.md` });
    expect(await store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await store.read({ reference: meta })).fields).toMatchObject({ design: [`spec-${name}.md`] });
  });

  it("repoints a work unit that never drafted without removing anything", async () => {
    const { root, store } = await seededRepository(false);

    const result = await finalize(root, store);

    expect(result).toMatchObject({ status: "ok", design: `spec-${name}.md` });
    expect(result).not.toHaveProperty("removedDraft");
  });

  it("refuses when the first draft lands before the batch and retires it on retry", async () => {
    const { root, store } = await seededRepository(false);
    const before = success(await store.read({ reference: meta }));
    const content = `# Draft: ${name}\n`;
    const result = await finalize(root, { ...store, batch: async input => {
      await seedStore(root, identity, [{ reference: draft, content }]);
      return store.batch(input);
    } });

    expect(success(await store.read({ reference: draft })).content).toBe(content);
    expect({ status: result.status, meta: success(await store.read({ reference: meta })) }).toEqual({
      status: "rejected", meta: before,
    });
    expect(result).toMatchObject({ refusal: { code: "version-conflict", remedy: { argv: ["arc", "status", "--json"] } } });

    expect(await finalize(root, store)).toMatchObject({ status: "ok", removedDraft: `draft-${name}.md` });
    expect(await store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("preserves the draft and stage until a missing spec is saved", async () => {
    const { root, store } = await seededRepository(true, false);
    const before = success(await store.read({ reference: meta }));
    const heldDraft = success(await store.read({ reference: draft }));

    const result = await finalize(root, store);

    expect(result.status).toBe("rejected");
    expect(result).toMatchObject({ refusal: { code: "not-found", remedy: { argv: ["arc", "save"] } } });
    expect(success(await store.read({ reference: draft }))).toEqual(heldDraft);
    expect(success(await store.read({ reference: meta }))).toEqual(before);
    await seedStore(root, identity, [specRecord]);
    expect(await finalize(root, store)).toMatchObject({ status: "ok", removedDraft: `draft-${name}.md` });
    expect(success(await store.read({ reference: meta })).fields).toMatchObject({
      design: [`spec-${name}.md`], currentWorkflow: "generate-tasks",
    });
  });

  it("preserves the draft and stage when the saved spec disappears before the batch", async () => {
    const { root, store } = await seededRepository(true);
    const before = success(await store.read({ reference: meta }));
    const heldDraft = success(await store.read({ reference: draft }));
    const result = await finalize(root, { ...store, batch: async input => {
      await removeStoreRecord(root, identity, spec);
      return store.batch(input);
    } });

    expect(result).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
    expect(success(await store.read({ reference: meta }))).toEqual(before);
    expect(success(await store.read({ reference: draft }))).toEqual(heldDraft);
    await seedStore(root, identity, [specRecord]);
    expect(await finalize(root, store)).toMatchObject({ status: "ok", removedDraft: `draft-${name}.md` });
  });

  it("retires the draft while paused and requires resume for the following set-stage", async () => {
    const { root, store } = await seededRepository(true);
    const ctx = { cwd: root, store, exec: makeGitExec(root), baseBranch: "main" };
    const trackedWrite = () => Promise.reject(new Error("tracked write"));
    const advance = () => runSetStage({ ...ctx, writeCurrentWorkflowField: trackedWrite, writeSoftFields: trackedWrite },
      { name, stage: "generate-tasks", advance: true });
    expect(await runPause(ctx, { name, identity, reason: "Awaiting feedback." })).toMatchObject({ status: "paused" });

    expect(await finalize(root, store)).toMatchObject({ status: "ok", removedDraft: `draft-${name}.md` });
    expect(await advance()).toMatchObject({ status: "rejected", remedy: { argv: ["arc", "resume", name] } });
    expect(success(await store.read({ reference: meta })).fields).toMatchObject({
      state: "Planning", design: [`spec-${name}.md`], currentWorkflow: "generate-tasks",
      nextAction: "[begin current workflow]", pause: { reason: "Awaiting feedback." },
    });
    expect(await store.read({ reference: draft })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await store.read({ reference: spec })).toMatchObject({ status: "ok" });

    expect(await runResumePaused(ctx, { name })).toMatchObject({ status: "resumed" });
    expect(await advance()).toMatchObject({ status: "ok" });
  });
});
