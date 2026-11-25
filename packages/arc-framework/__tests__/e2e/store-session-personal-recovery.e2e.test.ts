/** Session entry and recovery read persisted work, task and terminal identity evidence. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";

import { git, runArc, runArcWithStdin } from "./helpers.js";
import { seedWorkUnit, seededWorkUnitSubject } from "../helpers/store/seed-work-unit.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { codeRefs, expectExit, fixtureStore, markerPath, personalRecords,
  SESSION_COMMAND_TIMEOUT_MS, sessionIdentity, sessionRepo, stored } from "../helpers/store-session-personal-fixture.js";
import { SessionInitProbeResultSchema, SessionRecoverProbeResultSchema } from "../../src/commands/status/schema.js";
import { CompactionSeedSchema } from "../../src/lib/compaction-seed/schema.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { RecoverAuditReportSchema } from "../../src/lib/recover/report.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";

const entryArgs = ["--skip-projection", "status", "--session-init", "--write-compaction-seed", "--json"];
const recoverArgs = ["--skip-projection", "status", "--recover", "--json"];
const tasks = "# Task List: Demo\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Implement.\n\n"
  + "    - `[ ]` **1.1.a Earlier**\n    - `[ ]` **1.1.b Later**\n";
const seedPath = (root: string) => join(root, ".arc", "user", sessionIdentity, ".internal", "compaction-seed.json");

async function enter(root: string) {
  const result = await runArc(entryArgs, root);
  expectExit(entryArgs, result);
  return SessionInitProbeResultSchema.parse(JSON.parse(result.stdout));
}

async function recover(root: string) {
  const result = await runArc(recoverArgs, root);
  expectExit(recoverArgs, result);
  return SessionRecoverProbeResultSchema.parse(JSON.parse(result.stdout));
}

async function audit(root: string) {
  const args = ["--skip-projection", "recover", "audit", "--seed-path", seedPath(root), "--json"];
  const result = await runArc(args, root);
  expectExit(args, result);
  return RecoverAuditReportSchema.parse(JSON.parse(result.stdout));
}

async function activeWork() {
  const root = await sessionRepo();
  const branch = "feat/session-subject";
  await git(root, ["switch", "-c", branch]);
  const { meta, taskList } = await seedWorkUnit(root, "session-subject", { identity: sessionIdentity, branch, bind: root,
    meta: { owner: sessionIdentity, branch, state: "Active", currentWorkflow: "process-task-loop",
      taskList: "tasks-session-subject.md", nextAction: "Continue Earlier" }, taskList: tasks });
  if (taskList === undefined) throw new Error("Expected the seeded task list");
  const store = fixtureStore(root);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const marker = await readFile(markerPath(root));
  return { root, branch, meta, taskList, store, head, marker };
}

async function commitWork(root: string) {
  await writeFile(join(root, "work.txt"), "A real task change\n");
  await git(root, ["add", "work.txt"]);
  await git(root, ["commit", "-m", "Implement task work"]);
  return git(root, ["rev-parse", "HEAD"]);
}

it("retains the saved task baseline and shows uncaptured Git work, then stops on a changed cursor until repaired", async () => {
  const f = await activeWork();
  const basis = stored(await f.store.version());
  const entry = await enter(f.root);
  expect(entry).toMatchObject({ active: { ok: true, value: { currentWorkflow: "process-task-loop", sessionType: "execution" } },
    taskCursor: { ok: true, value: { status: "found", cursor: { leaf: { title: "Earlier" } } } },
    compactionSeedWrite: { status: "written", path: seedPath(f.root) },
  });
  const saved = await readFile(seedPath(f.root));
  expect(CompactionSeedSchema.parse(JSON.parse(saved.toString()))).toMatchObject({
    activeWorkUnit: "session-subject", stateVersion: basis, head: f.head, branch: f.branch,
    taskCursor: { leaf: { title: "Earlier" } }, locus: { checkoutPath: f.root, parentCheckoutPath: null },
  });
  const sha = await commitWork(f.root);
  const close = { text: "arc task close", argv: ["arc", "task", "close"], checkout: f.root };
  expect(await enterWithoutSeed(f.root)).toMatchObject({ derivedLocusState: { ok: true, value: {
    active: { context: { unclosedTaskCommits: { status: "available", commits: [{ sha }], actions: [close] } } },
  } } });
  expect(await audit(f.root)).toMatchObject({ stateBasis: { rebuilt: false, stateVersion: basis }, verdict: {
    status: "ready", taskCursor: { match: true },
    unclosedTaskCommits: { status: "available", commits: [{ sha }], actions: [close] },
    locus: { expectedHead: f.head, actualHead: sha, headRelation: "advanced" },
  } });

  const later = tasks.replace("[ ]` **1.1.a", "[x]` **1.1.a");
  const writeTasks = async (content: string) => {
    const current = stored(await f.store.read({ reference: f.taskList.reference }));
    await seedStore(f.root, sessionIdentity, [{ reference: current.reference, expected: current.version, content }]);
  };
  await writeTasks(later);
  const before = stored(await f.store.version());
  const refs = await codeRefs(f.root);
  const stopped = await audit(f.root);
  expect(stopped).toMatchObject({ stateBasis: { rebuilt: false, stateVersion: basis }, verdict: {
    status: "stop", stopReasons: expect.arrayContaining([expect.objectContaining({ kind: "task-cursor-mismatch" })]),
    taskCursor: { expected: { leaf: { title: "Earlier" } }, actual: { cursor: { leaf: { title: "Later" } } }, match: false },
  } });
  expect(stopped.verdict).not.toHaveProperty("unclosedTaskCommits");
  expect(stored(await f.store.read({ reference: f.taskList.reference, asOf: basis })).content).toBe(tasks);
  expect(stored(await f.store.read({ reference: f.taskList.reference })).content).toBe(later);
  expect(stored(await f.store.version())).toBe(before);
  expect(await readFile(seedPath(f.root))).toEqual(saved);
  expect(await readFile(markerPath(f.root))).toEqual(f.marker);
  expect(await codeRefs(f.root)).toBe(refs);

  await writeTasks(tasks);
  expect(await audit(f.root)).toMatchObject({ stateBasis: { rebuilt: false, stateVersion: basis },
    verdict: { status: "ready", unclosedTaskCommits: { commits: [{ sha }], actions: [close] } } });
  expect(stored(await f.store.read({ reference: f.taskList.reference })).content).toBe(tasks);
  expect(await readFile(seedPath(f.root))).toEqual(saved);
  expect(await readFile(markerPath(f.root))).toEqual(f.marker);
  expect(await codeRefs(f.root)).toBe(refs);
  expect(await git(f.root, ["show", `${sha}:work.txt`])).toBe("A real task change");
}, SESSION_COMMAND_TIMEOUT_MS);

async function enterWithoutSeed(root: string) {
  const args = ["--skip-projection", "status", "--session-init", "--json"];
  const result = await runArc(args, root);
  expectExit(args, result);
  return SessionInitProbeResultSchema.parse(JSON.parse(result.stdout));
}

it("directs a returning session to resume paused work before closing its uncaptured commit", async () => {
  const { root } = await activeWork();
  expect(await enter(root)).toMatchObject({ compactionSeedWrite: { status: "written" } });
  const sha = await commitWork(root);
  const pause = ["--skip-projection", "pause", "session-subject", "--reason", "Awaiting review"];
  expectExit(pause, await runArc(pause, root));

  const unclosedTaskCommits = { status: "available", commits: [{ sha }], actions: [{
    argv: ["arc", "resume", "session-subject"], checkout: root,
    text: expect.stringMatching(/arc resume session-subject.*arc task close/su),
  }] };
  expect(await enterWithoutSeed(root)).toMatchObject({ derivedLocusState: { ok: true, value: {
    active: { context: { unclosedTaskCommits } },
  } } });
  expect((await audit(root)).verdict).toMatchObject({ status: "ready", taskCursor: { match: true }, unclosedTaskCommits });
}, SESSION_COMMAND_TIMEOUT_MS);

it("reports handoff restate changes from persisted records and Git with the saved baselines intact", async () => {
  const f = await activeWork();
  const memory = personalRecords(sessionIdentity).memory;
  const held = stored(await f.store.read({ reference: memory }));
  const note = recordReferences["work-item/notes"](f.meta.reference.owner);
  const notesBefore = "# Notes\n\nBefore handoff.\n";
  const notesAfter = "# Notes\n\nChanged after handoff.\n";
  const [seededNote] = await seedStore(f.root, sessionIdentity, [{ reference: note, content: notesBefore }]);
  if (seededNote === undefined) throw new Error("Expected the persisted note");
  const basis = stored(await f.store.version());
  const writeArgs = ["--skip-projection", "handoff", "write", "-"];
  const written = await runArcWithStdin(writeArgs, f.root,
    JSON.stringify({ schemaVersion: 1, sessionContext: "Saved session context", nextAction: "Continue work", sessionType: "execution" }));
  expectExit(writeArgs, written);
  const after = tasks.replace("[ ]` **1.1.a", "[x]` **1.1.a");
  await seedStore(f.root, sessionIdentity, [
    { reference: f.taskList.reference, expected: f.taskList.version, content: after },
    { reference: note, expected: seededNote.version, content: notesAfter },
  ]);
  const sha = await commitWork(f.root);
  const version = stored(await f.store.version());
  const refs = await codeRefs(f.root);
  const args = ["--skip-projection", "status", "--session-handoff", "--json"];
  const result = await runArc(args, f.root);
  expectExit(args, result);
  expect(JSON.parse(result.stdout)).toMatchObject({ mode: "session-handoff", restateCandidates: { ok: true, value: {
    commitsSinceHandoff: [{ hash: expect.stringMatching(new RegExp(`^${sha.slice(0, 7)}`, "u")), subject: "Implement task work" }],
    tasksClosedSinceHandoff: ["1.1.a"], noteFileChangesSinceHandoff: [expect.stringMatching(/notes-session-subject\.md$/u)],
  } } });
  expect(stored(await f.store.read({ reference: f.meta.reference }))).toMatchObject({ reference: f.meta.reference,
    fields: { stateAtHandoff: basis, commitAtHandoff: f.head, sessionContext: "Saved session context" } });
  expect(stored(await f.store.read({ reference: note, asOf: basis })).content).toBe(notesBefore);
  expect(stored(await f.store.read({ reference: note })).content).toBe(notesAfter);
  expect(stored(await f.store.read({ reference: f.taskList.reference, asOf: basis })).content).toBe(tasks);
  expect(stored(await f.store.read({ reference: f.taskList.reference })).content).toBe(after);
  expect(stored(await f.store.read({ reference: memory }))).toEqual(held);
  expect(stored(await f.store.version())).toBe(version);
  expect(await readFile(markerPath(f.root))).toEqual(f.marker);
  expect(await codeRefs(f.root)).toBe(refs);
}, SESSION_COMMAND_TIMEOUT_MS);

it.each([null, "unavailable-state"])("rebuilds the %s seed state for the original subject and stops when the marker selects another", async unavailable => {
  const f = await activeWork();
  expect(await enter(f.root)).toMatchObject({ compactionSeedWrite: { status: "written" } });
  const original = CompactionSeedSchema.parse(JSON.parse(await readFile(seedPath(f.root), "utf8")));
  await writeFile(seedPath(f.root), JSON.stringify({ ...original, stateVersion: unavailable }));
  const seed = await readFile(seedPath(f.root));
  const sha = await commitWork(f.root);
  const other = await seedWorkUnit(f.root, "another-subject", { identity: sessionIdentity,
    meta: { owner: sessionIdentity, state: "Planning", currentWorkflow: "draft-design" } });
  await writeWorktreeMarker(f.root, { spawnedByArc: false, createdFor: seededWorkUnitSubject(other.meta),
    spawningIdentity: sessionIdentity, createdAt: new Date(0).toISOString() });
  const otherMarker = await readFile(markerPath(f.root));
  const version = stored(await f.store.version());
  const records = await Promise.all([f.meta.reference, other.meta.reference].map(async reference => stored(await f.store.read({ reference }))));
  const refs = await codeRefs(f.root);

  expect(await audit(f.root)).toMatchObject({ verdict: { status: "stop", stopReasons: [
    { kind: "integration-correction-unresolved", message: expect.stringMatching(/different subject.*session-subject/u) },
  ] } });
  expect(await readFile(markerPath(f.root))).toEqual(otherMarker);
  expect(await readFile(seedPath(f.root))).toEqual(seed);
  expect(stored(await f.store.version())).toBe(version);
  expect(await codeRefs(f.root)).toBe(refs);

  await writeFile(markerPath(f.root), f.marker);
  expect(await audit(f.root)).toMatchObject({ stateBasis: { rebuilt: true, stateVersion: version },
    seed: { stateVersion: unavailable, head: f.head, branch: f.branch, locus: original.locus },
    recover: { recoveryFrame: { ok: true, value: { kind: "resolved", subject: { kind: "work-unit", key: "session-subject" } } } },
    verdict: { status: "ready", locus: { expectedHead: f.head, actualHead: sha, headRelation: "advanced" } },
  });
  expect(await readFile(seedPath(f.root))).toEqual(seed);
  expect(await readFile(markerPath(f.root))).toEqual(f.marker);
  expect(await codeRefs(f.root)).toBe(refs);
  expect(stored(await f.store.version())).toBe(version);
  expect(await Promise.all([f.meta.reference, other.meta.reference].map(async reference => stored(await f.store.read({ reference }))))).toEqual(records);
}, SESSION_COMMAND_TIMEOUT_MS);

it.each(["abandon", "decompose"] as const)("enters and recovers the retired %s subject with its primary removed", async kind => {
  const root = await sessionRepo();
  const branch = "feat/retired-subject";
  await git(root, ["switch", "-c", branch]);
  const { meta } = await seedWorkUnit(root, "retired-subject", { identity: sessionIdentity, branch, bind: root,
    meta: { owner: sessionIdentity, branch, state: "Active" } });
  const store = fixtureStore(root);
  const primary = stored(await store.read({ reference: meta.reference }));
  const { name, uid } = seededWorkUnitSubject(meta);
  const successors = [];
  if (kind === "decompose") {
    const successor = seededWorkUnitSubject((await seedWorkUnit(root, "successor", { identity: sessionIdentity })).meta);
    successors.push({ name: successor.name, uid: successor.uid });
  }
  const lineageRef = recordReferences["lineage/transition"](meta.reference.owner);
  const retained = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name, uid }, kind, successors, incoming: [],
    retiredBranches: primary.links?.branches ?? [], ...(kind === "decompose" ? { outgoing: [] } : {}) });
  expect(retained.retiredBranches).toEqual([expect.objectContaining({ ref: branch })]);
  stored(await store.batch({ writes: [
    { action: "remove", reference: meta.reference, expected: primary.version },
    { action: "put", reference: lineageRef, expected: null, content: writeLineageRecord(retained) },
  ], provenance: { verb: kind, lifecycleAction: kind } }));
  const version = stored(await store.version());
  const lineage = stored(await store.read({ reference: lineageRef }));
  const marker = await readFile(markerPath(root));
  const refs = await codeRefs(root);
  const head = await git(root, ["rev-parse", "HEAD"]);
  const subject = { kind: "selected", row: { kind: "retired", subject: { kind: "work-unit", key: name, uid } } };
  const entry = await enter(root);
  expect(entry).toMatchObject({ derivedLocusState: { ok: true, value: { entering: subject } },
    compactionSeedWrite: { status: "written" }, locusGuidance: { kind: "ready", cleanup: [expect.stringContaining("Cleanup is available")] },
    roster: { ok: true, value: { entries: [{ worktreePath: root, branch, workUnit: name, retired: true }], warnings: [] } },
  });
  expect(await recover(root)).toMatchObject({ derivedLocusState: { ok: true, value: { entering: subject } },
    recoveryFrame: { ok: true, value: { kind: "none" } } });
  const audited = await audit(root);
  expect(audited.recover).toMatchObject({ derivedLocusState: { ok: true, value: { entering: subject } } });
  expect(audited.verdict.stopReasons).not.toContainEqual(expect.objectContaining({ kind: "locus-unresolved" }));
  const seed = CompactionSeedSchema.parse(JSON.parse(await readFile(seedPath(root), "utf8")));
  expect(seed).toMatchObject({ stateVersion: version, activeWorkUnit: null, head, branch, locus: { checkoutPath: root } });
  expect(await store.read({ reference: meta.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(stored(await store.lookup({ kind: "lineage", origin: uid })).reference).toEqual(lineageRef);
  expect(JSON.parse(lineage.content)).toMatchObject(retained);
  expect(stored(await store.read({ reference: lineageRef }))).toEqual(lineage);
  expect(stored(await store.version())).toBe(version);
  expect(await readFile(markerPath(root))).toEqual(marker);
  expect(await codeRefs(root)).toBe(refs);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
}, SESSION_COMMAND_TIMEOUT_MS);
