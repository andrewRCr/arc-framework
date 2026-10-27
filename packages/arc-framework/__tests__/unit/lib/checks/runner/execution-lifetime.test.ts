/** Captured-resource ownership follows settlement rather than a consumer's control flow. */
import { afterEach, expect, it } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionLifetime } from "../../../../../src/lib/checks/runner/execution-lifetime.js";
import { runnerStreamHarness, prepare, completeRun, reply } from "../../../../fixtures/checks/runner-streams.js";
import { makeRunnerProtocolPlan } from "../../../../fixtures/checks/runner-protocol.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function ownedResource(h: ReturnType<typeof runnerStreamHarness>, failedRemoval = false) {
  const root = await mkdtemp(join(tmpdir(), "arc-execution-lifetime-"));
  directories.push(root);
  const marker = join(root, "owned-input");
  await writeFile(marker, "retained input");
  const retained = () => ({ planId: makeRunnerProtocolPlan().planId, contextId: "context", adapter: "adapter",
    sourceRoot: root, manifest: join(root, "descriptor"), environmentFiles: [], recovery: h.session.recovery?.instructions });
  const lifetime = createExecutionLifetime({ session: h.session, retained, dispose: async () => {
    if (failedRemoval) throw new Error("private removal failure");
    await rm(root, { recursive: true, force: true });
  } });
  return { lifetime, root, marker, retained };
}

function releaseReplies(h: ReturnType<typeof runnerStreamHarness>): void {
  h.stdin.on("data", (bytes: Buffer) => {
    const request = JSON.parse(bytes.toString("utf8")) as { method: string; id: string };
    if (request.method === "check/release") reply(h, { contextId: "context", released: true }, request.id);
  });
}

it("retains possibly-used inputs when a consumer closes during work, then permits settled cleanup", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const owner = await ownedResource(h);
  const running = h.session.request({ method: "check/run", params: { contextId: "context", invocationId: "__proto__" } });
  try {
    expect(await owner.lifetime.close()).toMatchObject({ status: "uncertain", retained: owner.retained() });
    await expect(access(owner.marker)).resolves.toBeUndefined();
  } finally {
    completeRun(h);
    await running;
    releaseReplies(h);
    const closing = owner.lifetime.close();
    await h.close();
    await expect(closing).resolves.toMatchObject({ status: "closed" });
  }
  await expect(access(owner.root)).rejects.toThrow();
});

it("retains inputs and recovery after transport loss despite an observed terminal failure", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const owner = await ownedResource(h);
  const running = h.session.request({ method: "check/runGroup", params: { contextId: "context", invocationIds: ["__proto__", "constructor"] } });
  const failed = expect(running).rejects.toThrow(/runner/iu);
  h.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "check/outcome", params: {
    contextId: "context", invocationId: "__proto__", outcome: { status: "completed", exitCode: 256 } } })}\ninvalid protocol\n`);
  await failed;
  await h.close();
  const result = await owner.lifetime.close();
  expect(result).toMatchObject({ status: "uncertain", retained: owner.retained() });
  await expect(access(owner.marker)).resolves.toBeUndefined();
  expect(h.session.observedOutcomes.get("__proto__")).toEqual({ status: "completed", exitCode: 256 });
});

it("reports failed removal as advisory after proven settlement and retains actionable locations", async () => {
  const h = runnerStreamHarness();
  await prepare(h);
  const owner = await ownedResource(h, true);
  releaseReplies(h);
  const closing = owner.lifetime.close();
  await h.close();
  const result = await closing;
  expect(result.status).toBe("closed");
  if (result.status !== "closed") throw new Error("Expected closed resources");
  expect(result.cleanupWarning).toContain(JSON.stringify(owner.root));
  expect(result.cleanupWarning).not.toContain("private removal failure");
  await expect(access(owner.marker)).resolves.toBeUndefined();
});
