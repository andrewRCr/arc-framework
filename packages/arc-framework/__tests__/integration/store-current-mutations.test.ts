/** Current-checkout mutations retain the live owner while a completed namesake is paused. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lifecycleReuseFixture } from "../fixtures/lifecycle-reuse.js";
import { repairCli } from "../helpers/repair-cli.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { MetaPauseSchema } from "../../src/lib/active/meta-schema.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

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
