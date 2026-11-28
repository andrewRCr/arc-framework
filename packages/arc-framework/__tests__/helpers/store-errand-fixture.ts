/** Scratch repositories and state observations for spawned Errand commands. */
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, onTestFinished } from "vitest";

import { ErrandOperationResultSchema } from "../../src/lib/errand/operation-result.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences, type RecordReference } from "../../src/lib/store/identity.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcAnchored, type RunResult } from "../e2e/helpers.js";
import { readStoreRecord, seedStore } from "./store/seed-store.js";

export const ERRAND_TIMEOUT_MS = 90_000;
const identity = SlugSchema.parse("test-user");
const person = OwnerIdentitySchema.parse({ type: "person", name: identity });
export const personalInbox = recordReferences["personal/inbox"](person);
export const projectInbox = recordReferences["project-inbox/inbox"](OwnerIdentitySchema.parse({ type: "project", name: "project" }));
export const errandQueue = recordReferences["personal/errand-queue"](person);

export async function errandRepository(protection: "full" | "partial" = "full") {
  const root = await createTempRepo("arc-store-errand-");
  onTestFinished(() => cleanupTempDir(root));
  const init = await runArc(["init", "--yes", "--name", "test-project"], root);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);

  const config = join(root, ".arc", "system", "arc-config.yml");
  const settings = (await readFile(config, "utf8"))
    .replace("branch.protection: partial", `branch.protection: ${protection}`)
    .replace(/^worktree\.location_template:.*$/mu, `worktree.location_template: ${join(root, ".arc-checkouts", "{name}")}`);
  await writeFile(config, settings);
  await appendFile(join(root, ".gitignore"), "\n.arc-checkouts/\n");

  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "Initialize Errand repository"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const remote = join(root, ".git", "origin.git");
  await git(root, ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["remote", "add", "origin", remote]);
  await git(root, ["push", "-u", "origin", "main"]);
  const designated = await runArc(["store", "remote", "origin", "push"], root);
  expect(designated.exitCode, designated.stdout + designated.stderr).toBe(0);

  return {
    root, base, remote,
    read: (reference: RecordReference) => readStoreRecord(root, identity, reference),
    put: (reference: RecordReference, content: string, expected?: Awaited<ReturnType<typeof readStoreRecord>>["version"]) =>
      seedStore(root, identity, [{ reference, content, ...(expected === undefined ? {} : { expected }) }]),
    arc: (args: string[], cwd = root, env?: NodeJS.ProcessEnv) =>
      runArcAnchored(["--no-input", ...args], cwd, { env }),
    git: (args: string[], cwd = root) => git(cwd, args),
  };
}

export type ErrandRepository = Awaited<ReturnType<typeof errandRepository>>;

export function resultJson(result: RunResult, exitCode = 0): unknown {
  expect(result.exitCode, result.stdout + result.stderr).toBe(exitCode);
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error(`Expected JSON from ARC.\n${result.stdout}${result.stderr}`, { cause: error });
  }
}

export function markerPath(cwd: string): string {
  return join(cwd, ".arc", "system", ".internal", "worktree-marker.json");
}

export function primaryReference(name: string) {
  return recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name }));
}

export function workItemUid(record: Awaited<ReturnType<typeof readStoreRecord>>): string {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a stored work-item UID");
  return owner.uid;
}

export async function openErrand(repo: ErrandRepository, slug: string, ...options: string[]) {
  const result = ErrandOperationResultSchema.parse(resultJson(await repo.arc(["errand", "open", slug, ...options, "--json"])));
  expect(result).toMatchObject({ outcome: "applied", operation: "errand-open", subject: { key: slug } });
  if (result.outcome !== "applied" || result.allocation === null) throw new Error("Expected an allocated Errand");
  return { ...result, checkout: result.allocation.checkoutPath };
}

export function capture(title: string, id = "12345678"): string {
  return `### \`[ ]\` **${title}**\n\n- _Id:_ \`${id}\`\n- _Created:_ \`2026-01-01\`\n\nCapture prose for ${title}.\n`;
}

export async function listCapture(repo: ErrandRepository, list: string, id = "12345678") {
  const result = resultJson(await runArc(["inbox", list, "--json"], repo.root));
  const entries = (result as { entries: { id: string; version: string }[] }).entries;
  const entry = entries.find(row => row.id === id);
  if (entry === undefined || typeof entry.version !== "string") throw new Error(`No listed version for ${list}:${id}`);
  return entry;
}

export async function setProjectQueue(repo: ErrandRepository, ...ids: string[]): Promise<void> {
  const path = join(repo.root, ".git", "queue.json");
  await writeFile(path, JSON.stringify({ schemaVersion: 1, members: ids.map(id => ({ inbox: "project", id })) }));
  expect(resultJson(await runArc(["errand", "queue", "set", path], repo.root))).toMatchObject({ state: "set" });
}
