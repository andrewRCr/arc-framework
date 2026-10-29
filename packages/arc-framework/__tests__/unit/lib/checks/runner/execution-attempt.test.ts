/** Attempt interruption remains usable before context acquisition and never asserts settlement. */
import { expect, it } from "vitest";
import { createExecutionAttemptControl } from "../../../../../src/lib/checks/runner/execution-attempt.js";
import { makeRunnerProtocolPlan } from "../../../../fixtures/checks/runner-protocol.js";
import { runnerStreamHarness, prepare, reply } from "../../../../fixtures/checks/runner-streams.js";
import type { RunnerRequest } from "../../../../../src/lib/checks/runner/contract.js";

it("cancels pending local capture before an adapter exists without inventing an acknowledgement", async () => {
  const control = createExecutionAttemptControl(makeRunnerProtocolPlan().planId);
  await expect(control.cancel()).resolves.toBeUndefined();
  expect(control.cancelled).toBe(true);
  expect(control.signal.aborted).toBe(true);
});

it("delivers cancellation with current attempt/context coordinates and keeps retained recovery available", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const plan = makeRunnerProtocolPlan();
  const control = createExecutionAttemptControl(plan.planId);
  control.bindCaptured(() => ({ planId: plan.planId, contextId: "context", adapter: ["adapter"], sourceRoot: plan.source.root,
    manifest: plan.source.manifest, environmentFiles: [], recovery: h.session.recovery?.instructions }));
  control.attachSession(h.session);
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as RunnerRequest;
    if (request.method !== "check/cancel") return;
    if (request.params.planId === plan.planId && request.params.contextId === "context") reply(h, { planId: plan.planId, accepted: true }, request.id);
    else h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32602, message: "Wrong cancellation coordinates" } })}\n`);
  });
  await expect(control.cancel()).resolves.toEqual({ planId: plan.planId, accepted: true });
  expect(control.retained?.recovery).toBe("Inspect and settle this attempt with adapter inspect.");
  expect(control.cancelled).toBe(true);
  await h.close();
  await expect(control.cancel()).resolves.toBeUndefined();
});

it("terminates the local adapter without converting its process exit into settlement", async () => {
  const h = runnerStreamHarness();
  const control = createExecutionAttemptControl(makeRunnerProtocolPlan().planId);
  control.attachSession(h.session);
  control.terminate();
  await h.close();
  await expect(h.session.closed).resolves.toMatchObject({ signal: "SIGTERM" });
  expect(control.signal.aborted).toBe(true);
  expect(control.cancelled).toBe(true);
});
