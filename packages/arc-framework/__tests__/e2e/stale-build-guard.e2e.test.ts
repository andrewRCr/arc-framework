/**
 * Stale-build guard E2E tests.
 *
 * The guard lives in action hooks inside `cli.ts`, whose module body parses and
 * runs on import — so it is reachable only from outside the process. Holding
 * the compaction-seed exemption and refresh eligibility at that call site is
 * the design, which puts this coverage here rather than in a unit test.
 */

import { execFile } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { assertCliBuilt, CLI_PATH } from "../helpers/cli-spawn.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";
import { makeNativeBuildFixture } from "../helpers/native-build-fixture.js";
import { buildOwnedArtifacts } from "../../src/lib/build-entry.js";
import { withBuildArtifactOwnership } from "../../src/lib/build-ownership.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const fixtures: string[] = [];
const projects: string[] = [];

/**
 * Build a throwaway package layout whose bundle reads as stale.
 *
 * The disposable workspace links installed dependencies so its copied bundle
 * loads normally. Dropping evidence requires refusal independently of source
 * timestamps without changing the real checkout's source membership.
 */
async function staleBundle(): Promise<string> {
  const { root, packageRoot: fixture } = await makeNativeBuildFixture();
  fixtures.push(root);
  const dist = join(fixture, "dist");
  cpSync(join(packageRoot, "dist"), dist, { recursive: true });
  rmSync(join(dist, "dev-build-stamp.json"), { force: true });
  rmSync(join(dist, "metafile-esm.json"), { force: true });

  return join(dist, "cli.js");
}

/** Build a throwaway package layout whose content stamp reports stale. */
async function contentStaleBundle(): Promise<string> {
  const { root, packageRoot: fixture } = await makeNativeBuildFixture();
  fixtures.push(root);
  const source = await readFile(join(packageRoot, "src/cli.ts"), "utf8");
  await writeFile(join(fixture, "src/cli.ts"), source);
  await withBuildArtifactOwnership({ packageRoot: fixture, operation: "stale guard fixture" }, async (lease) => {
    await buildOwnedArtifacts(lease, "fast");
  });
  await writeFile(join(fixture, "src/cli.ts"), `${source}\n// changed after qualified compilation\n`);
  return join(fixture, "dist/cli.js");
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
  expect(init.exitCode, init.stderr).toBe(0);
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
    const bundle = await contentStaleBundle();
    const cwd = await ownProjectRoot();

    const result = await runStale(bundle, ["status"], cwd);

    expect(result.stderr).toContain("runtime inputs or build qualification differ from the build stamp");
    expect(result.stderr).not.toContain("src/cli.ts changed");
  });

  it("refuses an ordinary command against a stale bundle", async () => {
    const bundle = await staleBundle();
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
    const bundle = await staleBundle();
    const cwd = await ownProjectRoot();

    const result = await runStale(
      bundle,
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      cwd,
    );

    expect(result.stderr).not.toContain("Refusing");
    expect(result.stderr).toContain("arc dev build is stale");
    expect(result.stderr).toContain("Run `npm run build:fast` before relying on output.");
    expect(result.stderr).not.toContain("could not refresh the dev build");

    const envelope: unknown = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({ mode: "session-init" });
  });
});
