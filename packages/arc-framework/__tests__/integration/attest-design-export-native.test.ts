/** Native attestation stages the design copy before publishing its stored Candidate. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { AttestCommandInputSchema, attestCandidateWithReviewBoundary } from "../../src/handlers/lifecycle-delivery-review.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { AttestResultSchema } from "../../src/lib/work-unit/verbs/attest.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

async function fixture(options: { complete?: boolean; tracking?: "none" | "specs"; generation?: "branch" | "bound" } = {}) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    `branch.base: main\narchive.cadence: manual\nstorage.track_design_docs: ${options.tracking ?? "specs"}\n`);
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure fixture"], { cwd });
  await exec("git", ["switch", "-c", "topic/opaque"], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { branch: null, state: options.generation === undefined ? "Active" : "Shipped",
    taskList: "tasks-example.md", currentWorkflow: options.generation === undefined ? "process-task-loop" : null },
  options.generation === undefined ? { kind: "active" } : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, {
    branches: options.generation === "bound" ? [] : [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    `# Task List: example\n\n## **Phase 1:** Build\n\n### \`[${options.complete === false ? " " : "x"}]\` **1.1 Build**\n`);
  await h.reference.seed(recordReferences["work-item/spec"](primary.reference.owner), "# Stored specification\n");
  const io = createUserIOContext(); io.exec = exec;
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(chunk => { chunks.push(String(chunk)); return true; });
  return { ...h, cwd, exec, primary, attest: async () => {
    chunks.length = 0;
    await attestCandidateWithReviewBoundary({ cwd, identity: "test-user", io, store: h.reference.store,
      ...(options.generation === "bound" ? { workItem: primary.reference.owner } : {}) },
      AttestCommandInputSchema.parse({ name: "example", json: true, newRoot: options.generation !== undefined }));
    return JSON.parse(chunks.join("")) as unknown;
  } };
}

it.each(["branch", "bound"] as const)("attests the exact completed %s generation while a live work unit reuses its slug", async generation => {
  const h = await fixture({ generation, tracking: "none" });
  const live = await h.reference.seedMeta("example", { branch: null, taskList: "tasks-example.md" }, { kind: "active" });
  const tasks = await h.reference.seed(recordReferences["work-item/task-list"](live.reference.owner),
    "# Task List: example\n\n## **Phase 1:** New work\n\n### `[ ]` **1.1 New work**\n");
  expect(await h.attest()).toMatchObject({ status: "attested" });
  const store = h.reference.store;
  expect(lifecycleSuccess(await store.read({ reference: live.reference }))).toEqual(live);
  expect(lifecycleSuccess(await store.read({ reference: tasks.reference }))).toEqual(tasks);
  for (const kind of ["review/candidate", "review/integration-boundary"] as const) {
    expect(await store.read({ reference: recordReferences[kind](live.reference.owner) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await store.read({ reference: recordReferences[kind](h.primary.reference.owner) })).toMatchObject({ status: "ok" });
  }
}, 30_000);

it("refuses a task reopened after admission without partial attestation, then attests after closure", async () => {
  const h = await fixture({ tracking: "none" }), store = h.reference.store;
  expect(await h.attest()).toMatchObject({ status: "attested" });
  const references = [h.primary.reference, recordReferences["review/candidate"](h.primary.reference.owner),
    recordReferences["review/integration-boundary"](h.primary.reference.owner)];
  const baseline = await Promise.all(references.map(async reference => lifecycleSuccess(await store.read({ reference }))));
  const reference = recordReferences["work-item/task-list"](h.primary.reference.owner);
  const task = lifecycleSuccess(await store.read({ reference })), batch = store.batch.bind(store);
  let intervene = true;
  store.batch = async input => {
    if (intervene && input.writes.some(write => write.reference.kind === "review/candidate")) {
      intervene = false;
      lifecycleSuccess(await batch({ writes: [recordPut(task, { content: task.content.replace("[x]", "[ ]") })],
        provenance: { verb: "reopen-task", lifecycleAction: "edit" } }));
    }
    return batch(input);
  };
  expect(await h.attest()).toMatchObject({ status: "rejected", reason: expect.stringMatching(/version|observation/iu) });
  expect(await Promise.all(references.map(async reference => lifecycleSuccess(await store.read({ reference }))))).toEqual(baseline);
  const reopened = lifecycleSuccess(await store.read({ reference }));
  lifecycleSuccess(await store.write({ ...recordPut(reopened, { content: task.content }), provenance: { verb: "close-task", lifecycleAction: "edit" } }));
  process.exitCode = 0;
  expect(await h.attest()).toMatchObject({ status: "unchanged" });
}, 30_000);

it("stages the stored spec before the Candidate write and preserves its subject digest", async () => {
  const h = await fixture(), path = ".arc/specs/example/spec-example.md";
  const before = await collectCandidateSubjectTarget({ cwd: h.cwd, name: "example", baseBranch: "main", exec: h.exec });
  let atWrite: string | undefined;
  const batch = h.reference.store.batch.bind(h.reference.store);
  h.reference.store.batch = async input => {
    atWrite = (await h.exec("git", ["show", `:${path}`], { cwd: h.cwd })).stdout;
    return batch(input);
  };
  const result = AttestResultSchema.parse(await h.attest());
  expect(result).toMatchObject({ status: "attested", metaPath: ".arc/active/meta-example.md" });
  expect(result).not.toHaveProperty("recordPath");
  expect(atWrite).toBe("# Stored specification");
  expect(await readFile(join(h.cwd, path), "utf8")).toBe("# Stored specification\n");
  expect((await collectCandidateSubjectTarget({ cwd: h.cwd, name: "example", baseBranch: "main", exec: h.exec }))
    .subject.subjectDigest).toBe(before.subject.subjectDigest);
}, 30_000);

it.each(["refused", "disabled"] as const)("exports no copy when attestation is %s", async mode => {
  const h = await fixture(mode === "refused" ? { complete: false } : { tracking: "none" });
  const result = await h.attest();
  expect(result).toMatchObject({ status: mode === "refused" ? "rejected" : "attested" });
  await expect(readFile(join(h.cwd, ".arc/specs/example/spec-example.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.exec("git", ["diff", "--cached", "--name-only"], { cwd: h.cwd })).stdout).toBe("");
}, 30_000);

it("stages an already matching untracked copy at attestation", async () => {
  const h = await fixture(), path = ".arc/specs/example/spec-example.md";
  await mkdir(join(h.cwd, ".arc/specs/example"), { recursive: true });
  await writeFile(join(h.cwd, path), "# Stored specification\n");
  expect(await h.attest()).toMatchObject({ status: "attested" });
  expect((await h.exec("git", ["show", `:${path}`], { cwd: h.cwd })).stdout).toBe("# Stored specification");
}, 30_000);

it.each(["review/integration-boundary", "review/candidate", "work-item/spec"] as const)(
  "refuses through attestation's typed refusal when the %s read refuses, and attests once repaired", async kind => {
    const h = await fixture();
    // A ref read whose record objects are missing refuses in this shape, naming the record and no command.
    const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
      condition: "The stored record's objects are missing.", remedy: { text: "Restore or fetch the missing record objects, then retry the read." } };
    const read = h.reference.store.read.bind(h.reference.store);
    let held = true;
    h.reference.store.read = async input => held && input.reference.kind === kind
      ? { status: "refused", refusal: { ...refusal, reference: input.reference } } : read(input);
    expect(await h.attest()).toMatchObject({ status: "rejected", reason: refusal.condition,
      remedy: { invariant: refusal.condition, text: expect.stringContaining(refusal.remedy.text) } });
    expect(process.exitCode).toBe(1);
    held = false;
    process.exitCode = 0;
    expect(await h.attest()).toMatchObject({ status: "attested" });
  }, 30_000);
