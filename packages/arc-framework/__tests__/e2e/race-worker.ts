/**
 * True-race worker — one real OS process performing exactly one guarded write.
 *
 * The deterministic interleave tests force a specific read→write ordering via an
 * injected seam; this worker is the empirical complement. The harness spawns
 * several of these as genuine concurrent processes (`node --import tsx`,
 * importing the guard primitives from source), each blocking on a shared file
 * barrier so their contended writes fire together against one temp git repo. It
 * proves the guards hold when real processes actually race — no silent drop, no
 * machine-id divergence — which an in-process Promise.all cannot.
 *
 * Invoked as:
 *   race-worker.ts <guard> <repoDir> <identity> <barrierDir> <workerId> [extra…]
 *
 * Per guard, `extra` is:
 *   machine-id  (none)        — converge on one id
 *   sync-state  <key>         — write the machine-keyed entry <key>
 *   errand      <slug>        — write the errand record <slug>
 *   notes       <commit>      — lock + `git notes add` to <commit>
 *
 * The worker writes `<barrierDir>/ready.<workerId>` once it is set up, spins
 * until `<barrierDir>/go` appears, then performs the single write. On success it
 * prints a one-line JSON result to stdout; on failure it prints the error to
 * stderr and exits non-zero.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { notesRef } from "../../src/commands/user/shared.js";
import { writeErrandRecord, type ErrandRecord } from "../../src/lib/errand/record.js";
import type { GitExec, GitExecInput } from "../../src/lib/git/exec.js";
import type { CoreIO } from "../../src/lib/types.js";
import {
  acquireAdvisoryLock,
  getNotesLockPath,
  releaseAdvisoryLock,
} from "../../src/lib/user-sync/notes-lock.js";
import { writeEntry } from "../../src/lib/user-sync/sync-state-ref.js";
import { getOrCreateMachineId } from "../../src/lib/user-sync/sync-state.js";

const execFileAsync = promisify(execFile);

/** A fixed timestamp so an errand record's blob is deterministic across rounds. */
const FIXED_CREATED_AT = "2026-01-01T00:00:00.000Z";

/** Poll interval while waiting for the barrier's `go` file. */
const BARRIER_POLL_MS = 3;

/**
 * Backstop wait for the barrier release. The harness reaps workers it abandons
 * (e.g. on its own readiness timeout), but if that reap is ever missed, this cap
 * lets a stranded worker self-terminate instead of spinning on `go` forever. Set
 * comfortably above the harness's readiness timeout so a healthy round is never
 * cut short here.
 */
const BARRIER_WAIT_TIMEOUT_MS = 30_000;

/** `execFile`-backed git executor bound to `cwd` (reads: rev-parse, ls-tree, cat-file). */
function makeExec(cwd: string): GitExec {
  return async (cmd, args) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/** `spawn`-backed stdin-fed git executor bound to `cwd` (hash-object, mktree, notes add). */
function makeExecInput(cwd: string): GitExecInput {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const proc = spawn("git", args, { cwd });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(" ")} failed (code ${code}): ${stderr}`));
      });
      proc.on("error", reject);
      proc.stdin.write(input);
      proc.stdin.end();
    });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Block until the harness drops the `go` file, releasing every worker at once. */
async function awaitGo(barrierDir: string): Promise<void> {
  const goPath = join(barrierDir, "go");
  const deadline = Date.now() + BARRIER_WAIT_TIMEOUT_MS;
  while (!existsSync(goPath)) {
    if (Date.now() >= deadline) {
      throw new Error("race-worker: barrier release ('go') never arrived; abandoning round");
    }
    await delay(BARRIER_POLL_MS);
  }
}

/** Require a positional argument, failing loudly when the harness omitted it. */
function req(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`race-worker: missing argument <${name}>`);
  return value;
}

async function main(): Promise<void> {
  const [guard, repoDir, identity, barrierDir, workerId, ...extra] = process.argv.slice(2);
  const g = req(guard, "guard");
  const repo = req(repoDir, "repoDir");
  const id = req(identity, "identity");
  const barrier = req(barrierDir, "barrierDir");
  const wid = req(workerId, "workerId");

  const exec = makeExec(repo);
  const execInput = makeExecInput(repo);

  // Set up complete — announce readiness, then converge on the release so the
  // contended write below is the only thing racing.
  await writeFile(join(barrier, `ready.${wid}`), "1", "utf-8");
  await awaitGo(barrier);

  switch (g) {
    case "machine-id": {
      const io: CoreIO = {
        readFile: (path) => readFile(path, "utf-8"),
        writeFile: (path, content) => writeFile(path, content, "utf-8"),
        mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
        exec,
      };
      const resolved = await getOrCreateMachineId(repo, io, id);
      process.stdout.write(`${JSON.stringify({ id: resolved })}\n`);
      break;
    }
    case "sync-state": {
      const key = req(extra[0], "key");
      await writeEntry({ exec, execInput, identity: id }, key, `sync-state entry ${key}\n`);
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      break;
    }
    case "errand": {
      const slug = req(extra[0], "slug");
      const record: ErrandRecord = {
        version: 1,
        slug,
        origin: "description",
        intent: `true-race ${slug}`,
        branch: `chore/${slug}`,
        createdAt: FIXED_CREATED_AT,
      };
      await writeErrandRecord({ exec, execInput, identity: id }, record);
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      break;
    }
    case "notes": {
      const commit = req(extra[0], "commit");
      const lock = await acquireAdvisoryLock(getNotesLockPath(repo, id));
      try {
        await execInput(
          ["notes", "--ref", notesRef(id), "add", "-f", "-F", "-", commit],
          `note for ${commit}\n`,
        );
      } finally {
        await releaseAdvisoryLock(lock);
      }
      process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
      break;
    }
    default:
      throw new Error(`race-worker: unknown guard "${g}"`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
