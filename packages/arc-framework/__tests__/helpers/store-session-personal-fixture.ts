/** Scratch repositories and persisted-state observations for spawned session commands. */
import { realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, onTestFinished } from "vitest";

import { cleanupTempDir, createTempRepo, git, runArc, type RunResult } from "../e2e/helpers.js";
import { addBareRemote } from "./integration.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import type { StoreResult } from "../../src/lib/store/refusal.js";

export const sessionIdentity = SlugSchema.parse("test-user");
export const SESSION_COMMAND_TIMEOUT_MS = 90_000;

export function personalRecords(identity: string) {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  return { inbox: recordReferences["personal/inbox"](owner), memory: recordReferences["personal/working-memory"](owner) };
}

export function stored<T>(result: StoreResult<T>): T {
  if (result.status === "refused") throw new Error(JSON.stringify(result.refusal));
  return result.result;
}

export function fixtureStore(root: string, identity = sessionIdentity) {
  return selectStore({ ...createDefaultStorePorts({ checkoutRoot: root }), identity: async () => identity });
}

export function expectExit(args: string[], result: RunResult, code = 0): void {
  expect(result.exitCode, `arc ${args.join(" ")}\n${result.stdout}${result.stderr}`).toBe(code);
}

export async function scratchRepo(): Promise<string> {
  const root = await createTempRepo("arc-session-personal-");
  onTestFinished(() => cleanupTempDir(root));
  await git(root, ["commit", "--allow-empty", "-m", "Initial code"]);
  return realpath(root);
}

export async function sessionRepo(): Promise<string> {
  const root = await scratchRepo();
  const args = ["init", "--yes", "--name", "session-fixture", "--tools", ""];
  expectExit(args, await runArc(args, root));
  await writeFile(join(root, ".arc", "system", "arc-config.yml"),
    "branch.base: main\nbranch.protection: partial\nsession.remote_sync: disabled\npm.mode: none\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "Install session configuration"]);
  return root;
}

export const markerPath = (root: string) => join(root, ".arc", "system", ".internal", "worktree-marker.json");

export async function codeRefs(root: string): Promise<string> {
  return git(root, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes"]);
}

/** Publish the fixture's state and open a second writer from the same remote basis. */
export async function competingStoreWriter(root: string, store: ReturnType<typeof fixtureStore>) {
  const origin = await addBareRemote(root);
  const args = ["store", "remote", "origin", "push", "--json"];
  expectExit(args, await runArc(args, root));
  const published = stored(await store.push());
  expect(published.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));

  const parent = await scratchRepo();
  const rival = join(parent, "rival");
  await git(parent, ["clone", origin, rival]);
  await git(rival, ["config", "user.name", "Second Writer"]);
  await git(rival, ["config", "user.email", "second@example.test"]);
  await git(rival, ["config", "remote.origin.arc-state", "push"]);
  const incoming = fixtureStore(rival);
  expect(stored(await incoming.pull()).pulls).toContainEqual(expect.objectContaining({ status: "pulled", remote: "origin" }));
  return incoming;
}
