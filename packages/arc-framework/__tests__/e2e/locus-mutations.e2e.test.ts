/** Built-command coverage for stateful locus companions. */

import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("arc locus mutation commands", () => {
  let repository: string;
  let linkedCheckout: string | null;

  beforeEach(async () => {
    repository = await createTempRepo();
    linkedCheckout = null;
    const initialized = await runArc(["init", "--yes", "--name", "locus-mutation-fixture"], repository);
    expect(initialized.exitCode).toBe(0);
    await git(repository, ["config", "arc.identity", "test-user"]);
    await git(repository, ["commit", "--allow-empty", "--no-verify", "-m", "initialize fixture"]);
    const configPath = join(repository, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"), "utf8");
  });

  afterEach(async () => {
    if (linkedCheckout !== null) {
      await git(repository, ["worktree", "remove", "--force", linkedCheckout]).catch(() => undefined);
    }
    await cleanupTempDir(repository);
  });

  it("adopts a trusted directed transient checkout and releases only its exact lease", async () => {
    const slug = "adopted-residue";
    const claimId = "d".repeat(32);
    linkedCheckout = join(repository, ".fixture-worktrees", slug);
    await git(repository, ["worktree", "add", "-b", `chore/${slug}`, linkedCheckout, "main"]);
    await seedOpenErrandIdentity(repository, slug, claimId);
    const markerPath = join(linkedCheckout, ".arc", "system", ".internal", "worktree-marker.json");
    await mkdir(join(linkedCheckout, ".arc", "system", ".internal"), { recursive: true });
    await writeFile(markerPath, `${JSON.stringify({
      spawnedByArc: true,
      spawningIdentity: "test-user",
      createdAt: "2026-07-21T00:00:00.000Z",
      createdFor: { kind: "errand", slug, claimId },
      provisioning: "ready",
    })}\n`, "utf8");
    const nested = join(repository, "nested", "command-cwd");
    await mkdir(nested, { recursive: true });

    const attached = await runAnchored(["locus", "attach", "--checkout", linkedCheckout, "--json"], nested);
    expect(attached.exitCode, attached.stdout + attached.stderr).toBe(0);
    const attachment = JSON.parse(attached.stdout.trim()) as { recordId: string; leaseId: string };
    expect(attachment).toMatchObject({ outcome: "applied", operation: "locus-attach" });
    expect(attachment.recordId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(attachment.leaseId).toMatch(/^[0-9a-f]{32,}$/u);

    const mismatch = await runAnchored([
      "locus", "release", attachment.recordId, "--lease", "e".repeat(32), "--json",
    ], nested);
    expect(mismatch.exitCode).toBe(1);
    expect(JSON.parse(mismatch.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "locus-release",
      reason: "lease-generation-mismatch",
    });

    const released = await runAnchored([
      "locus", "release", attachment.recordId, "--lease", attachment.leaseId, "--json",
    ], nested);
    expect(released.exitCode, released.stdout + released.stderr).toBe(0);
    expect(JSON.parse(released.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "locus-release",
      recordId: attachment.recordId,
      leaseId: null,
    });
  });

  it("adopts an exact marker-and-meta work-unit role", async () => {
    const slug = "adopted-work-unit";
    linkedCheckout = join(repository, ".fixture-worktrees", slug);
    await git(repository, ["worktree", "add", "-b", `feat/${slug}`, linkedCheckout, "main"]);
    await mkdir(join(linkedCheckout, ".arc", "active"), { recursive: true });
    await writeFile(join(linkedCheckout, ".arc", "active", `meta-${slug}.md`), [
      `# Metadata: ${slug}`,
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      `- **Branch:** feat/${slug}`,
      "- **Class:** Light",
      "- **Cohort:** [none]",
      "- **Task List:** [none]",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Blockers:** [none]",
      "- **Next Action:** Continue execution",
      "",
    ].join("\n"), "utf8");
    await mkdir(join(linkedCheckout, ".arc", "system", ".internal"), { recursive: true });
    await writeFile(
      join(linkedCheckout, ".arc", "system", ".internal", "worktree-marker.json"),
      `${JSON.stringify({
        spawnedByArc: true,
        spawningIdentity: "test-user",
        createdAt: "2026-07-21T00:00:00.000Z",
        createdFor: { kind: "work-unit", name: slug },
      })}\n`,
      "utf8",
    );

    const attached = await runAnchoredSequence([
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
      ["locus", "attach", "--checkout", linkedCheckout, "--json"],
    ], repository);
    expect(attached.exitCode, attached.stdout + attached.stderr).toBe(0);
    expect(attached.results).toHaveLength(2);
    expect(attached.results[0]).toMatchObject({
      outcome: "applied",
      operation: "locus-attach",
      identity: null,
      activeLocusPath: linkedCheckout,
    });
    expect(attached.results[1]).toMatchObject({
      outcome: "idempotent",
      operation: "locus-attach",
      activeLocusPath: linkedCheckout,
    });
  });

  it("adopts only an exact markerless primary work-unit match", async () => {
    const slug = "primary-work-unit";
    await git(repository, ["switch", "-c", "feat/unowned"]);
    const refused = await runAnchored(["locus", "attach", "--json"], repository);
    expect(refused.exitCode).toBe(1);
    expect(JSON.parse(refused.stdout.trim())).toMatchObject({
      outcome: "refused",
      operation: "locus-attach",
      reason: "role-conflict",
    });

    await git(repository, ["switch", "-c", `feat/${slug}`]);
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, ".arc", "active", `meta-${slug}.md`), [
      `# Metadata: ${slug}`,
      "",
      "- **State:** Active",
      "- **Owner:** test-user",
      `- **Branch:** feat/${slug}`,
      "- **Class:** Light",
      "- **Cohort:** [none]",
      "- **Task List:** [none]",
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Blockers:** [none]",
      "- **Next Action:** Continue execution",
      "",
    ].join("\n"), "utf8");

    const adopted = await runAnchored(["locus", "attach", "--json"], repository);
    expect(adopted.exitCode, adopted.stdout + adopted.stderr).toBe(0);
    expect(JSON.parse(adopted.stdout.trim())).toMatchObject({
      outcome: "applied",
      operation: "locus-attach",
      identity: null,
      activeLocusPath: repository,
    });

  });

  it("keeps operational JSON on stdout and exposes the exact public operands", async () => {
    const help = await runCli(["locus", "release", "--help"], { cwd: repository });
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("release [options] <recordId>");
    expect(help.stdout).toContain("--lease <id>");

    const invalid = await runCli([
      "locus", "resolve", `sha256:${"1".repeat(64)}`, "--action", "erase", "--json",
    ], { cwd: repository });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toBe("");
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      outcome: "error",
      operation: "locus-resolve",
      error: { code: "locus.resolve.input" },
    });
  });
});

async function seedOpenErrandIdentity(cwd: string, slug: string, claimId: string): Promise<void> {
  const record = {
    version: 3,
    slug,
    claimId,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: slug,
    branch: `chore/${slug}`,
    origin: "description",
    originEntry: null,
    dispatchId: null,
    state: "open",
    savedHead: null,
    changeRequest: null,
  };
  const blob = (await gitWithInput(cwd, ["hash-object", "-w", "--stdin"], `${JSON.stringify(record)}\n`)).trim();
  const tree = (await gitWithInput(cwd, ["mktree"], `100644 blob ${blob}\t${slug}\n`)).trim();
  const commit = await git(cwd, ["commit-tree", tree, "-m", `seed ${slug}`]);
  await git(cwd, ["update-ref", "refs/arc/user/test-user/errands", commit]);
}

function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", rejectResult);
    child.on("close", (code) => code === 0
      ? resolveResult(stdout)
      : rejectResult(new Error(`git ${args.join(" ")} failed: ${stderr}`)));
    child.stdin.end(input);
  });
}

async function runAnchored(args: string[], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const command = [process.execPath, CLI_PATH, ...args].map(shellQuote).join(" ");
  const interactiveCommand = `${command}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellQuote(interactiveCommand)}`, "/dev/null"],
      { cwd, env: { ...process.env, NO_COLOR: "1", PS1: "" } },
    );
    return { stdout: normalizeAnchoredOutput(stdout), stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: normalizeAnchoredOutput(failure.stdout ?? ""),
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

async function runAnchoredSequence(argsList: readonly string[][], cwd: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  results: unknown[];
}> {
  const commands = argsList.map((args) => [process.execPath, CLI_PATH, ...args].map(shellQuote).join(" "));
  const interactiveCommand = `${commands.join("; ")}; command_status=$?; exit $command_status`;
  try {
    const { stdout, stderr } = await execFileAsync(
      "script",
      ["-qec", `bash --noprofile --norc -ic ${shellQuote(interactiveCommand)}`, "/dev/null"],
      { cwd, env: { ...process.env, NO_COLOR: "1", PS1: "" } },
    );
    const normalized = normalizeAnchoredOutput(stdout);
    return { stdout: normalized, stderr, exitCode: 0, results: parseJsonLines(normalized) };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string };
    const normalized = normalizeAnchoredOutput(failure.stdout ?? "");
    return {
      stdout: normalized,
      stderr: failure.stderr ?? "",
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      results: parseJsonLines(normalized),
    };
  }
}

function parseJsonLines(output: string): unknown[] {
  return output.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

function normalizeAnchoredOutput(value: string): string {
  return value.replaceAll("\r", "").split("\n").filter((line) => line !== "exit").join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
