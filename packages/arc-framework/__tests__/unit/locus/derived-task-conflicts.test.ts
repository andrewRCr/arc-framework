/** Task-list conflicts withhold execution context until an explicit resolution. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createMemoryRemote } from "../../helpers/store/sync.js";
import { ReferenceBackend } from "../../helpers/store/reference-backend.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { acquireDerivedLocusEvidence, type DerivedLocusEvidenceIO } from "../../../src/lib/locus/derived-evidence.js";
import { readDerivedLocusFrame } from "../../../src/lib/locus/derived-reader.js";
import type { SubjectMetaIO } from "../../../src/lib/locus/subject-meta.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { WorktreeMarker } from "../../../src/lib/git/worktree-marker.js";

const tasks = (first: string, second: string) => `# Task List: Demo\n\n## **Phase 1:** Work\n\n### \`[${first}]\` **1.1 First**\n\n### \`[${second}]\` **1.2 Second**\n`;

async function frame(store: Store) {
  const marker: WorktreeMarker = { spawnedByArc: false, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "andrew", createdAt: "2026-10-16T00:00:00Z" };
  const io: DerivedLocusEvidenceIO = {
    store, projectId: async () => "project", canonicalizePath: async path => path,
    scanWorktrees: async () => ({ ok: true, worktrees: [{ folderPresent: true, path: "/repo", head: "a".repeat(40), branch: "main", detached: false, primary: true }] }),
    readMarker: async () => ({ kind: "present", marker, bytes: Buffer.from(JSON.stringify(marker)) }),
    listDirectory: async () => { throw new Error("No checkout files"); }, readText: async () => { throw new Error("No checkout files"); },
    readArchivedMeta: async () => ({ kind: "absent" }), readIdentities: async () => ({ kind: "absent" }),
    readCompleted: async () => ({ status: "available", records: new Map() }), readPrimarySafety: async () => ({ kind: "complete", clean: true, onBase: true }),
  };
  const subjectMetaIO: SubjectMetaIO = {
    readFile: async () => { throw new Error("No checkout files"); }, pathExists: async () => false,
    realpath: async path => path, lstat: async () => ({ isSymbolicLink: () => false }),
    projectCandidateTarget: async () => { throw new Error("No Candidate"); },
    readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }), projectDeliveryCorrection: async () => ({ status: "none" }),
  };
  const evidence = await acquireDerivedLocusEvidence({ identity: "andrew", io });
  if (evidence.kind !== "complete") throw new Error("No topology");
  return readDerivedLocusFrame({ ...evidence, store, identity: "andrew", enteringCheckoutPath: "/repo", canonicalizePath: async path => path, subjectMetaIO });
}

it("derives no cursor or workflow from a synchronized task conflict, then resumes from its resolved task list", async () => {
  const h = createLifecycleHarness(), meta = await h.seedMeta("demo", { state: "Active", owner: "andrew", branch: null, taskList: "tasks-demo.md" });
  const reference = recordReferences["work-item/task-list"](meta.reference.owner);
  await h.seed(reference, tasks(" ", " "));
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.sync());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const local = lifecycleSuccess(await h.store.read({ reference })), other = lifecycleSuccess(await writer.read({ reference }));
  const provenance = { verb: "task-mark", lifecycleAction: "task-mark" };
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: local.version, content: tasks("x", " "), provenance }));
  lifecycleSuccess(await writer.write({ action: "put", reference, expected: other.version, content: tasks(" ", "x"), provenance }));
  lifecycleSuccess(await h.store.sync());
  const disputed = lifecycleSuccess(await h.store.read({ reference })); expect(disputed.conflicts).toHaveLength(1);
  const unresolved = await frame(h.store);
  expect(unresolved.active).toBeNull();
  expect(unresolved.roster[0]).toMatchObject({ kind: "unresolved-checkout", context: null });
  const message = unresolved.roster[0]?.diagnostics.map(item => item.message).join(" ") ?? "";
  for (const conflict of disputed.conflicts) expect(message).toContain(JSON.stringify(conflict));
  expect(message).toMatch(/resolve.*retry/iu);
  lifecycleSuccess(await h.store.write({ action: "put", reference: disputed.reference, expected: disputed.version,
    resolves: disputed.conflicts, content: tasks("x", " "), provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(lifecycleSuccess(await h.store.read({ reference })).conflicts).toEqual([]);
  expect((await frame(h.store)).active?.context).toMatchObject({ workflow: "process-task-loop", taskCursor: { status: "found", cursor: { leaf: { id: "1.2" } } } });
});
