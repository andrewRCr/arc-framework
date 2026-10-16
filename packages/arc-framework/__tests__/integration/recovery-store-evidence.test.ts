/** Recovery compares the saved operational task list to current Store bytes. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { resolveRecoveryTaskListEvidence } from "../../src/lib/recover/task-list-evidence.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import type { GitExec } from "../../src/lib/git/exec.js";

const noGit: GitExec = () => Promise.reject(new Error("Operational evidence must not read the code tree"));
it("reads the seed's saved task list and the pinned current task list", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("subject");
  const reference = recordReferences["work-item/task-list"](meta.reference.owner);
  const before = "# Tasks\n\n### `[ ]` **1.1 Implement**\n";
  const after = before.replace("[ ]", "[x]");
  const task = await h.seed(reference, before);
  const stateVersion = lifecycleSuccess(await h.store.version());
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: task.version, content: after,
    provenance: { verb: "task-close", lifecycleAction: "update" } }));
  expect(await resolveRecoveryTaskListEvidence({ cwd: "/absent-checkout", exec: noGit, seedHead: "code-head",
    taskListPath: ".arc/active/tasks-subject.md", store: h.store, stateVersion }))
    .toEqual({ status: "ok", seed: before, fresh: after });
});
