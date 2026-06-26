/**
 * End-to-end bidirectionality contract for `arc sync` against real temp repos.
 *
 * Drives the shipped CLI as a non-TTY subprocess (pipe stdio) — the agent /
 * pipeline surface — so the inbound fast-forward leg runs under its
 * non-interactive contract: `sync.auto_pull` gates whether a `remote-ahead`
 * worktree fast-forwards (default off) and the ff-only / dirty-refuse /
 * diverged-block safety holds even when opted in.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";
import { runCli } from "../helpers/run-cli.js";
import { runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run git in `cwd` with hooks disabled — avoids arc's installed hooks firing on test setup. */
async function gitNoHooks(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
}

async function headSha(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

/** Replace one or more `key: value` lines in a clone's arc-config.yml. */
async function overrideArcConfig(cwd: string, overrides: Record<string, string>): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  let content = await readFile(path, "utf-8");
  for (const [key, value] of Object.entries(overrides)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}:[^\\n]*$`, "m");
    const next = content.replace(re, `${key}: ${value}`);
    if (next === content) throw new Error(`Failed to override ${key} in ${path}`);
    content = next;
  }
  await writeFile(path, content, "utf-8");
}

/** Install ARC into a clone via the built CLI, apply config overrides, then commit. */
async function installArcInClone(
  cwd: string,
  configOverrides: Record<string, string> = {},
): Promise<void> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], cwd);
  if (init.exitCode !== 0) {
    throw new Error(`arc init failed (exit ${init.exitCode}): ${init.stderr}`);
  }
  if (Object.keys(configOverrides).length > 0) {
    await overrideArcConfig(cwd, configOverrides);
  }
  await execFileAsync("git", ["add", "."], { cwd });
  await gitNoHooks(cwd, ["commit", "-m", "install arc"]);
}

const identity = "test-user";

function setupClones(): Promise<MultiClone> {
  return setupMultiClone({
    cloneA: { config: { "arc.identity": identity } },
    cloneB: { config: { "arc.identity": identity } },
  });
}

/**
 * Build a `remote-ahead` topology on clone A: install + publish ARC, then have
 * clone B advance origin by one commit. Returns the harness and the remote tip.
 * Clone A is configured with `pushInterlock: on-sync` (the inbound leg is gated
 * behind a non-manual push interlock) and `user.notes_push: manual` (so the
 * matrix isolates on the worktree leg).
 */
async function setupRemoteAhead(configOverrides: Record<string, string>): Promise<{
  harness: MultiClone;
  remoteTip: string;
}> {
  const harness = await setupClones();
  await installArcInClone(harness.cloneA, { "user.notes_push": "manual", ...configOverrides });
  await execFileAsync("git", ["config", "--local", "arc.pushInterlock", "on-sync"], {
    cwd: harness.cloneA,
  });
  await gitNoHooks(harness.cloneA, ["push", "origin", "main"]);

  // Clone B syncs to the published ARC install, then advances origin by one commit.
  await execFileAsync("git", ["pull", "origin", "main"], { cwd: harness.cloneB });
  await gitNoHooks(harness.cloneB, ["commit", "--allow-empty", "-m", "remote advance"]);
  await execFileAsync("git", ["push", "origin", "main"], { cwd: harness.cloneB });

  return { harness, remoteTip: await headSha(harness.cloneB) };
}

interface SyncEnvelope {
  cell: string;
  exitCode: number;
}

describe("arc sync inbound fast-forward (e2e)", () => {
  it("remote-ahead + sync.auto_pull true → inbound-pull fast-forwards; exit 0", async () => {
    const { harness, remoteTip } = await setupRemoteAhead({ "sync.auto_pull": "true" });
    try {
      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });
      const envelope = JSON.parse(result.stdout.trim()) as SyncEnvelope;

      expect(envelope.cell).toBe("inbound-pull");
      expect(envelope.exitCode).toBe(0);
      expect(result.exitCode).toBe(0);
      // The working branch advanced to the remote tip — a true inbound pull.
      expect(await headSha(harness.cloneA)).toBe(remoteTip);
    } finally {
      await harness.cleanup();
    }
  });

  it("remote-ahead + sync.auto_pull false (default, non-TTY) → surfaces blocked; no mutation", async () => {
    const { harness } = await setupRemoteAhead({});
    try {
      const before = await headSha(harness.cloneA);
      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });
      const envelope = JSON.parse(result.stdout.trim()) as SyncEnvelope;

      expect(envelope.cell).toBe("blocked-remote-ahead");
      expect(envelope.exitCode).toBe(1);
      expect(result.exitCode).toBe(1);
      // The non-TTY default never mutates the working tree.
      expect(await headSha(harness.cloneA)).toBe(before);
    } finally {
      await harness.cleanup();
    }
  });

  it("remote-ahead + dirty tree + sync.auto_pull true → refuses; no mutation, exit 1", async () => {
    const { harness } = await setupRemoteAhead({ "sync.auto_pull": "true" });
    try {
      await writeFile(join(harness.cloneA, "scratch.txt"), "uncommitted", "utf-8");
      const before = await headSha(harness.cloneA);
      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });
      const envelope = JSON.parse(result.stdout.trim()) as SyncEnvelope;

      expect(envelope.cell).toBe("inbound-pull");
      expect(envelope.exitCode).toBe(1);
      expect(result.exitCode).toBe(1);
      expect(await headSha(harness.cloneA)).toBe(before);
    } finally {
      await harness.cleanup();
    }
  });

  it("diverged + sync.auto_pull true → blocks; ff-only never resolves divergence", async () => {
    const harness = await setupClones();
    try {
      await installArcInClone(harness.cloneA, {
        "user.notes_push": "manual",
        "sync.auto_pull": "true",
      });
      await execFileAsync("git", ["config", "--local", "arc.pushInterlock", "on-sync"], {
        cwd: harness.cloneA,
      });
      await gitNoHooks(harness.cloneA, ["push", "origin", "main"]);

      // Origin advances via clone B; clone A makes its own local commit without
      // fetching — the two diverge.
      await execFileAsync("git", ["pull", "origin", "main"], { cwd: harness.cloneB });
      await gitNoHooks(harness.cloneB, ["commit", "--allow-empty", "-m", "remote advance"]);
      await execFileAsync("git", ["push", "origin", "main"], { cwd: harness.cloneB });
      await gitNoHooks(harness.cloneA, ["commit", "--allow-empty", "-m", "local advance"]);
      const before = await headSha(harness.cloneA);

      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });
      const envelope = JSON.parse(result.stdout.trim()) as SyncEnvelope;

      expect(envelope.cell).toBe("blocked-diverged");
      expect(envelope.exitCode).toBe(1);
      expect(result.exitCode).toBe(1);
      expect(await headSha(harness.cloneA)).toBe(before);
    } finally {
      await harness.cleanup();
    }
  });
});
