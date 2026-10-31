/** Native readiness reads lifecycle facts from operational records, independently of a projected tree. */
import { expect, it } from "vitest";
import { evaluateReviewReadiness, ReviewReadinessRequestSchema, type ReviewReadinessFs } from "../../../../src/scripts/review-gate/readiness.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { ListingOutcomeSchema } from "../../../../src/lib/store/read.js";
import { batchLifecycleWrites, recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ProjectIdentityError } from "../../../../src/lib/store/project-identity.js";
import { describeRecordConflicts } from "../../../../src/lib/store/conflict-diagnostics.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const root = "/tree", head = "a".repeat(40);
const fs: ReviewReadinessFs = {
  stat: async path => {
    if (path !== root) throw new Error("Projected lifecycle state must not be inspected");
    return { isFile: () => false, isDirectory: () => true };
  },
  readFile: async () => { throw new Error("Projected lifecycle state must not be read"); },
  readdir: async () => { throw new Error("Projected lifecycle state must not be listed"); },
};

async function fixture(options: { state?: "Active" | "Integrating" | "Shipped"; notes?: string | null;
  branch?: string | null; changeRequest?: number; cohort?: string; project?: boolean } = {}) {
  const h = createReviewHarness();
  if (options.project !== false) await h.seedProject(projectId);
  const cohorts: Awaited<ReturnType<typeof h.seed>>[] = [];
  const parts = options.cohort?.split("/") ?? [];
  for (const [index, name] of parts.entries()) cohorts.push(await h.seed(
    recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name })),
    `# Cohort: ${name}\n\n**Purpose:** Deliver the coordinated work.\n`
      + (index === 0 ? "" : `\n**Parent:** \`${parts[0]}\`\n`)));
  const state = options.state ?? "Integrating", archived = state === "Shipped";
  const notes = options.notes === undefined ? "The exact work is ready." : options.notes;
  const branch = options.branch === undefined ? "topic/opaque" : options.branch;
  const primary = await h.seed(recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
    makeMetaFixture("example", { state, branch: null, ...(options.cohort === undefined ? {} : { cohort: options.cohort }),
      currentWorkflow: archived ? null : state === "Active" ? "process-task-loop" : "integrate-work-unit" })
      + (notes === null ? "" : `\n## Completion Notes\n\n${notes}\n`),
    archived ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" }, {
      branches: branch === null ? [] : [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
      ...(options.changeRequest === undefined ? {} : { changeRequest: { repository: projectId, number: options.changeRequest } }),
    });
  const request = ReviewReadinessRequestSchema.parse({ schemaVersion: 1, treeRoot: root,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head },
    pullRequest: { repository: "owner/repo", number: 42, state: "open", headBranch: "topic/opaque", headSha: head },
    vehicle: { kind: "work-unit", slug: "example", archiveCadence: archived ? "with-integration" : "manual" } });
  return { ...h, primary, request, cohorts };
}

it("accepts an Integrating stored work unit on its opaque adopted branch without projected metadata", async () => {
  const h = await fixture();
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready", diagnostics: [] });
});

it("refuses a clone holding no project ID with the port's typed failure, and is ready once the clone holds it", async () => {
  const h = await fixture({ project: false });
  const refused = await evaluateReviewReadiness(h.request, { fs, store: h.store }).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(ProjectIdentityError);
  expect(refused).toMatchObject({ failure: { remedy: {
    text: "Restore the project's unique, valid identity record from its authoritative state source, then retry." } } });
  await h.seedProject(projectId);
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready", diagnostics: [] });
});

const closeout = "\n## Closeout\n\n- **Closed:** 2026-10-20\n- **Final member:** `example`\n"
  + "- **Member archives:** All members are archived.\n- **Outcome:** Complete.\n- **Follow-up:** None.\n";

async function completeCohorts(h: Awaited<ReturnType<typeof fixture>>, malformed?: string): Promise<void> {
  lifecycleSuccess(await batchLifecycleWrites(h.store, h.cohorts.map(record => recordPut(record, {
    content: record.content + (record.reference.owner.name === malformed ? "\n## Closeout\n\nIncomplete.\n" : closeout),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  })), { verb: "archive", lifecycleAction: "archive" }));
}

it("accepts completed cohorts with authored closeout after the final member archives", async () => {
  const h = await fixture({ state: "Shipped", cohort: "parent/group" });
  await completeCohorts(h);
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it("refuses a planned cohort with no open holding", async () => {
  const h = await fixture({ state: "Shipped", cohort: "group" });
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid",
    payload: { facts: expect.arrayContaining([expect.objectContaining({ code: "incomplete-cohort-closeout" })]) } });
});

it.each(["member", "subcohort"] as const)("retains planned coordination while an open %s remains", async holding => {
  const h = await fixture({ state: "Shipped", cohort: "group" });
  if (holding === "member") await h.seedMeta("other", { cohort: "group" });
  else await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "child" })),
    "# Cohort: child\n\n**Purpose:** More coordinated work.\n\n**Parent:** `group`\n");
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it.each([false, true])("distinguishes missing coordination from missing final closeout, open: %s", async open => {
  const h = await fixture({ state: "Shipped", cohort: "group" });
  if (open) await h.seedMeta("other", { cohort: "group" });
  const list = h.store.list.bind(h.store);
  h.store.list = async input => input.family === "cohort" ? { status: "ok", result: { status: "absent" } } : list(input);
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid",
    payload: { facts: expect.arrayContaining([expect.objectContaining({
      code: open ? "missing-cohort-coordination" : "missing-cohort-closeout",
    })]) } });
});

it.each(["group", "parent"] as const)("refuses malformed completed closeout in %s", async malformed => {
  const h = await fixture({ state: "Shipped", cohort: "parent/group" });
  await completeCohorts(h, malformed);
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid",
    payload: { facts: expect.arrayContaining([expect.objectContaining({ code: "malformed-cohort-closeout", path: `cohort/document:${malformed}` })]) } });
});

it.each([
  [{ state: "Active" as const }, "wrong-cadence"],
  [{ notes: null }, "missing-completion-notes"],
  [{ notes: "[none]" }, "malformed-completion-notes"],
  [{ branch: "topic/other" }, "vehicle-branch-mismatch"],
  [{ branch: null }, "vehicle-branch-mismatch"],
] as const)("refuses unmet stored lifecycle facts: %s", async (options, code) => {
  const h = await fixture(options);
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid",
    payload: { facts: expect.arrayContaining([expect.objectContaining({ code })]) } });
});

it("accepts a completed stored work unit without branch/date fields or a change-request link", async () => {
  const h = await fixture({ state: "Shipped" });
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it("refuses a completed work unit linked to another pull request", async () => {
  const h = await fixture({ state: "Shipped", changeRequest: 99 });
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid",
    payload: { facts: expect.arrayContaining([expect.objectContaining({ code: "pr-url-mismatch" })]) } });
});

const inventoryRefusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
  condition: "The inventory's objects are missing.", remedy: { text: "Fetch the missing objects, then retry." } };

it.each([
  ["refused", "unreadable-artifact", "work-item/meta", "The inventory's objects are missing. Fetch the missing objects, then retry."],
  ["unreadable", "unreadable-artifact", "work-item/meta", "Another meta cannot be decoded. Restore the inventory."],
  ["diagnostic", "malformed-artifact", "work-item/meta:other", "Another meta cannot be decoded. Repair the other metadata."],
  ["missed", "unreadable-artifact", "work-item/meta",
    "The lifecycle inventory missed records. Repair the work-unit inventory, then retry."],
] as const)("refuses incomplete stored lifecycle inventory with its remedy: %s, and is ready once complete", async (mode, code, path, message) => {
  const h = await fixture({ state: "Shipped" });
  const list = h.store.list.bind(h.store);
  const key = "work-item/meta:other", condition = "Another meta cannot be decoded.";
  const outcome = ListingOutcomeSchema.parse(mode === "unreadable"
    ? { status: "unreadable", condition, remedy: { text: "Restore the inventory." } }
    : { status: "complete", records: [h.primary], missed: mode === "missed", diagnostics: mode === "diagnostic"
      ? [{ kind: "malformed", key, condition, remedy: { text: "Repair the other metadata." } }] : [] });
  h.store.list = async input => input.kind !== "work-item/meta" ? list(input) : mode === "refused"
    ? { status: "refused", refusal: inventoryRefusal } : { status: "ok", result: outcome };
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid", payload: {
    facts: expect.arrayContaining([{ code, path, message }]) } });
  h.store.list = list;
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it.each([
  ["refused", "unreadable-artifact", "cohort/document", "The inventory's objects are missing. Fetch the missing objects, then retry."],
  ["unreadable", "unreadable-artifact", "cohort/document", "Cohort state is unavailable. Restore cohort state."],
  ["diagnostic", "malformed-artifact", "cohort/document:other", "Another cohort cannot be decoded. Repair the other cohort."],
  ["missed", "unreadable-artifact", "cohort/document", "The cohort inventory missed records. Repair the cohort inventory, then retry."],
] as const)("refuses incomplete stored cohort inventory with its remedy: %s, and is ready once complete", async (mode, code, path, message) => {
  const h = await fixture({ state: "Shipped", cohort: "group" });
  await completeCohorts(h);
  const list = h.store.list.bind(h.store);
  const outcome = ListingOutcomeSchema.parse(mode === "unreadable"
    ? { status: "unreadable", condition: "Cohort state is unavailable.", remedy: { text: "Restore cohort state." } }
    : { status: "complete", records: [], missed: mode === "missed", diagnostics: mode === "diagnostic" ? [{ kind: "malformed",
      key: "cohort/document:other", condition: "Another cohort cannot be decoded.", remedy: { text: "Repair the other cohort." } }] : [] });
  h.store.list = async input => input.family !== "cohort" ? list(input) : mode === "refused"
    ? { status: "refused", refusal: inventoryRefusal } : { status: "ok", result: outcome };
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid", payload: {
    facts: expect.arrayContaining([{ code, path, message }]) } });
  h.store.list = list;
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it("names a stored cohort's conflict records in its readiness fact, and is ready once resolved", async () => {
  const h = await fixture({ state: "Shipped", cohort: "group" });
  await completeCohorts(h);
  const list = h.store.list.bind(h.store), conflict = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" }));
  let conflicted = true;
  h.store.list = async input => {
    const listed = await list(input);
    return !conflicted || input.family !== "cohort" || listed.status !== "ok" || listed.result.status !== "complete" ? listed
      : { status: "ok", result: { ...listed.result, records: listed.result.records.map(record => ({ ...record, conflicts: [conflict] })) } };
  };
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid", payload: {
    facts: [{ code: "malformed-artifact", path: "cohort/document:group",
      message: `The stored cohort has unresolved conflicts.${describeRecordConflicts([conflict])}` }] } });
  conflicted = false;
  expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
});

it.each([["unreadable fields", "fields"], ["unresolved conflicts", "conflicts"]] as const)(
  "refuses stored work-unit metadata with %s, naming the repair, and is ready once repaired", async (_label, fault) => {
    const h = await fixture({ state: "Shipped" });
    const read = h.store.read.bind(h.store);
    let faulty = true;
    h.store.read = async input => {
      const result = await read(input);
      if (!faulty || input.reference.kind !== "work-item/meta" || result.status !== "ok") return result;
      return { status: "ok", result: fault === "fields" ? { ...result.result, fields: {} }
        : { ...result.result, conflicts: [result.result.reference] } };
    };
    expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "invalid", payload: {
      facts: [{ code: "malformed-artifact", message: fault === "fields"
        ? "Metadata fields for `example` could not be read. Repair the work unit's metadata fields, then retry."
        : `The stored work-unit metadata has unresolved conflicts.${describeRecordConflicts([h.primary.reference])}` }] } });
    faulty = false;
    expect(await evaluateReviewReadiness(h.request, { fs, store: h.store })).toMatchObject({ state: "ready" });
  });
