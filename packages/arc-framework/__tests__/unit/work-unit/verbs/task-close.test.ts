/** Task closure and deferral use checked reference-store batches and scripted Git boundaries. */
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec, scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { recordReferences, type Links, type Store } from "../../../../src/lib/store/index.js";
import { runTaskClose, runTaskDefer, type TaskVerbContext } from "../../../../src/lib/work-unit/verbs/task-close.js";

const first = "a".repeat(40), second = "b".repeat(40), base = "c".repeat(40);
const tasks = (parent = " ", a = " ", b = " ") => `# Task List: demo\n\n### \`[${parent}]\` **1.1 Work**\n\n- _Goal:_ Build the work.\n\n    - \`[${a}]\` **1.1.a First**\n    - \`[${b}]\` **1.1.b Second**\n\n### \`[ ]\` **1.2 Later**\n\n- _Goal:_ Finish.\n`;
function facade(store: Store): Store {
  return { capabilities: store.capabilities, read: (input) => store.read(input), lookup: (input) => store.lookup(input),
    list: (input) => store.list(input), write: (input) => store.write(input), batch: (input) => store.batch(input),
    version: () => store.version(), history: (input) => store.history(input), changes: (input) => store.changes(input), sync: () => store.sync() };
}
async function harness(content = tasks(), links: Links = { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] }, objectType = "commit") {
  const { store, seedMeta, seed } = createLifecycleHarness();
  const meta = await seedMeta("demo", {}, { kind: "active" }, links);
  const taskRef = recordReferences["work-item/task-list"](meta.reference.owner);
  await seed(taskRef, content);
  const git = scriptGitExec([
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: "feat/demo\n" }] },
    { match: ["remote"], responses: [{ stdout: "" }] },
    { match: { prefix: ["--no-replace-objects", "rev-parse"] }, responses: [{ stdout: base }] },
    { match: { prefix: ["--no-replace-objects", "rev-list"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["--no-replace-objects", "cat-file", "-t"] }, responses: [{ stdout: `${objectType}\n` }] },
    { match: { prefix: ["--no-replace-objects", "merge-base"] }, responses: [{ stdout: "" }] },
  ]);
  const raw = scriptRawGitExec([
    { match: ["--no-replace-objects", "cat-file", "--batch"], responses: [({ options }) => ({ stdout: Buffer.from(Buffer.from(options?.input ?? []).toString().trim().split("\n").map((sha) => `${sha} missing\n`).join("")) })] },
  ]);
  const ctx: TaskVerbContext = { store, cwd: "/repo", slug: "demo", baseBranch: "main", projectId: async () => "repo", exec: git.exec, execRaw: raw.exec };
  return { ctx, store, git, taskRef, meta,
    readTasks: async () => lifecycleSuccess(await store.read({ reference: taskRef })),
    readMeta: async () => lifecycleSuccess(await store.read({ reference: meta.reference })),
  };
}
it("bare close closes only the cursor leaf", async () => {
  const h = await harness();
  const result = await runTaskClose(h.ctx);
  expect(result).toMatchObject({ status: "closed", ids: ["1.1.a"] });
  expect((await h.readTasks()).content).toBe(tasks(" ", "x", " "));
});
it("named set closes leaves and its cascade parent without capturing the parent", async () => {
  const h = await harness();
  expect((await runTaskClose(h.ctx, { ids: ["1.1.a", "1.1.b"], commits: [first] })).status).toBe("closed");
  expect((await h.readTasks()).content).toBe(tasks("x", "x", "x"));
  expect((await h.readMeta()).links?.taskCaptures).toEqual({ "1.1.a": [{ repository: "repo", sha: first }], "1.1.b": [{ repository: "repo", sha: first }] });
});
it("closing a named parent closes its open subtasks with captures", async () => {
  const h = await harness();
  await runTaskClose(h.ctx, { ids: ["1.1"], commits: [first] });
  expect((await h.readTasks()).content).toBe(tasks("x", "x", "x"));
  expect(Object.keys((await h.readMeta()).links?.taskCaptures ?? {})).toEqual(["1.1", "1.1.a", "1.1.b"]);
});
it("re-close adds a capture and keeps all prior captures; an empty re-close says unchanged", async () => {
  const h = await harness();
  await runTaskClose(h.ctx, { ids: ["1.1.a"], commits: [first] });
  await runTaskClose(h.ctx, { ids: ["1.1.a"], commits: [second] });
  expect((await h.readMeta()).links?.taskCaptures?.["1.1.a"]).toEqual([{ repository: "repo", sha: first }, { repository: "repo", sha: second }]);
  expect(await runTaskClose(h.ctx, { ids: ["1.1.a"] })).toMatchObject({ status: "closed", changed: false, captured: [] });
});
it("deferring the last open subtask closes its parent x when another child was completed", async () => {
  const h = await harness(tasks(" ", "x", " "));
  expect(await runTaskDefer(h.ctx, "1.1.b")).toMatchObject({ status: "deferred" });
  expect((await h.readTasks()).content).toBe(tasks("x", "x", "~"));
  expect((await h.readMeta()).links?.taskCaptures).toBeUndefined();
});
it("deferring a parent defers its open children and closes it ~", async () => {
  const h = await harness(); await runTaskDefer(h.ctx, "1.1");
  expect((await h.readTasks()).content).toBe(tasks("~", "~", "~"));
});
it("a parent deferred over an already completed child closes x", async () => {
  const h = await harness(tasks(" ", "x", " ")); await runTaskDefer(h.ctx, "1.1");
  expect((await h.readTasks()).content).toBe(tasks("x", "x", "~"));
});
it("explicit capture removes every matching exclusion and keeps unrelated branches", async () => {
  const h = await harness(tasks(), { branches: [
    { repository: "repo", ref: "feat/demo", linkedAs: "adopted", excluded: [{ repository: "repo", sha: first }] },
    { repository: "other", ref: "feat/demo", linkedAs: "created", excluded: [{ repository: "other", sha: first }] },
  ] });
  await runTaskClose(h.ctx, { ids: ["1.1.a"], commits: [first] });
  expect((await h.readMeta()).links?.branches?.map((branch) => branch.excluded)).toEqual([[], [{ repository: "other", sha: first }]]);
});
it.each(["x", "~"])("defer refuses an already %s task without changes", async (marker) => {
  const h = await harness(tasks(" ", marker, " "));
  const before = await h.readTasks();
  expect(await runTaskDefer(h.ctx, "1.1.a")).toMatchObject({ status: "refused", remedy: { text: expect.stringContaining("new task") } });
  expect(await h.readTasks()).toEqual(before);
});
it("unknown IDs refuse with available IDs before any records change", async () => {
  const h = await harness(); const before = await h.readTasks();
  expect(await runTaskClose(h.ctx, { ids: ["9.9"] })).toMatchObject({ status: "refused", remedy: { text: expect.stringContaining("1.1.a") } });
  expect(await h.readTasks()).toEqual(before);
});
it("no cursor task refuses and names a deferred task's close", async () => {
  const h = await harness(tasks("~", "~", "~").replace("### `[ ]` **1.2", "### `[~]` **1.2"));
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "refused", remedy: { text: expect.stringContaining("arc task close 1.1") } });
});
it.each(["close", "defer"])("%s refuses unsupported before the flip", async (operation) => {
  const h = await harness(); h.ctx.store = { ...facade(h.store), capabilities: { stateOffBranch: false } };
  const result = operation === "close" ? await runTaskClose(h.ctx) : await runTaskDefer(h.ctx, "1.1");
  expect(result).toMatchObject({ status: "refused", code: "unsupported", remedy: { text: expect.stringContaining(operation === "close" ? "[x]" : "[~]") } });
});
it.each(["Planning", "Active"] as const)("no branch link on %s names the activation repair", async (state) => {
  const h = await harness(tasks(), {});
  const { writeMetaState, writeMetaCurrentWorkflow } = await import("../../../../src/lib/store/kinds/meta/writers.js");
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.meta.reference, expected: h.meta.version,
    content: writeMetaCurrentWorkflow(writeMetaState(h.meta.content, state), state === "Planning" ? "draft-design" : "process-task-loop"), placement: { kind: "active" }, provenance: { verb: "seed-state", lifecycleAction: "set" } }));
  const result = await runTaskClose(h.ctx);
  expect(result).toMatchObject({ status: "refused", code: "branch-unlinked", remedy: { text: expect.stringContaining(state === "Planning" ? "arc activate" : "arc deactivate demo") } });
});

it.each(["close", "defer"])("%s checks the pause before Git or task mutation", async (operation) => {
  const h = await harness(); const { writeMetaPause } = await import("../../../../src/lib/store/kinds/meta/writers.js");
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.meta.reference, expected: h.meta.version,
    content: writeMetaPause(h.meta.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Waiting", waitsOn: null, open: false, resumeNotes: null }),
    placement: { kind: "active" }, provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const before = await h.readTasks();
  const result = operation === "close" ? await runTaskClose(h.ctx) : await runTaskDefer(h.ctx, "1.1.a");
  expect(result).toMatchObject({ status: "refused", code: "paused", remedy: { argv: ["arc", "resume", "demo"] } });
  expect(await h.readTasks()).toEqual(before);
});
it("concurrent metadata changes refuse a deferral atomically", async () => {
  const h = await harness(); const before = await h.readTasks(); const original = h.store.batch.bind(h.store);
  let changed = false;
  h.ctx.store = { ...facade(h.store), batch: async (input) => {
    if (!changed) {
      changed = true;
      const { writeMetaPause } = await import("../../../../src/lib/store/kinds/meta/writers.js");
      lifecycleSuccess(await h.store.write({ action: "put", reference: h.meta.reference, expected: h.meta.version,
        content: writeMetaPause(h.meta.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Waiting", waitsOn: null, open: false, resumeNotes: null }),
        placement: { kind: "active" }, provenance: { verb: "pause", lifecycleAction: "pause" } }));
    }
    return original(input);
  } };
  expect(await runTaskDefer(h.ctx, "1.1.a")).toMatchObject({ status: "refused", code: "version-conflict", refusal: { code: "version-conflict" } });
  expect(await h.readTasks()).toEqual(before);
});
it("a malformed sibling lifecycle record refuses before task writes", async () => {
  const h = await harness(); const before = await h.readTasks();
  const sibling = await h.store.write({ action: "put", reference: recordReferences["work-item/meta"](h.meta.reference.owner), expected: h.meta.version,
    content: h.meta.content, placement: { kind: "active" }, provenance: { verb: "seed", lifecycleAction: "keep" } });
  lifecycleSuccess(sibling);
  const list = h.store.list.bind(h.store);
  h.ctx.store = { ...facade(h.store), read: h.store.read.bind(h.store), lookup: h.store.lookup.bind(h.store), list: async (input) => {
    const result = await list(input);
    if (result.status === "ok" && result.result.status === "complete") return { status: "ok", result: { ...result.result, diagnostics: [{ kind: "malformed", key: "sibling",
      condition: "Sibling metadata is malformed", remedy: { text: "Repair sibling metadata" } }] } };
    return result;
  } };
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "refused", code: "inventory-incomplete", reason: expect.stringContaining("Repair sibling metadata") });
  expect(await h.readTasks()).toEqual(before);
});

it.each(["detached", "unlinked"])("%s checkout refuses and names its work branch", async (kind) => {
  const h = await harness(); h.ctx.exec = scriptGitExec([{ match: ["symbolic-ref", "--quiet", "--short", "HEAD"],
    responses: [kind === "detached" ? { failure: { exitCode: 1 } } : { stdout: "other-branch" }] }]).exec;
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "refused", code: "branch-unlinked", remedy: { text: expect.stringContaining("git switch feat/demo") } });
});
it("a base refresh that empties the set refuses; its rerun closes with no capture", async () => {
  const h = await harness(); const before = await h.readTasks();
  h.ctx.exec = scriptGitExec([
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: "feat/demo" }] },
    { match: ["remote"], responses: [{ stdout: "origin" }] },
    { match: { prefix: ["fetch"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["--no-replace-objects", "rev-parse"] }, responses: [{ stdout: base }] },
    { match: { prefix: ["--no-replace-objects", "rev-list"] }, responses: [{ stdout: first }, { stdout: "" }] },
  ]).exec;
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "refused", code: "base-emptied-set", reason: expect.stringContaining(first), remedy: { text: expect.stringContaining("arc task close 1.1.a") } });
  expect(await h.readTasks()).toEqual(before);
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "closed", captured: [] });
});
it("release precheck accepts an emptied precommit set for the new commit to follow", async () => {
  const h = await harness(); const { prepareTaskClose } = await import("../../../../src/lib/work-unit/verbs/task-close.js");
  h.ctx.exec = scriptGitExec([
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: "feat/demo" }] },
    { match: ["remote"], responses: [{ stdout: "origin" }] },
    { match: { prefix: ["fetch"] }, responses: [{ stdout: "" }] },
    { match: { prefix: ["--no-replace-objects", "rev-parse"] }, responses: [{ stdout: base }] },
    { match: { prefix: ["--no-replace-objects", "rev-list"] }, responses: [{ stdout: first }, { stdout: "" }] },
  ]).exec;
  expect(await prepareTaskClose(h.ctx, {}, { precommit: true })).toMatchObject({ status: "prepared" });
});


it("refuses an explicit tag object before changing task marks or captures", async () => {
  const h = await harness(tasks(), undefined, "tag");
  const beforeTasks = await h.readTasks(), beforeMeta = await h.readMeta();
  expect(await runTaskClose(h.ctx, { ids: ["1.1.a"], commits: [first] }))
    .toMatchObject({ status: "refused", reason: expect.stringContaining("not a commit") });
  expect(await h.readTasks()).toEqual(beforeTasks);
  expect(await h.readMeta()).toEqual(beforeMeta);
});
