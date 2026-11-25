/** Real agenda inspection preserves repository and personal state after temporary fetches. */

import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { assertSessionInitAgenda } from "../../src/commands/agenda/schema.js";
import { makeGitExecInput, makeNotesTreeCommit } from "../helpers/integration.js";
import { cleanupTempDir, createTempRepo, git, removeGitBackedDir, runArcNoTty } from "./helpers.js";

interface GitTraceEvent { event: string; sid: string; argv?: string[]; code?: number }
let repository: string | undefined;
let origin: string | undefined;
let traceDirectory: string | undefined;
afterEach(async () => {
  await Promise.all([
    ...(repository === undefined ? [] : [cleanupTempDir(repository)]),
    ...(origin === undefined ? [] : [removeGitBackedDir(origin)]),
    ...(traceDirectory === undefined ? [] : [cleanupTempDir(traceDirectory)]),
  ]);
  repository = origin = traceDirectory = undefined;
});

async function directorySnapshot(root: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  async function walk(path: string, prefix: string): Promise<void> {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const name = `${prefix}${entry.name}`;
      const target = join(path, entry.name);
      if (entry.isDirectory()) { snapshot[`${name}/`] = "directory"; await walk(target, `${name}/`); }
      else if (entry.isSymbolicLink()) snapshot[name] = `link:${await readlink(target)}`;
      else snapshot[name] = createHash("sha256").update(await readFile(target)).digest("hex");
    }
  }
  await walk(root, "");
  return snapshot;
}

async function seedRemoteErrand(cwd: string): Promise<void> {
  const input = makeGitExecInput(cwd);
  const record = { version: 3, kind: "errand", slug: "passive", claimId: "c".repeat(32), purpose: "errand",
    origin: "description", originEntry: null, intent: "Inspect passive startup", branch: "chore/passive",
    state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-08-04T00:00:00.000Z", updatedAt: "2026-08-04T00:00:00.000Z" };
  const blob = (await input(["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await input(["mktree"], `100644 blob ${blob}\tpassive\n`)).trim();
  const commit = await git(cwd, ["commit-tree", tree, "-m", "seed passive errand"]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
  await git(cwd, ["push", "origin", "refs/arc/user/test-user/errands"]);
}

it("creates and deletes both temporary-ref families while preserving inspected state", async () => {
  repository = await createTempRepo("arc-agenda-passive-");
  origin = await mkdtemp(join(tmpdir(), "arc-agenda-passive-origin-"));
  traceDirectory = await mkdtemp(join(tmpdir(), "arc-agenda-passive-trace-"));
  const initialized = await runArcNoTty(["--no-input", "init", "--name", "agenda", "--identity", "test-user", "--tools", ""], repository);
  expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
  const stubbed = await runArcNoTty(["--no-input", "stub", "passive-target", "--commitment", "planned",
    "--priority", "P3", "--class", "Light"], repository);
  expect(stubbed.exitCode, stubbed.stdout + stubbed.stderr).toBe(0);
  await git(repository, ["add", "."]);
  await git(repository, ["commit", "-m", "chore: initialize fixture"]);
  await git(repository, ["init", "--bare", "--initial-branch=main", origin]);
  await git(repository, ["remote", "add", "origin", origin]);
  await git(repository, ["push", "-u", "origin", "main"]);
  await seedRemoteErrand(repository);
  const head = await git(repository, ["rev-parse", "HEAD"]);
  const notesRef = "refs/notes/arc/user/test-user";
  const local = await makeNotesTreeCommit(repository, [{ commit: head,
    content: JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "local\n" } }) }], { message: "local notes" });
  const remote = await makeNotesTreeCommit(repository, [{ commit: head,
    content: JSON.stringify({ version: 2, files: { "WORKING-MEMORY.md": "remote\n" } }) }], { message: "remote notes" });
  await git(repository, ["update-ref", notesRef, local.tip]);
  await git(repository, ["push", "origin", `${remote.tip}:${notesRef}`]);
  const snapshot = async () => ({
    status: await git(repository!, ["status", "--porcelain=v1", "--untracked-files=all"]),
    refs: await git(repository!, ["for-each-ref", "--format=%(refname) %(objectname)"]),
    head: await git(repository!, ["rev-parse", "HEAD"]),
    personal: await directorySnapshot(join(repository!, ".arc", "user")),
  });
  await writeFile(join(repository, ".arc/user/test-user/USER-INBOX.md"),
    "# User Inbox\n\n## Errand\n\n### `[ ]` **Queued passive concern**\n\n- Inspect a sample.\n\n---\n");
  const queueInput = join(traceDirectory, "queue.json");
  await writeFile(queueInput, JSON.stringify({ schemaVersion: 1, orderedTitles: ["Queued passive concern"] }));
  const queued = await runArcNoTty(["user", "inbox-mark-execute-bound", queueInput], repository);
  expect(queued.exitCode, queued.stdout + queued.stderr).toBe(0);
  const before = await snapshot();
  const tracePath = join(traceDirectory, "git.jsonl");
  await writeFile(tracePath, "");
  for (const signals of [[], ["--errand", "--next"], ["--plan", "passive-target"], ["--start", "passive-target"]]) {
    const result = await runArcNoTty(["agenda", "session-init", "--json", ...signals], repository,
      { env: { GIT_TRACE2_EVENT: tracePath, FORCE_COLOR: undefined } });
    expect(result.stderr).toBe("");
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    const output: unknown = JSON.parse(result.stdout);
    assertSessionInitAgenda(output);
    if (signals.includes("--errand")) expect(output.steps).toContainEqual(expect.objectContaining({
      type: "fragment", args: { mode: "launch", fromInbox: "Queued passive concern", isolate: false },
    }));
    if (signals.includes("--plan")) expect(output.steps).toContainEqual(expect.objectContaining({
      type: "fragment", args: { stub: "passive-target", onGroomingBranch: false },
    }));
    if (signals.includes("--start")) expect(output.steps.at(-1)).toEqual({ type: "gate", kind: "launch", autoProceed: false });
    expect(await snapshot(), `Inspection changed state for ${JSON.stringify(signals)}`).toEqual(before);
  }
  const events = (await readFile(tracePath, "utf8")).trim().split("\n").filter(Boolean)
    .map(line => JSON.parse(line) as GitTraceEvent);
  const completed = new Set(events.filter(event => event.event === "exit" && event.code === 0).map(event => event.sid));
  const commands = events.filter(event => event.event === "start" && completed.has(event.sid)).map(event => event.argv ?? []);
  for (const prefix of ["refs/arc/tmp/transient-discovery/", "refs/arc-sync-temp/"]) {
    const fetched = commands.filter(args => args.includes("fetch")).flatMap(args => args
      .filter(arg => arg.includes(`:${prefix}`)).map(arg => arg.slice(arg.indexOf(":") + 1)));
    expect(fetched.length, `No successful fetch into ${prefix}`).toBeGreaterThan(0);
    for (const ref of fetched) {
      expect(commands.some(args => args.includes("update-ref") && args.includes("-d") && args.includes(ref)),
        `No successful deletion of ${ref}`).toBe(true);
    }
    expect(await git(repository, ["for-each-ref", "--format=%(refname)", prefix])).toBe("");
  }
}, 60_000);
