/** A code adversarial pass binds the HEAD of the checkout holding its work unit, and no other checkout's. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { adversarialPassFixture } from "../fixtures/review-adversarial-pass.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { handleReviewAdversarialRecord } from "../../src/handlers/review-adversarial.js";

function request(activity: "verification" | "criteria") {
  const { artifacts, codeHead, ...header } = adversarialPassFixture(activity);
  void artifacts; void codeHead;
  return { ...header, workUnit: "example" };
}

it("binds a code pass to the HEAD of the checkout holding its work unit and refuses any other checkout", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, store = h.reference.store;
  const primary = await h.reference.seedMeta("example");
  const spec = await h.reference.seed(recordReferences["work-item/spec"](primary.reference.owner),
    "# Spec\n\nA reviewed specification.\n");
  const tasks = await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Tasks\n\n### `[ ]` **1.1 Implement behavior**\n\n- _Goal:_ Implement it.\n");
  await h.reference.seedMeta("another-work-item");
  const occupy = (name: string) => writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user",
    createdAt: "2026-10-20T18:00:00Z", createdFor: { kind: "work-unit", name } });
  const run = async (activity: "verification" | "criteria") => {
    let output = "", exitCode = 0;
    await handleReviewAdversarialRecord("-", { resolveRoot: () => cwd,
      readText: () => Promise.resolve(JSON.stringify(request(activity))), write: text => { output += text; },
      setExitCode: code => { exitCode = code; } }, undefined, { store, exec });
    return { envelope: JSON.parse(output), exitCode };
  };
  const before = await store.version();
  for (const holder of [null, "another-work-item"]) {
    if (holder !== null) await occupy(holder);
    expect(await run(holder === null ? "verification" : "criteria")).toMatchObject({ exitCode: 1, envelope: { error: {
      code: "invalid-input", message: expect.stringContaining("work unit `example`'s checkout") } } });
    expect(await store.version()).toEqual(before);
  }
  await occupy("example");
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  for (const activity of ["verification", "criteria"] as const) {
    const result = await run(activity);
    expect(result.exitCode, JSON.stringify(result.envelope)).toBe(0);
    const saved = lifecycleSuccess(await store.read({
      reference: recordReferences["review/adversarial-pass"](primary.reference.owner, result.envelope.payload.key) }));
    expect(JSON.parse(saved.content)).toMatchObject({ ...adversarialPassFixture(activity), codeHead: head,
      artifacts: { spec: spec.version, taskList: tasks.version } });
  }
});
