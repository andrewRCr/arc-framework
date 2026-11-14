/** A prepared store write lands only if preparing it against the store it lands on would write the same. */
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createWriteBackFixture } from "../helpers/store/projection/write-back-fixture.js";
import { success, seed, fixtureRenameProvenance } from "../helpers/store/suite-tools.js";
import { cohortDoc } from "../helpers/store/cohort-rule-input.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { dryRun, runFenceCase, type FenceOutcome, type FenceWriter } from "../helpers/store/fence-harness.js";
import { archiveWriter, editWriter, runFenceOverRepository } from "../helpers/store/fence-repository.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { recordReferences, OwnerIdentitySchema, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { prepareWriteBack } from "../../src/lib/store/projection/write-back.js";
import { prepareIndexedProjectionSubmission } from "../../src/lib/store/projection/submission.js";
import { writeMetaCohort, writeMetaTitle } from "../../src/lib/store/kinds/meta/writers.js";
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreRecord } from "../../src/lib/store/read.js";

const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
const cohort = (name: string) => recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
const workUnit = (name: string) => recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name }));
const changeProvenance = { verb: "fence-change", lifecycleAction: "edit" } as const;
const fixtureFor = (backend: "reference" | "ref") => backend === "reference"
  ? Promise.resolve(createReferenceFixture(ENTRY_CONFIGS, registry)) : createRefFixture(registry);

/** Rewrite one stored record by a verb, as a concurrent writer would between preparation and the batch. */
async function rewrite(store: Store, record: StoreRecord, edit: (content: string) => string): Promise<void> {
  const current = success(await store.read({ reference: record.reference }));
  success(await store.write({ ...recordPut(current, { content: edit(current.content) }), provenance: changeProvenance }));
}

async function renameWorkUnit(store: Store, record: StoreRecord, name: string): Promise<void> {
  const current = success(await store.read({ reference: record.reference }));
  const reference = RecordReferenceSchema.parse({ ...current.reference, owner: { ...current.reference.owner, name } });
  success(await store.write({ ...recordPut(current, { content: writeMetaTitle(current.content, SlugSchema.parse(name)) }), reference,
    provenance: fixtureRenameProvenance }));
}

/** A personal document no writer here reads. */
async function writeUnrelated(store: Store): Promise<void> {
  const reference = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }), "scratch/fence-unrelated.md");
  success(await store.write({ action: "put", reference, expected: null, content: "Unrelated.\n", provenance: changeProvenance }));
}
const note = (content: string) => `${content}\nConcurrent note.\n`;
const readsOf = async (store: Store, writer: FenceWriter) => (await dryRun(store, writer)).reads.map(read => `${read.operation} ${read.target}`);

/** Admitted, or refused and then a fresh run that landed, refused, or stopped before its batch with the named result. */
type Expected = "admitted" | "ok" | "refused" | "clashed" | "held";
function expectOutcome(outcome: FenceOutcome, expected: Expected): void {
  if (expected === "admitted") { expect(outcome).toEqual({ kind: "admitted" }); return; }
  if (outcome.kind !== "refused") throw new Error(`Expected a refusal, and the batch was admitted.`);
  if (expected === "ok" || expected === "refused") expect(outcome.retried.status).toBe(expected);
  else expect(outcome.retried).toMatchObject({ status: "unprepared", returned: { kind: expected } });
}

describe.each(["reference", "ref"] as const)("the fence over %s", backend => {
  async function takeInFixture() {
    const f = await fixtureFor(backend);
    for (const [name, parent] of [["parent", null], ["other", null], ["child", "parent"]] as const) await seed(f, cohort(name), cohortDoc(name, parent).content);
    const h = await createWriteBackFixture({ fixture: f, kind: "work-item/meta" });
    const subject = success(await f.store.read({ reference: h.entry.reference }));
    const unrelated = await seed(f, workUnit("unrelated"), makeMetaFixture("unrelated", { owner: "test-user" }));
    await h.edit(`${writeMetaCohort(subject.content, "parent/child")}\nAuthored membership note.\n`);
    const writer = (await editWriterFor(h)).writer;
    return { f, h, subject, unrelated, writer };
  }
  async function editWriterFor(h: Awaited<ReturnType<typeof createWriteBackFixture>>): Promise<{ writer: FenceWriter }> {
    return { writer: { name: "take-in", run: async store => {
      const context = { ...h.context, store };
      const ready = await prepareWriteBack(context, h.request);
      if (ready.kind !== "ready") return ready;
      const prepared = await prepareIndexedProjectionSubmission(context, h.request, ready);
      return prepared.status === "ok" ? store.batch(prepared.result.batch) : prepared;
    } } };
  }

  it("takes in a work unit's edit after reading its record, each cohort on its path, and its slug", async () => {
    const { h, writer, f } = await takeInFixture();
    try {
      expect(await readsOf(f.store, writer)).toEqual([
        `read work-item/meta:${h.entry.reference.owner.name}`, "read cohort/document:child", "read cohort/document:parent",
        `lookup ${h.entry.reference.owner.name}`]);
    } finally { await h.dispose(); }
  });

  it.each([
    ["the edited record", "clashed"], ["the work unit's name", "ok"], ["the cohort's Parent", "held"], ["the parent cohort", "ok"],
    ["an unrelated record", "admitted"],
  ] as const)("holds a take-in to fresh preparation when %s changes", async (family, expected) => {
    const { f, h, subject, unrelated, writer } = await takeInFixture();
    try {
      expectOutcome(await runFenceCase(f.store, writer, async store => {
        if (family === "the edited record") await rewrite(store, subject, note);
        else if (family === "the work unit's name") await renameWorkUnit(store, subject, "renamed-unit");
        else if (family === "the cohort's Parent") await rewrite(store, success(await store.read({ reference: cohort("child") })),
          () => cohortDoc("child", "other").content);
        else if (family === "the parent cohort") await rewrite(store, success(await store.read({ reference: cohort("parent") })), note);
        else await rewrite(store, unrelated, note);
      }), expected);
    } finally { await h.dispose(); }
  });

  async function closureFixture() {
    const f = await fixtureFor(backend);
    f.identity("test-user");
    const group = await seed(f, cohort("group"), `${cohortDoc("group").content}\n## Members\n\n### \`member\`\n`);
    const member = await seed(f, workUnit("member"), makeMetaFixture("member", { owner: "test-user", cohort: "group" }));
    const outside = await seed(f, workUnit("outside"), makeMetaFixture("outside", { owner: "test-user" }));
    const { writer, dispose } = await editWriter(f.store, { kind: "edit", reference: group.reference,
      edit: content => `${content}\nThe register row closes.\n` }, "test-user");
    return { f, group, member, outside, writer, dispose };
  }

  it("takes in a cohort record's edit after reading that record and every work unit's membership", async () => {
    const { f, writer, dispose } = await closureFixture();
    try {
      expect((await readsOf(f.store, writer)).sort()).toEqual(["list work-item/meta", "read cohort/document:group", "read work-item/meta:member",
        "read work-item/meta:outside"]);
    } finally { await dispose(); }
  });

  it.each([
    ["the cohort record", "ok"], ["a member leaving the cohort", "held"], ["a work unit outside the cohort", "ok"], ["an unrelated record", "admitted"],
  ] as const)("holds a cohort record's edit to fresh preparation when %s changes", async (family, expected) => {
    const { f, group, member, outside, writer, dispose } = await closureFixture();
    try {
      expectOutcome(await runFenceCase(f.store, writer, async store => {
        if (family === "the cohort record") await rewrite(store, group, note);
        else if (family === "a member leaving the cohort") await rewrite(store, member, content => writeMetaCohort(content, null));
        else if (family === "a work unit outside the cohort") await rewrite(store, outside, note);
        else await writeUnrelated(store);
      }), expected);
    } finally { await dispose(); }
  });

  async function archiveFixture(subcohort = false) {
    const f = await fixtureFor(backend);
    f.identity("test-user");
    const cohorts = [["parent", null], ["child", "parent"], ...(subcohort ? [["other", "parent"] as const] : [])] as const;
    for (const [name, parent] of cohorts) await seed(f, cohort(name), cohortDoc(name, parent).content);
    const meta = (name: string, path: string | null) => seed(f, workUnit(name),
      makeMetaFixture(name, { owner: "test-user", ...(path === null ? {} : { cohort: path }) }));
    const subject = await meta("subject", "parent/child"), sibling = await meta("sibling", "parent"), unrelated = await meta("unrelated", null);
    const writer = archiveWriter({ kind: "archive", name: "subject", prUrl: "https://github.com/o/r/pull/1", clock: new Date("2026-10-14T12:00:00Z") }, "/repo");
    return { f, subject, sibling, unrelated, writer };
  }

  it("archives after reading its subject, the lifecycle and cohort inventories, each open cohort, and each holder", async () => {
    const { f, writer } = await archiveFixture(true);
    expect((await readsOf(f.store, writer)).sort()).toEqual([
      "list cohort/document", "list work-item/meta", "lookup subject", "read cohort/document:child", "read cohort/document:other",
      "read cohort/document:parent", "read work-item/meta:sibling", "read work-item/meta:subject"]);
  });

  it.each([
    ["the subject", "ok"], ["the closing cohort", "ok"], ["the parent cohort", "admitted"], ["a member joining the closing cohort", "ok"],
    ["a member leaving the parent cohort", "ok"], ["a member of the parent cohort", "ok"], ["an open subcohort of the parent cohort", "ok"],
    ["a member joining the parent cohort", "admitted"], ["an unrelated work unit", "admitted"],
  ] as const)("holds an archive to fresh preparation when %s changes", async (family, expected) => {
    const { f, subject, sibling, unrelated, writer } = await archiveFixture(family === "an open subcohort of the parent cohort");
    expectOutcome(await runFenceCase(f.store, writer, async store => {
      if (family === "the subject") await rewrite(store, subject, note);
      else if (family === "the closing cohort") await rewrite(store, success(await store.read({ reference: cohort("child") })), note);
      else if (family === "the parent cohort") await rewrite(store, success(await store.read({ reference: cohort("parent") })), note);
      else if (family === "a member leaving the parent cohort") await rewrite(store, sibling, content => writeMetaCohort(content, null));
      else if (family === "a member of the parent cohort") await rewrite(store, sibling, note);
      else if (family === "an open subcohort of the parent cohort") await rewrite(store, success(await store.read({ reference: cohort("other") })), note);
      else if (family === "an unrelated work unit") await rewrite(store, unrelated, note);
      else {
        const path = family === "a member joining the closing cohort" ? "parent/child" : "parent";
        success(await store.write({ action: "put", reference: workUnit("joiner"), expected: null, placement: { kind: "active" },
          content: makeMetaFixture("joiner", { owner: "test-user", cohort: path }), provenance: changeProvenance }));
      }
    }), expected);
  });
});

it("runs over a copy of a repository's store, leaving the repository's store unchanged", async () => {
  const f = await createRefFixture(registry);
  f.identity("test-user");
  const group = await seed(f, cohort("group"), cohortDoc("group").content);
  await seed(f, workUnit("subject"), makeMetaFixture("subject", { owner: "test-user", cohort: "group" }));
  const reports = await runFenceOverRepository(f.root, [
    { kind: "archive", name: "subject", prUrl: "https://github.com/o/r/pull/1", clock: new Date("2026-10-14T12:00:00Z") },
    { kind: "edit", reference: group.reference, edit: content => `${content}\nThe register row closes.\n` },
  ], "test-user");
  expect(reports.map(({ writer, change, outcome }) => `${writer} / ${change} / ${outcome.kind}`)).toEqual([
    "archive subject / edit work-item/meta:subject / refused", "archive subject / edit cohort/document:group / refused",
    "archive subject / an unrelated write / admitted",
    "edit cohort/document:group / edit cohort/document:group / refused", "edit cohort/document:group / an unrelated write / admitted",
  ]);
}, 120_000);
