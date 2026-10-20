/** Attestation input admission reads checked operational records without projected files. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { readAttestInput, type AttestInputPorts } from "../../../../src/lib/store/attest-input.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema, SlugSchema, validateManagedPath } from "../../../../src/lib/kernel/index.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { writeMetaPause, writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runResumePaused } from "../../../../src/lib/work-unit/verbs/pause-handover.js";

const closedTasks = "# Task List: example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build**\n";
function ports(store: AttestInputPorts["store"]): AttestInputPorts {
  return { cwd: "/no-projected-files", store, activeMetaPath: name => validateManagedPath(`.arc/active/meta-${name}.md`),
    readFile: async () => { throw new Error("ENOENT"); }, readArchivedMeta: async () => undefined };
}
async function fixture(state: "Active" | "Integrating" | "Shipped" = "Active", tasks: string | null = closedTasks) {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { state, taskList: "tasks-example.md",
    currentWorkflow: state === "Integrating" ? "integrate-work-unit" : state === "Shipped" ? null : "process-task-loop" },
  state === "Shipped" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  const reference = recordReferences["work-item/task-list"](primary.reference.owner);
  if (tasks !== null) await h.seed(reference, tasks);
  return { ...h, primary, reference, ports: ports(h.store) };
}
it.each(["Active", "Integrating", "Shipped"] as const)("admits closed stored input in %s without metadata or task files", async state => {
  const h = await fixture(state), version = lifecycleSuccess(await h.store.version());
  expect(await readAttestInput(h.ports, "example", state === "Shipped")).toMatchObject({ status: "ready",
    primary: h.primary, metaContent: h.primary.content, lifecycle: state, taskList: closedTasks,
    lastCompleted: "Task 1.1 — Build" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});
it("refuses an open stored task and admits the same input after closure", async () => {
  const h = await fixture("Active", closedTasks.replace("[x]", "[ ]"));
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("task remains open: Task 1.1 — Build") });
  const task = lifecycleSuccess(await h.store.read({ reference: h.reference }));
  lifecycleSuccess(await h.store.write({ ...recordPut(task, { content: closedTasks }),
    provenance: { verb: "close-task", lifecycleAction: "edit" } }));
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "ready" });
});
it("preserves a missing task's repair route and admits it after restoration", async () => {
  const h = await fixture("Active", null);
  const missing = await h.store.read({ reference: h.reference });
  if (missing.status !== "refused") throw new Error("Expected missing task");
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "rejected",
    reason: missing.refusal.condition, remedy: missing.refusal.remedy });
  await h.seed(h.reference, closedTasks);
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "ready" });
});
it("refuses a pause without writes and admits the same work after resume", async () => {
  const h = await fixture();
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { content: writeMetaPause(h.primary.content, {
    pausedBy: SlugSchema.parse("test-user"), since: "2026-10-19T00:00:00Z", reason: "Waiting.",
    waitsOn: null, resumeNotes: null, open: false }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const version = lifecycleSuccess(await h.store.version());
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "rejected",
    reason: expect.stringContaining("arc resume example"), remedy: { argv: ["arc", "resume", "example"] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  const exec = async (): Promise<never> => { throw new Error("No Git needed"); };
  expect(await runResumePaused({ store: h.store, cwd: h.ports.cwd, exec, baseBranch: "main" }, { name: "example" }))
    .toMatchObject({ status: "resumed" });
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "ready" });
});

it.each(["meta", "task-list"] as const)("refuses conflicted stored %s authority and resumes after resolution", async kind => {
  const h = await fixture(), reference = kind === "meta" ? h.primary.reference : h.reference;
  const remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, label] of [[h.store, "local"], [writer, "remote"]] as const) {
    const record = lifecycleSuccess(await store.read({ reference }));
    lifecycleSuccess(await store.write({ ...recordPut(record, { content: kind === "meta"
      ? writeMetaNextAction(record.content, label) : `${closedTasks}\n${label} task context.\n` }),
    provenance: { verb: kind === "meta" ? "attest" : "close-task", lifecycleAction: "edit" } }));
  }
  lifecycleSuccess(await h.store.sync());
  const record = lifecycleSuccess(await h.store.read({ reference }));
  expect(record.conflicts.length).toBeGreaterThan(0);
  const refused = await readAttestInput(h.ports, "example");
  expect(refused).toMatchObject({ status: "rejected", reason: expect.stringContaining("unresolved conflicts"),
    remedy: { text: expect.stringContaining("Resolve the named conflict records") } });
  for (const conflictReference of record.conflicts) {
    expect(refused.status === "rejected" ? refused.reason : "").toContain(JSON.stringify(conflictReference));
    const conflict = lifecycleSuccess(await h.store.read({ reference: conflictReference }));
    lifecycleSuccess(await h.store.write({ action: "remove", reference: conflictReference, expected: conflict.version,
      resolves: [conflictReference], provenance: { verb: "resolve", lifecycleAction: "edit" } }));
  }
  expect(await readAttestInput(h.ports, "example")).toMatchObject({ status: "ready" });
});
