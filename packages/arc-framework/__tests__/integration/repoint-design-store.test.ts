/** Finalizing a spec over the ref backend retires the work unit's draft in the same write that repoints its design. */
import { describe, expect, it, onTestFinished } from "vitest";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { runRepointDesign } from "../../src/lib/work-unit/verbs/repoint-design.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedStore, type SeedRecord } from "../helpers/store/seed-store.js";
import { success } from "../helpers/store/suite-tools.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const identity = SlugSchema.parse("test-user");
const name = "draft-retire";
const owner = { type: "work-item", name } as const;
const meta = RecordReferenceSchema.parse({ kind: "work-item/meta", owner });
const draft = RecordReferenceSchema.parse({ kind: "work-item/draft", owner });

async function seededRepository(withDraft: boolean): Promise<{ root: string; store: ReturnType<typeof selectStore> }> {
  const root = await createTempRepoCore({ prefix: "arc-repoint-design-" });
  onTestFinished(() => removeGitBackedDir(root));
  const records: SeedRecord[] = [{ reference: meta, placement: { kind: "active" },
    content: makeMetaFixture(name, { state: "Planning", owner: identity, currentWorkflow: "create-spec",
      design: withDraft ? [`draft-${name}.md`] : [] }) }];
  if (withDraft) records.push({ reference: draft, content: `# Draft: ${name}\n` });
  await seedStore(root, identity, records);
  return { root, store: selectStore(createDefaultStorePorts({ checkoutRoot: root }), {}) };
}

async function finalize(root: string, store: ReturnType<typeof selectStore>) {
  return runRepointDesign({ cwd: root, store, writeDesignField: () => Promise.reject(new Error("tracked write")) },
    { name, event: "spec-finalized" });
}

describe("repoint-design spec-finalized over the ref backend", () => {
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
});
