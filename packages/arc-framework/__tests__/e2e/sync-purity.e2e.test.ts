/**
 * Subprocess stdout purity contract for `arc sync --json`.
 *
 * Asserts that the shipped CLI binary emits exactly one trailing-newline-
 * terminated JSON object on stdout — no ANSI escapes, no Clack-spinner cursor
 * codes, no log lines — across five representative matrix cells. Diagnostics
 * are permitted on stderr.
 *
 * No `@clack/prompts` mock is installed: the subprocess is the real CLI, and
 * any Clack output that reaches the parent process via the child's stdout is
 * a contract violation.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";
import { runCli } from "../helpers/run-cli.js";
import { runArc } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** ANSI CSI prefix (ESC `[`) — any occurrence in stdout is a contract violation. */
const ANSI_CSI = `${String.fromCharCode(0x1b)}[`;

interface PureEnvelope {
  cell: string;
  exitCode: number;
  reason?: string;
}

/**
 * Assert subprocess stdout meets the purity contract and return the parsed
 * envelope. Caller asserts cell-specific fields after.
 */
function parsePureEnvelope(stdout: string): PureEnvelope {
  expect(
    stdout.includes(ANSI_CSI),
    "stdout must not contain ANSI escape sequences",
  ).toBe(false);
  expect(stdout.endsWith("\n"), "stdout must end with a single newline").toBe(true);
  const trimmed = stdout.trim();
  const parsed = JSON.parse(trimmed) as unknown;
  expect(typeof parsed === "object" && parsed !== null).toBe(true);
  return parsed as PureEnvelope;
}

/** Replace one or more `key: value` lines in arc-config.yml. */
async function overrideArcConfig(
  cwd: string,
  overrides: Record<string, string>,
): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  let content = await readFile(path, "utf-8");
  for (const [key, value] of Object.entries(overrides)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}:[^\\n]*$`, "m");
    const next = content.replace(re, `${key}: ${value}`);
    if (next === content) {
      throw new Error(`Failed to override ${key} in ${path}`);
    }
    content = next;
  }
  await writeFile(path, content, "utf-8");
}

/**
 * Install ARC into a clone via the built CLI, optionally apply config
 * overrides, then commit so the worktree carries the install on top of the
 * harness's seed commit.
 */
async function installArcInClone(
  cwd: string,
  configOverrides: Record<string, string> = {},
): Promise<void> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], cwd);
  if (init.exitCode !== 0) {
    throw new Error(`arc init failed (exit ${init.exitCode}): ${init.stderr}`);
  }
  if (Object.keys(configOverrides).length > 0) {
    await overrideArcConfig(cwd, configOverrides);
  }
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync(
    "git",
    ["-c", "core.hooksPath=/dev/null", "commit", "-m", "install arc"],
    { cwd },
  );
}

/** Build a multi-clone harness with `arc.identity` pre-set on both clones. */
async function setupClonesWithIdentity(identity: string): Promise<MultiClone> {
  return setupMultiClone({
    cloneA: { config: { "arc.identity": identity } },
    cloneB: { config: { "arc.identity": identity } },
  });
}

describe("arc sync --json stdout purity", () => {
  const identity = "test-user";

  it("paired-push cell: pure stdout JSON, exit 0", async () => {
    const harness = await setupClonesWithIdentity(identity);
    try {
      await installArcInClone(harness.cloneA, {
        "session.push_interlock": "on-sync",
      });
      await writeFile(
        join(harness.cloneA, ".arc", "user", identity, "SESSION-NOTES.md"),
        "# paired purity\n",
        "utf-8",
      );

      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });

      const envelope = parsePureEnvelope(result.stdout);
      expect(envelope.cell).toBe("paired-push");
      expect(envelope.exitCode).toBe(0);
      expect(result.exitCode).toBe(0);

      // Info-level chatter and note blocks duplicate envelope fields — suppressed
      // under --json so consumers can `2>&1 | jq` without contamination. Errors
      // and warnings still fire on stderr (proven by the prompt-policy case).
      expect(result.stderr).not.toMatch(/^info: /m);
      expect(result.stderr).not.toContain("[Saved]");
    } finally {
      await harness.cleanup();
    }
  });

  it("save-only cell: pure stdout JSON, exit 0", async () => {
    const harness = await setupClonesWithIdentity(identity);
    try {
      await installArcInClone(harness.cloneA, {
        "user.notes_push": "manual",
      });

      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });

      const envelope = parsePureEnvelope(result.stdout);
      expect(envelope.cell).toBe("save-only");
      expect(envelope.exitCode).toBe(0);
      expect(result.exitCode).toBe(0);
    } finally {
      await harness.cleanup();
    }
  });

  it("blocked-diverged cell: pure stdout JSON, exit 1", async () => {
    const harness = await setupClonesWithIdentity(identity);
    try {
      // Clone B advances origin first so clone A's later commit produces a
      // diverged worktree state on `main`.
      await execFileAsync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "from clone B"],
        { cwd: harness.cloneB },
      );
      await execFileAsync("git", ["push", "origin", "main"], { cwd: harness.cloneB });

      await installArcInClone(harness.cloneA, {
        "session.push_interlock": "on-sync",
      });

      const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });

      const envelope = parsePureEnvelope(result.stdout);
      expect(envelope.cell).toBe("blocked-diverged");
      expect(envelope.exitCode).toBe(1);
      expect(result.exitCode).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });

  it(
    "prompt-policy cell under --json: pure stdout JSON, degradation warning on stderr",
    async () => {
      const harness = await setupClonesWithIdentity(identity);
      try {
        await installArcInClone(harness.cloneA, {
          "user.notes_push": "prompt",
        });

        const result = await runCli(["sync", "--json"], { cwd: harness.cloneA });

        const envelope = parsePureEnvelope(result.stdout);
        // Prompt degrades to manual under --json → matrix resolves to save-only.
        expect(envelope.cell).toBe("save-only");
        expect(envelope.exitCode).toBe(0);
        expect(result.exitCode).toBe(0);

        // Degradation warning lands on stderr, not stdout.
        expect(result.stderr).toContain("degrading");
        expect(result.stdout).not.toContain("degrading");

        // Warns fire on stderr; info-level chatter is suppressed under --json.
        expect(result.stderr).not.toMatch(/^info: /m);
      } finally {
        await harness.cleanup();
      }
    },
  );

  it("identity-absent error path: pure stdout envelope, exit 1", async () => {
    const harness = await setupClonesWithIdentity(identity);
    try {
      await installArcInClone(harness.cloneA);
      // Strip every identity source so resolveUserIdentity throws.
      // arc.identity falls back to slugified user.name when unset, so both
      // local entries are removed; GIT_CONFIG_* env vars block the host's
      // global/system gitconfig from supplying a fallback.
      await execFileAsync(
        "git", ["config", "--unset", "arc.identity"], { cwd: harness.cloneA },
      );
      await execFileAsync(
        "git", ["config", "--unset", "user.name"], { cwd: harness.cloneA },
      );

      const result = await runCli(["sync", "--json"], {
        cwd: harness.cloneA,
        env: {
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      });

      const envelope = parsePureEnvelope(result.stdout);
      expect(envelope.cell).toBe("none");
      expect(envelope.reason).toBe("identity-absent");
      expect(result.exitCode).toBe(1);
    } finally {
      await harness.cleanup();
    }
  });
});
