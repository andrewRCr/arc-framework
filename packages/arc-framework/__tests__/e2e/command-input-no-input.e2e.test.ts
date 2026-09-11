/** End-to-end bounded-termination proof for interaction-capable CLI commands. */

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NO_INPUT_MATRIX } from "../fixtures/command-input/no-input-matrix.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcNoTty, runArcWithStdin } from "./helpers.js";

describe("command-input no-input matrix", () => {
  const repositories: string[] = [];
  const spawnedWorktrees: Array<{ repository: string; path: string }> = [];

  afterEach(async () => {
    await Promise.all(spawnedWorktrees.splice(0).map(async ({ repository, path }) => {
      await git(repository, ["worktree", "remove", "--force", path]).catch(() => cleanupTempDir(path));
    }));
    await Promise.all(repositories.splice(0).map((path) => cleanupTempDir(path)));
  });

  it.runIf(process.platform === "linux")(
    "renders one stable progress line per phase for an explicit no-input start in a TTY",
    async () => {
      const cwd = await createTempRepo("arc-command-input-progress-e2e-");
      repositories.push(cwd);
      const initialized = await runArcNoTty(
        ["--no-input", "init", "--name", "progress", "--identity", "matrix"],
        cwd,
        { timeout: 10_000, env: { CI: "false" } },
      );
      expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
      const configPath = join(cwd, ".arc", "system", "arc-config.yml");
      const config = await readFile(configPath, "utf8");
      const slowed = config.replace(/worktree\.post_create:.*$/mu, "worktree.post_create: sleep 1");
      expect(slowed, "expected worktree.post_create in installed config").not.toBe(config);
      await writeFile(configPath, slowed, "utf8");
      await git(cwd, ["config", "core.hooksPath", "/dev/null"]);
      await git(cwd, ["add", "."]);
      await git(cwd, ["commit", "-m", "chore: initialize progress fixture"]);

      const origin = await mkdtemp(join(tmpdir(), "arc-command-input-progress-origin-"));
      repositories.push(origin);
      await git(origin, ["init", "--bare", "--initial-branch=main"]);
      await git(cwd, ["remote", "add", "origin", origin]);
      await git(cwd, ["push", "-u", "origin", "main"]);

      const result = await runArc(
        ["--no-input", "start", "stable-progress", "--new", "--yes"],
        cwd,
        { timeout: 30_000, env: { CI: "false" } },
      );
      const listed = await git(cwd, ["worktree", "list", "--porcelain"]);
      for (const line of listed.split("\n")) {
        if (!line.startsWith("worktree ")) continue;
        const path = line.slice("worktree ".length);
        if (path !== cwd) spawnedWorktrees.push({ repository: cwd, path });
      }

      expect(result.exitCode, JSON.stringify(result)).toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      for (const label of [
        "Spawning worktree...",
        "Refreshing ROADMAP...",
        "Committing and pushing start ceremony...",
      ]) {
        expect(output.split(label).length - 1, `${label}\n${output}`).toBe(1);
      }
      expect(output).not.toMatch(/[◒◐◓◑]/u);
    },
  );

  it.each(NO_INPUT_MATRIX)("terminates $commandPath for each unavailable-interaction signal", async (entry) => {
    const invoke = async (
      run: (cwd: string) => ReturnType<typeof runArcNoTty>,
    ) => {
      const cwd = await createTempRepo("arc-command-input-e2e-");
      repositories.push(cwd);
      if (entry.fixture !== "bare") {
        const initialized = await runArcNoTty(
          ["--no-input", "init", "--name", "matrix", "--identity", "matrix"],
          cwd,
          { timeout: 10_000, env: { CI: "false" } },
        );
        expect(initialized.exitCode, JSON.stringify(initialized)).toBe(0);
        if (entry.configuration === "full-protection") {
          const configPath = join(cwd, ".arc", "system", "arc-config.yml");
          const config = await readFile(configPath, "utf8");
          const updated = config.replace("branch.protection: partial", "branch.protection: full");
          expect(updated, "expected the installed partial-protection setting").not.toBe(config);
          await writeFile(configPath, updated);
        }
        await git(cwd, ["add", "."]);
        await git(cwd, ["commit", "-m", "chore: initialize fixture"]);
      }
      if (entry.setup !== undefined) {
        const commitment = entry.setup === "provisional-stub" ? "provisional" : "planned";
        const stubbed = await runArcNoTty(
          [
            "--no-input",
            "stub",
            "matrix",
            "--commitment",
            commitment,
            "--priority",
            "P2",
          ],
          cwd,
          { timeout: 10_000, env: { CI: "false" } },
        );
        expect(stubbed.exitCode, JSON.stringify(stubbed)).toBe(0);
        await git(cwd, ["add", "."]);
        await git(cwd, ["commit", "-m", "chore: add matrix work unit"]);
      }
      if (entry.commandPath === "start") {
        const origin = await mkdtemp(join(tmpdir(), "arc-command-input-origin-"));
        repositories.push(origin);
        await git(origin, ["init", "--bare", "--initial-branch=main"]);
        await git(cwd, ["remote", "add", "origin", origin]);
        await git(cwd, ["push", "-u", "origin", "main"]);
      }
      const before = entry.preservesWorktree === true ? await git(cwd, ["status", "--porcelain=v1"]) : undefined;
      const result = await run(cwd);
      const after = entry.preservesWorktree === true ? await git(cwd, ["status", "--porcelain=v1"]) : undefined;
      return { result, mutationPreserved: before === after };
    };
    const runs = await Promise.all([
      invoke((cwd) => entry.stdin === undefined
        ? runArc(["--no-input", ...entry.args], cwd, { timeout: 10_000, env: { CI: "false" } })
        : runArcWithStdin(
            ["--no-input", ...entry.args],
            cwd,
            entry.stdin,
            { timeout: 10_000, env: { CI: "false" } },
          ))
        .then((run) => ({ signal: "--no-input", ...run })),
      invoke((cwd) => entry.stdin === undefined
        ? runArc(entry.args.slice(), cwd, { timeout: 10_000, env: { CI: "true" } })
        : runArcWithStdin(entry.args.slice(), cwd, entry.stdin, { timeout: 10_000, env: { CI: "true" } }))
        .then((run) => ({ signal: "CI", ...run })),
      invoke((cwd) => entry.stdin === undefined
        ? runArcNoTty(entry.args.slice(), cwd, { timeout: 10_000, env: { CI: "false" } })
        : runArcWithStdin(entry.args.slice(), cwd, entry.stdin, { timeout: 10_000, env: { CI: "false" } }))
        .then((run) => ({ signal: "non-TTY", ...run })),
    ]);

    for (const { signal, result, mutationPreserved } of runs) {
      expect(result.timedOut, `${signal}: ${JSON.stringify(result)}`).not.toBe(true);
      expect(result.exitCode, `${signal}: ${JSON.stringify(result)}`).toBe(entry.expected.exitCode);
      if (entry.expected.outputIncludes !== undefined) {
        expect(`${result.stdout}\n${result.stderr}`, signal).toContain(entry.expected.outputIncludes);
      }
      if (entry.preservesWorktree === true) {
        expect(mutationPreserved, `${signal}: protected worktree changed`).toBe(true);
      }
    }
  });

  it("preserves explicitly selected commit-message stdin bytes", async () => {
    const cwd = await createTempRepo("arc-command-input-stdin-e2e-");
    repositories.push(cwd);
    const initialized = await runArcNoTty(
      ["--no-input", "init", "--name", "matrix", "--identity", "matrix"],
      cwd,
      { timeout: 10_000, env: { CI: "true" } },
    );
    expect(initialized.exitCode).toBe(0);
    const message = "feat(check): validate exact piped bytes\n\nContext: standalone (maintenance)\n";
    const result = await runArcWithStdin(
      ["--no-input", "check", "commit-msg", "-", "--json"],
      cwd,
      message,
      { timeout: 10_000, env: { CI: "true" } },
    );

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ result: { kind: "validated", verdict: "pass" } });
  });

  it("preserves explicitly selected inbox-title stdin", async () => {
    const cwd = await createTempRepo("arc-command-input-inbox-e2e-");
    repositories.push(cwd);
    const initialized = await runArcNoTty(
      ["--no-input", "init", "--name", "matrix", "--identity", "matrix"],
      cwd,
      { timeout: 10_000, env: { CI: "true" } },
    );
    expect(initialized.exitCode).toBe(0);
    const configPath = join(cwd, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"), "utf8");

    const result = await runArcWithStdin(
      ["--no-input", "errand", "open", "matrix-stdin", "--inbox-title-file", "-"],
      cwd,
      "Exact stdin title\n",
      { timeout: 10_000, env: { CI: "true" } },
    );

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Exact stdin title");
    expect(await git(cwd, ["branch", "--show-current"])).toBe("main");
  });
});
