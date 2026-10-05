/** Materializing command fetch deadlines, refusal output, and successful retry. */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { setupMultiClone } from "../helpers/multi-clone.js";
import { runCli } from "../helpers/run-cli.js";
import { git } from "./helpers.js";

const commands = [["sync", "--json"], ["release", "push"], ["user", "sync"]]
  .map(args => ({ label: args.join(" "), args }));

async function fixture() {
  const harness = await setupMultiClone({ cloneA: { config: { "arc.identity": "test-user" } } });
  const root = harness.cloneA;
  const initialized = await runCli(["init", "--yes", "--name", "test-project"], { cwd: root });
  expect(initialized.exitCode).toBe(0);
  await git(root, ["config", "arc.pushInterlock", "on-workflow"]);
  await git(root, ["config", "arc.releaseOptedIn", "true"]);
  const config = join(root, ".arc", "system", "arc-config.yml");
  await writeFile(config, (await readFile(config, "utf8")).replace(
    /^branch\.protection:.*$/m, "branch.protection: partial",
  ));
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "install"]);
  await git(root, ["push", "origin", "main"]);
  const bin = join(root, ".git", "fetch-test-bin");
  await mkdir(bin);
  const script = [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    'const { delimiter, resolve } = require("node:path");',
    "const args = process.argv.slice(2);",
    'const fetch = args.indexOf("fetch");',
    'const delayed = fetch >= 0 && args[fetch + 1] === "origin" && args[fetch + 2] === "main";',
    'const path = (process.env.PATH ?? "").split(delimiter)',
    "  .filter(entry => resolve(entry) !== resolve(__dirname)).join(delimiter);",
    "function run() {",
    '  const result = spawnSync("git", args, { env: { ...process.env, PATH: path }, stdio: "inherit" });',
    "  process.exit(result.status ?? 1);",
    "}",
    'if (delayed) setTimeout(run, Number(process.env.ARC_TEST_FETCH_DELAY)); else run();',
    "",
  ].join("\n");
  const driver = join(bin, process.platform === "win32" ? "git-shim.cjs" : "git");
  await writeFile(driver, script);
  if (process.platform === "win32") {
    await writeFile(join(bin, "git.cmd"), '@node "%~dp0git-shim.cjs" %*\r\n');
  } else {
    await chmod(driver, 0o755);
  }
  // Accelerate only the fetch deadline in the child; Git and cancellation remain real.
  const clock = join(bin, "deadline.mjs");
  await writeFile(clock, [
    "const original = globalThis.setTimeout;",
    "globalThis.setTimeout = (callback, ms, ...args) =>",
    "  original(callback, ms === 3000 || ms === 30000 ? 500 : ms, ...args);",
  ].join("\n"));
  const env = {
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    ARC_TEST_FETCH_DELAY: "3500",
    ARC_DISABLE_UPDATE_CHECKS: "1",
  };
  return { ...harness, root, env, clock };
}

describe("materializing command fetch", () => {
  it.each(commands)("$label allows a slow fetch to finish", async ({ args }) => {
    const f = await fixture();
    try {
      const result = await runCli(args, { cwd: f.root, env: f.env, timeout: 20_000 });
      expect(result.exitCode, result.stderr).toBe(0);
    } finally {
      await f.cleanup();
    }
  });

  it.each([...commands, { label: "sync", args: ["sync"] },
    { label: "sync dry run", args: ["sync", "--json", "--dry-run", "--yes"] }])(
    "$label reports a recoverable timeout and succeeds on retry", async ({ args }) => {
      const f = await fixture();
      try {
        const before = await git(f.origin, ["for-each-ref", "--format=%(refname) %(objectname)"]);
        const result = await runCli(args, {
          cwd: f.root,
          env: { ...f.env, NODE_OPTIONS: `--import=${pathToFileURL(f.clock).href}` },
          timeout: 20_000,
        });
        expect(result.exitCode).toBe(1);
        const diagnostic = args.includes("--json") ? result.stderr : result.stdout + result.stderr;
        expect(diagnostic).toContain("timed out");
        expect(diagnostic).toContain("Retry");
        expect(await git(f.origin, ["for-each-ref", "--format=%(refname) %(objectname)"])).toBe(before);
        if (args.includes("--json")) {
          expect(JSON.parse(result.stdout)).toMatchObject({
            cell: "none", reason: "worktree-fetch-timeout", exitCode: 1,
            recommendedSummaryLine: expect.stringContaining("Retry"),
            remedy: { argv: ["arc", ...args] },
          });
        }
        const retry = await runCli(args, { cwd: f.root, env: { ARC_DISABLE_UPDATE_CHECKS: "1" } });
        expect(retry.exitCode, retry.stderr).toBe(0);
      } finally {
        await f.cleanup();
      }
    },
  );
});
