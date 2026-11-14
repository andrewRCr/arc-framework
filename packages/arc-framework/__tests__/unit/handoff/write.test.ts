/** Handoff refuses an unbound ambient claim before writing metadata or computed anchors. */
import { expect, it } from "vitest";
import { runHandoffWrite } from "../../../src/lib/handoff/write.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { boundWorkUnitCheckout, boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { runDormantStoreCommand } from "../../../src/commands/store-command-support.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { handoffWriteStep } from "../../../src/lib/store/pre-flip-steps.js";
import { inRepoStore } from "../../helpers/store/in-repo-ports.js";

it("reports binding and release exits, then writes handoff after the marker is bound", async () => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example"), cwd = await boundWorkUnitCheckout(primary);
  const marker = { spawnedByArc: false, createdFor: { kind: "work-unit" as const, name: "example" },
    spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" };
  await writeWorktreeMarker(cwd, marker);
  const head = "a".repeat(40), before = lifecycleSuccess(await h.store.version());
  const exec = scriptGitExec([{ match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] }]).exec;
  const request = { schemaVersion: 1, sessionContext: "Continue here.", nextAction: "Finish the task", sessionType: "execution" };
  const input = { cwd, store: h.store, exec, request, sync: createStoreSyncPort({ maintain: async () => ({ measurements: [] }) }) };
  const result = await runHandoffWrite(input);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "no-current-work-unit",
    condition: expect.stringContaining("arc materialize example --here") } });
  expect(result).toMatchObject({ refusal: { condition: expect.stringContaining("arc locus release") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  await writeWorktreeMarker(cwd, { ...marker, createdFor: boundWorkUnitSubject(primary) });
  expect(await runHandoffWrite(input)).toMatchObject({ status: "written", reference: primary.reference });
  expect(lifecycleSuccess(await h.store.read({ reference: primary.reference })).fields).toMatchObject({
    sessionContext: request.sessionContext, nextAction: request.nextAction, commitAtHandoff: head, stateAtHandoff: before,
  });
});

it("refuses before the flip with the same hand-written handoff step the dormant command names", async () => {
  const exec = scriptGitExec([]).exec, store = inRepoStore(createDefaultStorePorts({ checkoutRoot: "/checkout", exec }));
  expect(await runHandoffWrite({ cwd: "/checkout", store, exec, request: {} }))
    .toMatchObject({ status: "refused", refusal: { code: "unsupported-handoff", remedy: { text: handoffWriteStep() } } });
  expect(runDormantStoreCommand("handoff write", store).refusal.remedy.text).toBe(handoffWriteStep());
});
