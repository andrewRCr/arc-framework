/**
 * Stale-build guard E2E tests.
 *
 * The guard lives in a `preAction` hook inside `cli.ts`, whose module body
 * parses and runs on import — so it is reachable only from outside the process.
 * Holding the compaction-seed exemption at that call site is the design, which
 * puts this coverage here rather than in a unit test.
 */

import { execFile } from "node:child_process";
import { cpSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { assertCliBuilt, CLI_PATH } from "../helpers/cli-spawn.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const fixtures: string[] = [];
const projects: string[] = [];

/**
 * Build a throwaway package layout whose bundle reads as stale.
 *
 * The copy lives inside the package directory on purpose: the bundle leaves its
 * runtime dependencies external and the loader resolves them by walking up from
 * the bundle's own path, so a copy anywhere else dies on a missing module before
 * the guard ever runs. Dropping the stamp and the metafile puts the check on its
 * mtime fallback, and a newer sibling source file makes that fallback report
 * stale — without touching the real `dist/` or racing a parallel run.
 */
function staleBundle(): string {
  const fixture = join(packageRoot, `.stale-guard-fixture-${String(process.pid)}-${String(fixtures.length)}`);
  fixtures.push(fixture);
  rmSync(fixture, { recursive: true, force: true });

  const dist = join(fixture, "dist");
  cpSync(join(packageRoot, "dist"), dist, { recursive: true });
  rmSync(join(dist, "dev-build-stamp.json"), { force: true });
  rmSync(join(dist, "metafile-esm.json"), { force: true });

  mkdirSync(join(fixture, "src"), { recursive: true });
  const probe = join(fixture, "src", "probe.ts");
  writeFileSync(probe, "export const probe = 1;\n");

  // Pin the ordering explicitly rather than relying on write order — the
  // fallback compares mtimes, and a coarse filesystem clock can tie them.
  const bundle = join(dist, "cli.js");
  const past = new Date(Date.now() - 60_000);
  utimesSync(bundle, past, past);

  return join(dist, "cli.js");
}

/** Build a throwaway package layout whose content stamp reports stale. */
function contentStaleBundle(): string {
  const fixture = join(packageRoot, `.stale-guard-fixture-${String(process.pid)}-${String(fixtures.length)}`);
  fixtures.push(fixture);
  rmSync(fixture, { recursive: true, force: true });

  const dist = join(fixture, "dist");
  cpSync(join(packageRoot, "dist"), dist, { recursive: true });

  mkdirSync(join(fixture, "src"), { recursive: true });
  writeFileSync(join(fixture, "src", "cli.ts"), "export const changed = true;\n");

  return join(dist, "cli.js");
}

async function runStale(bundlePath: string, args: string[], cwd: string) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bundlePath, ...args], {
      cwd,
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: typeof e.code === "number" ? e.code : 1,
    };
  }
}

/**
 * An ARC project root of the fixture's own. The seed write resolves its
 * destination by walking up from the working directory, so an unconstrained run
 * would overwrite the developer's live recovery seed.
 */
async function ownProjectRoot(): Promise<string> {
  const root = await createTempRepo("arc-stale-guard-");
  projects.push(root);
  const init = await runArc(["init", "--yes", "--name", "stale-guard"], root);
  expect(init.exitCode).toBe(0);
  // The session-init probe reads HEAD, which an uncommitted repo does not have.
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "chore: scaffold ARC"]);
  return root;
}

beforeAll(() => {
  assertCliBuilt();
  expect(CLI_PATH.length).toBeGreaterThan(0);
});

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
  for (const project of projects.splice(0)) await cleanupTempDir(project);
});

describe("stale-build guard", () => {
  it("does not attribute content-hash staleness to the newest source mtime", async () => {
    const bundle = contentStaleBundle();
    const cwd = await ownProjectRoot();

    const result = await runStale(bundle, ["status"], cwd);

    expect(result.stderr).toContain("source content differs from the build stamp");
    expect(result.stderr).not.toContain("src/cli.ts changed");
  });

  it("refuses an ordinary command against a stale bundle", async () => {
    const bundle = staleBundle();
    const cwd = await ownProjectRoot();

    const result = await runStale(bundle, ["status"], cwd);

    // Both branches embed the same stale-build sentence, and an ordinary
    // command exits non-zero in a bare fixture for reasons of its own — so
    // neither the sentence nor the exit code discriminates. The refusal clause
    // does.
    expect(result.stderr).toContain("Refusing `arc status` against stale dist");
    expect(result.stderr).toContain("run `npm run build:fast`, then retry.");
  });

  it("lets the compaction-seed write proceed and still names the stale build", async () => {
    const bundle = staleBundle();
    const cwd = await ownProjectRoot();

    const result = await runStale(
      bundle,
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      cwd,
    );

    expect(result.stderr).not.toContain("Refusing");
    expect(result.stderr).toContain("arc dev build is stale");
    expect(result.stderr).toContain("Run `npm run build:fast` before relying on output.");

    const envelope: unknown = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({ mode: "session-init" });
  });
});
