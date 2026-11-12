/** Shared-reference authority leaves started work's prose and dependencies authored by its owner. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { runStoreRename } from "../../../../src/lib/work-unit/verbs/rename-store.js";
import { writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";

it("reports a paused work-unit wait without rewriting its authored metadata", async () => {
  const h = createDecomposeHarness(); await h.seedStub("source");
  const initial = await h.seedMeta("waiting");
  lifecycleSuccess(await h.store.write({ ...recordPut(initial, { content: writeMetaPause(initial.content, { pausedBy: SlugSchema.parse("test-user"),
    since: "2026-10-16T00:00:00Z", reason: "Wait for work.", waitsOn: { kind: "work-unit", slug: SlugSchema.parse("source") },
    resumeNotes: null, open: true }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const waiting = lifecycleSuccess(await h.store.read({ reference: initial.reference }));
  const git = scriptGitExec([]), result = await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" },
    { operand: "source", targetSlug: "target" });
  expect(lifecycleSuccess(await h.store.read({ reference: waiting.reference }))).toEqual(waiting);
  expect(result).toMatchObject({ status: "renamed", report: { references: [
    { record: { type: "work-unit", name: "waiting", uid: expect.any(String) },
      edits: [{ kind: "field", field: "waitsOn", from: "source", to: "target" }] },
  ] } });
  expect(git.calls).toEqual([]);
});

it.each(["active", "parked"] as const)("reports the %s dependent's edge while leaving its prose untouched", async kind => {
  const h = createDecomposeHarness(), source = await h.seedStub("source");
  const initial = await h.seedMeta("waiting", { dependsOn: ["source"] }, kind === "active"
    ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  const waiting = await h.handEdit(initial, `${initial.content}\nKeep \`spec-source.md\` as written.\n`);
  const git = scriptGitExec([]), result = await runStoreRename({ store: h.store, cwd: "/repo", exec: git.exec, baseBranch: "main" },
    { operand: "source", targetSlug: "target" });
  expect(lifecycleSuccess(await h.store.read({ reference: waiting.reference }))).toEqual(waiting);
  expect(result).toMatchObject({ status: "renamed", report: { references: [
    { record: { type: "work-unit", name: "waiting", uid: expect.any(String) },
      edits: [{ kind: "field", field: "dependsOn", from: "source", to: "target" }] },
  ] } });
  expect(lifecycleSuccess(await h.store.read({ reference: source.reference })).reference.owner.name).toBe("target");
  expect(git.calls).toEqual([]);
});
