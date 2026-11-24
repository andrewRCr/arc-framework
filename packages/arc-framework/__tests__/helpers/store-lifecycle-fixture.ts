/** Scratch projects and observations for spawned lifecycle commands. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, onTestFinished } from "vitest";

import { resolveWorktreeMarkerPath } from "../../src/lib/git/worktree-marker.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { createDefaultRefStorePorts } from "../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { cleanupTempDir, commitAll, createTempRepo, git, runArcNoTty, unwrapPresentationOutput } from "../e2e/helpers.js";
import { readStoreRecord } from "./store/seed-store.js";

export const LIFECYCLE_TIMEOUT_MS = 90_000;
export const LIFECYCLE_IDENTITY = SlugSchema.parse("test-user");
export const PERSONAL_BYTES = Buffer.from("Keep this personal edit\r\n");

export async function lifecycleRepository(options: { remote?: boolean; protection?: "full" | "partial" } = {}) {
  const repo = await createTempRepo("arc-store-lifecycle-");
  onTestFinished(() => cleanupTempDir(repo));

  const run = async (args: string[], cwd = repo) => {
    const result = await runArcNoTty(["--no-input", ...args], cwd, { env: { FORCE_COLOR: undefined } });
    return { ...result, output: unwrapPresentationOutput(result.stdout + "\n" + result.stderr),
      command: `arc --no-input ${args.join(" ")}` };
  };
  const initialized = await run(["init", "--yes", "--name", "test-project"]);
  expect(initialized.exitCode, initialized.output).toBe(0);
  if (options.protection !== "partial") {
    const config = join(repo, ".arc/system/arc-config.yml");
    await writeFile(config, (await readFile(config, "utf8")).replace("branch.protection: partial", "branch.protection: full"));
  }
  await commitAll(repo, "Initialize scratch project");

  const origin = join(repo, ".git", "lifecycle-origin.git");
  if (options.remote === true) {
    await git(repo, ["init", "--bare", "--initial-branch=main", origin]);
    await git(repo, ["remote", "add", "origin", origin]);
    await git(repo, ["push", "-u", "origin", "main"]);
    const designated = await run(["store", "remote", "origin", "push"]);
    expect(designated.exitCode, designated.output).toBe(0);
  }

  const base = await git(repo, ["rev-parse", "refs/heads/main"]);
  const checkoutPath = (name: string) => {
    const path = `${repo}.${name}`;
    onTestFinished(() => cleanupTempDir(path));
    return path;
  };
  return { repo, origin, base, run, checkoutPath };
}

export function expectLifecycleResult(result: { exitCode: number; output: string; command: string; timedOut?: true },
  exitCode: number, output: RegExp): void {
  const diagnostic = `${result.command}\n${result.output}`;
  expect(result.timedOut, diagnostic).toBeUndefined();
  expect(result.exitCode, diagnostic).toBe(exitCode);
  expect(result.output, diagnostic).toMatch(output);
}

export function readLifecycleMeta(repo: string, name: string) {
  return readStoreRecord(repo, LIFECYCLE_IDENTITY, RecordReferenceSchema.parse({
    kind: "work-item/meta", owner: { type: "work-item", name },
  }));
}

/** Read the work-unit inventory independently of the spawned command. */
export async function readLifecycleInventory(repo: string): Promise<StoreRecord[]> {
  const ports = createDefaultRefStorePorts({ checkoutRoot: repo, backingRepository: async () => null });
  const result = await createRefStore({ ...ports, identity: async () => LIFECYCLE_IDENTITY })
    .list({ family: "work-item", kind: "work-item/meta" });
  if (result.status === "refused") throw new Error(result.refusal.condition);
  if (result.result.status === "absent") return [];
  if (result.result.status === "unreadable") throw new Error(result.result.condition);
  expect(result.result).toMatchObject({ missed: false, diagnostics: [] });
  return result.result.records;
}

export async function markerBytes(checkout: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveWorktreeMarkerPath(checkout));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function lifecycleSnapshot(repo: string, checkout = repo) {
  const [head, branch, refs, worktrees, marker] = await Promise.all([
    git(checkout, ["rev-parse", "HEAD"]),
    git(checkout, ["branch", "--show-current"]),
    // A read may retain a new manifest; compare the records' refs and the code refs.
    git(repo, ["for-each-ref", "--exclude=refs/arc/tmp/version", "--format=%(refname) %(objectname)"]),
    git(repo, ["worktree", "list", "--porcelain"]),
    markerBytes(checkout),
  ]);
  return { head, branch, refs, worktrees, marker };
}
