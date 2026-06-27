/**
 * Barrier-synchronized spawn harness for the true-race e2e smokes.
 *
 * Spawns a set of {@link race-worker} processes for one round, holds them at a
 * shared file barrier until every one is set up, then releases them together so
 * their guarded writes contend as tightly as real concurrent ARC processes
 * would. The barrier (rather than relying on spawn timing) is what makes the
 * race reliable despite variable `tsx` start-up jitter: a worker that boots
 * slowly still joins the contended window instead of running alone.
 *
 * The worker is launched via `node --import tsx` so it imports the guard
 * primitives straight from source — the same transpile path the unit and
 * integration tiers run through. The spawn `cwd` is the package root (so `tsx`
 * resolves from the workspace `node_modules`); the repo under test is passed to
 * the worker as an explicit argument, never inherited from `cwd`.
 *
 * @module
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = resolve(HERE, "race-worker.ts");
const PACKAGE_ROOT = resolve(HERE, "../..");

/** Captured outcome of a single spawned worker. */
export interface WorkerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Per-worker invocation: the leading guard-specific arguments
 * `[guard, repoDir, identity, ...extra]`. The harness injects the shared
 * `barrierDir` and the per-worker `workerId` into the full argv.
 */
export type WorkerArgs = string[];

/** Tuning for {@link runRound}; every field has a safe default. */
export interface RunRoundOptions {
  /** Bounded wait (ms) for all workers to reach the barrier before releasing. */
  readyTimeoutMs?: number;
  /** Poll interval (ms) while waiting on readiness. */
  pollMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_MS = 5;

/**
 * Run one race round: spawn every worker, wait until all have signalled
 * readiness (or have exited early), drop the `go` file to release them
 * simultaneously, and resolve once all have finished.
 *
 * Never rejects on a worker failure — a failed worker surfaces in its
 * {@link WorkerResult} (non-zero `exitCode`, captured `stderr`) so the caller
 * asserts on it. Only an inability to set up the round itself throws.
 *
 * @param workers - One {@link WorkerArgs} per process to spawn.
 * @param options - Optional readiness-wait tuning.
 * @returns The workers' results, index-aligned with `workers`.
 */
export async function runRound(
  workers: WorkerArgs[],
  options: RunRoundOptions = {},
): Promise<WorkerResult[]> {
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const barrierDir = await mkdtemp(join(tmpdir(), "arc-race-barrier-"));

  try {
    const done = new Array<boolean>(workers.length).fill(false);
    const results = workers.map((args, index) => {
      // args is [guard, repoDir, identity, ...extra]; inject the shared barrier
      // dir and per-worker id after the identity. Slices stay string[] (no
      // indexed access) so this type-checks under noUncheckedIndexedAccess.
      const fullArgs = [...args.slice(0, 3), barrierDir, String(index), ...args.slice(3)];
      return spawnWorker(fullArgs).then((result) => {
        done[index] = true;
        return result;
      });
    });

    await waitForReady(barrierDir, workers.length, done, readyTimeoutMs, pollMs);
    await writeFile(join(barrierDir, "go"), "1", "utf-8");
    return await Promise.all(results);
  } finally {
    await rm(barrierDir, { recursive: true, force: true });
  }
}

/** Spawn one `node --import tsx race-worker.ts …` process and capture its output. */
function spawnWorker(args: string[]): Promise<WorkerResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", WORKER_PATH, ...args],
      { cwd: PACKAGE_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      // A worker killed by a signal exits with a null code; coercing that to 0
      // would pass it off as a clean run. Treat a signalled exit as a failure and
      // annotate the captured stderr so the cause is visible in the assertion.
      const exitCode = code ?? (signal ? 1 : 0);
      const annotatedStderr = signal
        ? `${stderr}\n[worker terminated by signal ${signal}]`
        : stderr;
      resolveResult({ stdout, stderr: annotatedStderr, exitCode });
    });
  });
}

/**
 * Block until every worker is accounted for — each has either dropped its
 * `ready.<i>` marker or exited early (a setup failure that will never ready) —
 * then return so the caller releases the barrier. A worker that failed before the
 * barrier is accounted (via `done`) and surfaces as a non-zero result, not a
 * deadlock.
 *
 * If the bounded wait elapses while any worker is still neither ready nor exited,
 * the round never reached a true contended window — releasing the barrier anyway
 * would let the smoke pass hollowly. Throw instead, naming the stragglers, so the
 * round fails loudly rather than silently under-racing.
 */
async function waitForReady(
  barrierDir: string,
  count: number,
  done: readonly boolean[],
  timeoutMs: number,
  pollMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let accounted = 0;
    const missing: number[] = [];
    for (let i = 0; i < count; i++) {
      if (done[i] || existsSync(join(barrierDir, `ready.${String(i)}`))) accounted++;
      else missing.push(i);
    }
    if (accounted === count) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `true-race barrier timed out after ${String(timeoutMs)}ms: `
        + `worker(s) ${missing.join(", ")} never reached the barrier (no ready marker, not exited)`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
