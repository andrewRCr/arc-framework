/** Current-checkout mutations retain the live owner while a completed namesake is paused. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { MetaPauseSchema } from "../../src/lib/active/meta-schema.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import * as currentWorkUnit from "../../src/lib/store/current-work-unit.js";

it.each(["set-stage", "task-close", "finalize", "repoint-design"] as const)("%s mutates the current live owner beside a paused completed holder", async verb => {
  const f = await lifecycleReuseFixture(false, { state: verb === "task-close" ? "Active" : "Planning",
    currentWorkflow: verb === "task-close" ? "process-task-loop" : verb === "finalize" ? "create-spec" : "draft-design",
    ...(verb === "task-close" ? { taskList: "tasks-example.md" } : {}) });
  const pause = MetaPauseSchema.parse({ reason: "Ended holder is paused", since: "2026-10-24T00:00:00Z", pausedBy: "test-user", open: false });
  lifecycleSuccess(await f.store.write({ ...recordPut(f.archived, { content: writeMetaPause(f.archived.content, pause) }),
    provenance: { verb: "fixture", lifecycleAction: "pause" } }));
  const archived = lifecycleSuccess(await f.store.read({ reference: f.archived.reference }));
  let argv: string[];
  if (verb === "task-close") {
    await f.seed(recordReferences["work-item/task-list"](f.live.reference.owner), "# Task List: example\n\n### `[ ]` **1.1 Work**\n");
    await f.exec("git", ["switch", "-c", "feat/example"]);
    await writeFile(join(f.cwd, "work.txt"), "Completed task work\n");
    await f.exec("git", ["add", "work.txt"]); await f.exec("git", ["commit", "-m", "Task work"]);
    const sha = (await f.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    lifecycleSuccess(await f.store.write({ ...recordPut(f.live, { links: {
      branches: [{ repository: f.repository, ref: "feat/example", linkedAs: "created", excluded: [] }],
    } }), provenance: { verb: "fixture", lifecycleAction: "link" } }));
    argv = ["task", "close", "1.1", "--commit", sha];
  } else if (verb === "repoint-design") {
    await f.seed(recordReferences["work-item/draft"](f.live.reference.owner), "# Draft: example\n");
    argv = [verb, "draft-created"];
  } else argv = verb === "set-stage" ? [verb, "create-spec"] : [verb, "create-spec", "--class", "Heavy"];
  const owner = f.live.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the live owner's UID");
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(f.cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example", uid: owner.uid },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" });
  const result = await repairCli(f, argv, { store: f.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: archived.reference }))).toEqual(archived);
  expect(lifecycleSuccess(await f.store.read({ reference: f.oldNotes.reference }))).toEqual(f.oldNotes);
  const live = lifecycleSuccess(await f.store.read({ reference: f.live.reference }));
  expect(live.fields).toMatchObject({ pause: null });
  if (verb === "set-stage") expect(live.fields).toMatchObject({ currentWorkflow: "create-spec" });
  else if (verb === "finalize") expect(live.fields).toMatchObject({ workClass: "Heavy" });
  else if (verb === "repoint-design") expect(live.fields).toMatchObject({ design: ["draft-example.md"] });
  else expect(lifecycleSuccess(await f.store.read({ reference: recordReferences["work-item/task-list"](owner) })).content)
    .toContain("### `[x]` **1.1 Work**");
}, 30_000);

it("refuses spec finalization when the checkout's selected name has been reused", async () => {
  const f = await lifecycleReuseFixture(false);
  await ensureWorktreeMarkerIgnored(f.cwd, f.exec, nodeWorktreeMarkerIgnoreFs);
  const marker = { spawnedByArc: false, createdFor: boundWorkUnitSubject(f.live),
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" } as const;
  await writeWorktreeMarker(f.cwd, marker);
  const checkout = await currentWorkUnit.resolveCurrentWorkUnit({ cwd: f.cwd, store: f.store });
  expect(checkout).toMatchObject({ status: "resolved", candidate: { reference: f.live.reference } });
  const renamed = await repairCli(f, ["rename", f.name, "renamed"], { store: f.store });
  expect(renamed.exitCode ?? 0, renamed.stdout + renamed.stderr).toBe(0);
  const archived = await repairCli(f, ["archive", "renamed"], { store: f.store });
  expect(archived.exitCode ?? 0, archived.stdout + archived.stderr).toBe(0);
  const replacement = await f.seedMeta(f.name, { state: "Planning", currentWorkflow: "create-spec", design: ["draft-example.md"] });
  const owner = replacement.reference.owner;
  const draft = await f.seed(recordReferences["work-item/draft"](owner), "# Replacement draft\n");
  await f.seed(recordReferences["work-item/spec"](owner), "# Spec (`brief`): example\n");
  const before = lifecycleSuccess(await f.store.version());

  const refused = await repairCli(f, ["repoint-design", "spec-finalized"], { storeFactory: async () => {
    // Replay the checkout read from before the rename. The verb sees the current store.
    const resolver = await import("../../src/lib/store/current-work-unit.js");
    const resolve = vi.spyOn(resolver, "resolveCurrentWorkUnit").mockResolvedValue(checkout);
    onTestFinished(() => { resolve.mockRestore(); });
    return f.store;
  } });
  expect(refused.exitCode ?? 0, refused.stdout + refused.stderr).toBe(1);
  expect(refused.stdout + refused.stderr).toContain("arc locus");
  expect(lifecycleSuccess(await f.store.version())).toBe(before);
  expect(lifecycleSuccess(await f.store.read({ reference: draft.reference }))).toEqual(draft);

  await writeWorktreeMarker(f.cwd, { ...marker, createdFor: boundWorkUnitSubject(replacement) });
  const retried = await repairCli(f, ["repoint-design", "spec-finalized"], { store: f.store });
  expect(retried.exitCode ?? 0, retried.stdout + retried.stderr).toBe(0);
  expect(lifecycleSuccess(await f.store.read({ reference: replacement.reference })).fields).toMatchObject({
    design: ["spec-example.md"], currentWorkflow: "generate-tasks",
  });
  expect(await f.store.read({ reference: draft.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
}, 30_000);
