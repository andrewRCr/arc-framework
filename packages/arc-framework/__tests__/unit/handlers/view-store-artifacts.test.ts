/** Every semantic view kind selects its own record through the operational store. */
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createViewDependencies } from "../../../src/handlers/view.js";
import { resolveViewArtifact } from "../../../src/lib/view-artifact.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import type { StoreRecord } from "../../../src/lib/store/read.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaDesign } from "../../../src/lib/store/kinds/meta/writers.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import type { ViewKind } from "../../../src/lib/view/types.js";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-view-records-")); folders.push(cwd);
  const h = createLifecycleHarness();
  const { exec } = scriptGitExec([{ match: { predicate: () => true }, responses: [{ failure: { exitCode: 128, stderr: "fatal: not a git repository" } }] }]);
  const deps = createViewDependencies(cwd, path => readFile(path, "utf8"), exec, "alice", h.store);
  return { ...h, cwd, deps };
}
const cases: { kind: ViewKind; project?: boolean; path: string }[] = [
  { kind: "meta", path: ".arc/active/meta-demo.md" },
  { kind: "tasks", path: ".arc/active/tasks-demo.md" },
  { kind: "spec", path: ".arc/active/spec-demo.md" },
  { kind: "draft", path: ".arc/active/draft-demo.md" },
  { kind: "notes", path: ".arc/active/notes-demo.md" },
  { kind: "session-notes", path: ".arc/active/meta-demo.md" },
  { kind: "design", path: ".arc/active/spec-demo-rfc.md" },
  { kind: "cohort", path: ".arc/backlog/planned/group/cohort-group.md" },
  { kind: "working-memory", path: ".arc/user/alice/WORKING-MEMORY.md" },
  { kind: "inbox", path: ".arc/user/alice/USER-INBOX.md" },
  { kind: "inbox", project: true, path: ".arc/backlog/ATOMIC-INBOX.md" },
];
it.each(cases)("opens $kind (project=$project) at the selected record's projected path", async ({ kind, project = false, path }) => {
  const f = await fixture();
  await f.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })), "# Cohort\n\n**Parent:** [none]\n\n**Purpose:** Group work.\n");
  const meta = await f.seedMeta("demo", { cohort: "group", design: ["spec-demo.md"] });
  if (kind === "tasks") await f.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Continue**\n");
  if (kind === "spec" || kind === "design") await f.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\nNo Purpose field.\n");
  if (kind === "design") {
    await f.seed(recordReferences["work-item/companion"](meta.reference.owner, "spec-rfc"), "# RFC\n\n**Purpose:** Design intent.\n");
    lifecycleSuccess(await f.store.write({ ...recordPut(meta, { content: writeMetaDesign(meta.content, ["spec-demo.md", "spec-demo-rfc.md"]) }),
      provenance: { verb: "repoint-design", lifecycleAction: "spec-finalized" } }));
  }
  if (kind === "draft") await f.seed(recordReferences["work-item/draft"](meta.reference.owner), "# Draft\n\n**Purpose:** Draft intent.\n");
  if (kind === "notes") await f.seed(recordReferences["work-item/notes"](meta.reference.owner), "# Notes\n\nStored notes.\n");
  const person = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
  if (kind === "working-memory") await f.seed(recordReferences["personal/working-memory"](person), "# Memory\n\n## Memories\n");
  if (kind === "inbox") await f.seed(project ? recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" })) : recordReferences["personal/inbox"](person), "# Inbox\n");
  const expected = join(f.cwd, path); await mkdir(dirname(expected), { recursive: true }); await writeFile(expected, `projected ${kind}\n`);
  const global = kind === "working-memory" || kind === "inbox";
  const result = await resolveViewArtifact({ cwd: f.cwd, kind, project, identity: "alice", ...(global ? {} : { forSlug: "demo" }) }, f.deps);
  expect(result).toMatchObject({ status: "resolved", kind, path: expected, workUnit: global ? null : "demo" });
  if (result.status !== "resolved" || !("path" in result)) throw new Error("Expected the projected file");
  expect(await f.deps.readFile(result.path)).toBe(`projected ${kind}\n`);
});


it.each(["tasks", "spec", "draft", "meta"] as const)("selects %s as the furthest open record without projected files", async kind => {
  const f = await fixture(), meta = await f.seedMeta("demo");
  const records: Partial<Record<typeof kind, StoreRecord>> = { meta };
  if (kind === "tasks") records.tasks = await f.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Continue**\n");
  if (kind === "tasks" || kind === "spec") records.spec = await f.seed(recordReferences["work-item/spec"](meta.reference.owner), "# Spec\n\n**Purpose:** Spec intent.\n");
  if (kind !== "meta") records.draft = await f.seed(recordReferences["work-item/draft"](meta.reference.owner), "# Draft\n\n**Purpose:** Draft intent.\n");
  const expected = records[kind]; if (expected === undefined) throw new Error("Expected seeded record");
  expect(await resolveViewArtifact({ cwd: f.cwd, project: false, identity: "alice", forSlug: "demo" }, f.deps))
    .toMatchObject({ status: "resolved", kind, content: expected.content, ref: expected.version });
});

it("selects a completed work unit's meta even when its task-list record exists", async () => {
  const f = await fixture(), meta = await f.seedMeta("archived", { state: "Shipped", currentWorkflow: null });
  await f.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Tasks\n\n## **Phase 1:** Work\n\n### `[x]` **1.1 Done**\n");
  lifecycleSuccess(await f.store.write({ ...recordPut(meta, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }), provenance: { verb: "archive", lifecycleAction: "archive" } }));
  expect(await resolveViewArtifact({ cwd: f.cwd, project: false, identity: "alice", forSlug: "archived" }, f.deps))
    .toMatchObject({ status: "resolved", kind: "meta", content: meta.content });
});

it.each(["working-memory", "inbox"])("retains the missing-identity refusal for a %s store artifact", async kind => {
  const f = await fixture();
  expect(await resolveViewArtifact({ cwd: f.cwd, kind, project: false, identity: null }, f.deps))
    .toEqual({ status: "error", kind, message: "No ARC identity is configured for this identity-scoped artifact." });
});

it.each(["refused", "unreadable", "diagnostic", "missed"] as const)("preserves a %s project-inbox inventory failure and resumes after repair", async failure => {
  const f = await fixture(), reference = recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" }));
  const record = await f.seed(reference, "# Inbox\n"), list = f.store.list.bind(f.store);
  const problem = { condition: "Project inbox inventory unavailable.", remedy: { text: "Restore the inventory and retry." } };
  f.store.list = async input => input.family !== "project-inbox" ? list(input) : failure === "refused"
    ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "project-inbox", ...problem } }
    : failure === "unreadable" ? { status: "ok", result: { status: "unreadable", ...problem } }
      : { status: "ok", result: { status: "complete", records: [record], missed: true, diagnostics: failure === "diagnostic"
        ? [{ kind: "unreadable", key: "lost", ...problem }] : [] } };
  const options = { cwd: f.cwd, kind: "inbox", project: true, identity: null };
  const result = await resolveViewArtifact(options, f.deps);
  expect(result.status).toBe("error");
  if (result.status !== "error") throw new Error("Expected incomplete inventory to refuse");
  expect(result.message).toContain(failure === "missed" ? "inventory is incomplete" : problem.condition);
  expect(result.message).toContain(failure === "missed" ? "retry arc view inbox --project" : problem.remedy.text);
  f.store.list = list;
  expect(await resolveViewArtifact(options, f.deps)).toMatchObject({ status: "resolved", kind: "inbox", content: record.content });
});
