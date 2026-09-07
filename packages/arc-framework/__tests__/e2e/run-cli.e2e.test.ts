/**
 * Smoke test for the subprocess CLI invocation helper.
 *
 * Confirms `runCli` spawns the built CLI, captures stdout/stderr/exitCode, and
 * resolves cleanly. The full subprocess-purity contract (stdout JSON purity
 * across representative cells) lives in subsequent tests that consume this
 * helper.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { runCli } from "../helpers/run-cli.js";

describe("runCli", () => {
  it("returns exit 0 and stdout containing the program name for --help", async () => {
    const result = await runCli(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("arc");
  });

  it("documents the slug-query --fetch upgrade separately from live-default views", async () => {
    const result = await runCli(["status", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--fetch");
    expect(result.stdout).toContain("upgrade the local-default query");
    expect(result.stdout).toMatch(/skip the live-default network\s+read/u);
  });

  it("documents directly composable hosted-review and merge-lock JSON inputs", async () => {
    const hostedRequest = await runCli(["review", "hosted", "request", "--help"]);
    const hostedAwait = await runCli(["review", "hosted", "await", "--help"]);
    const terminus = await runCli(["review", "terminus", "accept", "--help"]);
    const lockResolve = await runCli(["merge", "lock", "resolve", "--help"]);
    const lockRelease = await runCli(["merge", "lock", "release", "--help"]);

    for (const result of [hostedRequest, hostedAwait, terminus, lockResolve, lockRelease]) {
      expect(result.exitCode).toBe(0);
    }
    expect(hostedRequest.stdout).toContain("emitted action unchanged");
    expect(hostedAwait.stdout).toContain("emitted action unchanged");
    expect(terminus.stdout).toContain('"judgment":{"mode":"owner-accepted"}');
    expect(lockResolve.stdout).toContain('{"schemaVersion":1,"treeRoot":"/absolute/checkout"}');
    expect(lockRelease.stdout).toContain('"vehicle":{"kind":"errand","slug":"example"}');
  });

  it("documents the initial review resolver request shapes", async () => {
    const chunking = await runCli(["review", "chunking", "resolve", "--help"]);
    const policy = await runCli(["review", "resolve", "--help"]);
    const frontlineResolve = await runCli(["review", "frontline", "resolve", "--help"]);
    const frontlineRun = await runCli(["review", "frontline", "run", "--help"]);

    for (const result of [chunking, policy, frontlineResolve, frontlineRun]) {
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Request JSON:");
    }
    expect(chunking.stdout).toContain('"diffBaseSha":"<git-oid>"');
    expect(chunking.stdout).toContain('"targetId":"sha256:<digest>"');
    expect(policy.stdout).toContain('"standardReview"');
    expect(policy.stdout).toContain('"attempts":[]');
    expect(frontlineResolve.stdout).toContain('"changeSet"');
    expect(frontlineResolve.stdout).toContain('"invocation":{"mode":"inherit"}');
    expect(frontlineRun.stdout).toContain('"resolution":"<ready frontline resolve output>"');
  });

  it("reserves bare integrate for procedures and points publication scheduling to publish", async () => {
    const result = await runCli(["integrate"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("`arc integrate` is a procedure namespace");
    expect(result.stderr).toContain("use `arc publish` to schedule publication");
    expect(result.stderr).toContain("Available subcommands:");
    expect(result.stderr).toContain("arc integrate checkpoint");
  });

  it("requires machine mode and emits typed missing-project refusals for integration mutators", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arc-integration-cli-outside-"));
    const oid = "a".repeat(40);
    const checkpoint = `checkpoint-v1:${oid}:sha256:${"b".repeat(64)}`;
    try {
      for (const args of [
        ["integrate", "checkpoint", "example", "--json"],
        ["integrate", "merge", "example", "--checkpoint", checkpoint, "--json"],
        ["base", "merge", "--expected-base", oid, "--expected-head", oid, "--json"],
      ]) {
        const result = await runCli(args, { cwd });
        expect(result.exitCode).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({ state: "blocked", nextAction: "stop" });
      }

      for (const args of [
        ["integrate", "checkpoint", "example"],
        ["integrate", "merge", "example", "--checkpoint", checkpoint],
        ["base", "merge", "--expected-base", oid, "--expected-head", oid],
      ]) {
        const result = await runCli(args, { cwd });
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("required option '--json'");
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
