/** Piped in-memory adapter boundary shared by conversation tests. */
import { PassThrough } from "node:stream";
import { createCheckRunnerSession } from "../../../src/lib/checks/runner/session.js";
import type { CheckRunnerProcessExit } from "../../../src/lib/checks/runner/session-process.js";
import type { RunnerNotification, RunnerRequest } from "../../../src/lib/checks/runner/contract.js";
import { makeRunnerProtocolPlan, makeRunnerProtocolReady } from "./runner-protocol.js";

export function runnerStreamHarness(onNotification?: (notification: RunnerNotification) => void | Promise<void>,
  onDiagnostic?: (bytes: Uint8Array) => void | Promise<void>) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let finish!: (exit: CheckRunnerProcessExit) => void;
  const completed = new Promise<CheckRunnerProcessExit>(resolve => { finish = resolve; });
  const requests: RunnerRequest[] = [];
  stdin.on("data", (bytes: Buffer) => { requests.push(JSON.parse(bytes.toString("utf8")) as RunnerRequest); });
  const notifications: RunnerNotification[] = [];
  const session = createCheckRunnerSession({ argv: ["adapter"], cwd: "/repository",
    launch: () => ({ stdin, stdout, stderr, completed, terminate: () => { finish({ started: true, signal: "SIGTERM" }); } }),
    onNotification: onNotification ?? (notification => { notifications.push(notification); }),
    onDiagnostic,
  });
  return { stdin, stdout, stderr, requests, notifications, session,
    async close() { stdout.end(); stderr.end(); finish({ started: true, exitCode: 0 }); await session.closed; },
  };
}

export function reply(h: ReturnType<typeof runnerStreamHarness>, result: unknown, id = h.requests.at(-1)?.id): void {
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

export function recovery(h: ReturnType<typeof runnerStreamHarness>): void {
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/recovery", params: {
    planId: makeRunnerProtocolPlan().planId, instructions: "Inspect and settle this attempt with adapter inspect." } })}\n`);
}

export function completeRun(h: ReturnType<typeof runnerStreamHarness>): void {
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/outcome", params: {
    contextId: "context", invocationId: "__proto__", outcome: { status: "completed", exitCode: 0 } } })}\n`);
  reply(h, { contextId: "context", settled: true, outputComplete: true, invocationIds: ["__proto__"] });
}

export async function prepare(h: ReturnType<typeof runnerStreamHarness>): Promise<void> {
  const plan = makeRunnerProtocolPlan();
  const pending = h.session.request({ method: "check/prepare", params: plan });
  recovery(h);
  reply(h, makeRunnerProtocolReady(plan));
  await pending;
}
