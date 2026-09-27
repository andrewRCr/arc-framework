import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from
  "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { deliveryPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";

const roots: string[] = [];

function request(input: {
  readonly diffBaseSha?: string;
  readonly headSha?: string;
  readonly scopeSelected?: boolean;
} = {}) {
  const target = {
    kind: "change-set",
    baseRef: "main",
    diffBaseSha: input.diffBaseSha ?? "a".repeat(40),
    headSha: input.headSha ?? "c".repeat(40),
  };
  return JSON.stringify({
    schemaVersion: 1,
    target,
    ...(input.scopeSelected ? { scopeSelection: { mode: "chunked", target } } : {}),
  });
}

async function enabledRepository(): Promise<{
  readonly root: string;
  readonly request: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "arc-review-chunking-enabled-e2e-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(
    join(root, ".arc/system/arc-config.yml"),
    "changeset.advisory_threshold_lines: 0\nchangeset.advisory_threshold_files: 1\n",
  );
  await writeFile(join(root, "base.txt"), "base\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
  const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  await writeFile(join(root, "change.txt"), "change\n");
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "change"], { cwd: root });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return {
    root,
    request: request({ diffBaseSha: base, headSha: head }),
  };
}

function runStdin(cwd: string, input: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, "review", "changeset", "resolve", "-"], {
      cwd,
      stdio: "pipe",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      exitCode: code ?? 1,
    }));
    child.stdin.end(input);
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("arc review changeset resolve", () => {
  it("supports file success and stdin error with one JSON envelope each", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-review-chunking-e2e-"));
    roots.push(root);
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, ".arc/system"), { recursive: true });
    await writeFile(
      join(root, ".arc/system/arc-config.yml"),
      "changeset.advisory_threshold_lines: 0\nchangeset.advisory_threshold_files: 0\n",
    );
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "base.txt"), "base\n");
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const inputPath = join(root, "request.json");
    await writeFile(inputPath, request({ diffBaseSha: head, headSha: head }));

    const success = await runCli(["review", "changeset", "resolve", inputPath], { cwd: root });
    expect(success.exitCode).toBe(0);
    expect(success.stderr).not.toMatch(/prompt|review provider/iu);
    expect(success.stdout.trim().split("\n"), success.stdout).toHaveLength(1);
    const successEnvelope = JSON.parse(success.stdout) as {
      payload: { target: { repositoryId: string; targetId: string; diffBaseTree: string; headTree: string } };
    };
    expect(successEnvelope).toMatchObject({
      mode: "review-chunking-resolve",
      state: "disabled",
      payload: {
        target: { kind: "change-set", baseRef: "main", diffBaseSha: head, headSha: head },
      },
    });
    expect(successEnvelope.payload.target.repositoryId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(successEnvelope.payload.target.targetId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(successEnvelope.payload.target.diffBaseTree).toMatch(/^[0-9a-f]{40}$/u);
    expect(successEnvelope.payload.target.headTree).toBe(successEnvelope.payload.target.diffBaseTree);

    const failure = await runStdin(root, "{}");
    expect(failure.exitCode).not.toBe(0);
    expect(failure.stderr).not.toMatch(/prompt|review provider/iu);
    expect(failure.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(failure.stdout)).toMatchObject({
      mode: "review-chunking-resolve",
      error: { code: "invalid-input" },
    });
  });

  it("selects unbound, selected, bound, and degraded exact-target arms", async () => {
    const unbound = await enabledRepository();
    expect(JSON.parse((await runStdin(unbound.root, unbound.request)).stdout))
      .toMatchObject({ state: "consider-chunks", payload: { remedy: "review-chunks" } });

    const selected = JSON.parse(unbound.request) as { target: unknown };
    expect(JSON.parse((await runStdin(unbound.root, JSON.stringify({
      ...selected,
      schemaVersion: 1,
      scopeSelection: { mode: "chunked", target: selected.target },
    }))).stdout)).toMatchObject({ state: "scope-selected", nextAction: "continue-review" });

    const bound = await enabledRepository();
    await mkdir(join(bound.root, ".arc/active"), { recursive: true });
    await writeFile(join(bound.root, ".arc/active/meta-delivery-plan-record.md"), "# Metadata\n");
    const publisher = new RepositoryGitCommonStatePublisher(createExecaGitExec(), bound.root);
    const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    const states = new RepositoryDeliveryStateStore(publisher);
    const plan = deliveryPlanFixture();
    expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
    expect(await states.publish(plan.planId, deliveryStateFixture(plan), 0)).toMatchObject({ status: "ok" });
    expect(JSON.parse((await runStdin(bound.root, bound.request)).stdout)).toMatchObject({
      state: "delivery-bound",
      payload: { remedy: "continue-bound-delivery", planId: plan.planId },
    });

    const degraded = await enabledRepository();
    await mkdir(join(degraded.root, ".arc/active"), { recursive: true });
    await writeFile(join(degraded.root, ".arc/active/meta-delivery-plan-record.md"), "# Metadata\n");
    await mkdir(join(degraded.root, ".git/arc/delivery/plans/unexpected-directory"), { recursive: true });
    expect(JSON.parse((await runStdin(degraded.root, degraded.request)).stdout)).toMatchObject({
      state: "evidence-unavailable",
      nextAction: "continue-review",
      diagnostics: [{ code: "delivery-evidence-unavailable" }],
    });
  });
});
