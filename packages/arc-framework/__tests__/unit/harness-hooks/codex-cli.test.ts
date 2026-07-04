import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Recipe } from "../../../src/lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");
const hookRoot = resolve(packageRoot, "arc/system/.internal/harness-hooks");
const hooksPath = resolve(hookRoot, "codex-cli/hooks.json");
const featuresPath = resolve(hookRoot, "codex-cli/features.config.toml");
const markerScriptPath = resolve(hookRoot, "common/codex-recovery-marker.mjs");
const clearScriptPath = resolve(hookRoot, "common/clear-codex-recovery-pending.mjs");
const seedScriptPath = resolve(hookRoot, "common/pre-compact-seed.mjs");
const postToolUseScriptPath = resolve(hookRoot, "common/post-tool-use-recover.mjs");
const userPromptScriptPath = resolve(hookRoot, "common/user-prompt-recover.mjs");

interface CommandHook {
  type: "command";
  command: string;
  commandWindows?: string;
  statusMessage?: string;
  timeout?: number;
}

interface MatcherGroup {
  matcher?: string;
  hooks: CommandHook[];
}

interface CodexHooksFragment {
  hooks: {
    PreCompact: MatcherGroup[];
    PostCompact?: MatcherGroup[];
    PostToolUse: MatcherGroup[];
    UserPromptSubmit: MatcherGroup[];
    SessionStart?: MatcherGroup[];
  };
}

interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
  };
}

interface PendingMarker {
  schemaVersion: number;
  kind: string;
  scope: { kind: string; id: string };
  codexThreadId: string | null;
  emittedAt: string;
  fallback: boolean;
  reason: string | null;
  seedPath: string | null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function claimSentinelPath(markerPath: string): string {
  return markerPath.replace(/\.json$/, ".claim.json");
}

function runHookScript(
  path: string,
  cwd?: string,
  env: NodeJS.ProcessEnv = {},
  args: string[] = [],
): HookOutput {
  return JSON.parse(runHookScriptRaw(path, cwd, env, args)) as HookOutput;
}

function runHookScriptRaw(
  path: string,
  cwd?: string,
  envOverrides: NodeJS.ProcessEnv = {},
  args: string[] = [],
): string {
  return execFileSync(process.execPath, [path, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ARC_HOOK_ARC_COMMAND: "arc",
      ARC_HOOK_STALE_BUILD_COMMAND: "",
      ARC_HOOK_HARNESS: "",
      CLAUDE_PROJECT_DIR: "",
      CODEX_THREAD_ID: "",
      ...envOverrides,
    },
  });
}

function shellArg(value: string): string {
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function nodeScriptCommand(path: string): string {
  return `${shellArg(process.execPath)} ${shellArg(path)}`;
}

function recoveryFileSuffix(value: string): string {
  let suffix = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const char = String.fromCharCode(byte);
    suffix += /^[A-Za-z0-9._-]$/u.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return suffix;
}

function markerFileNameFor(env: NodeJS.ProcessEnv = {}): string {
  const threadId = env.CODEX_THREAD_ID?.trim();
  const rawSuffix = threadId && threadId.length > 0 ? threadId : `ppid-${process.pid}`;
  return `codex-compaction-recovery-pending-${recoveryFileSuffix(rawSuffix)}.json`;
}

function identityMarkerPath(root: string, env: NodeJS.ProcessEnv = {}): string {
  return join(root, ".arc", "user", "andrew", ".internal", markerFileNameFor(env));
}

function fallbackMarkerPath(root: string, env: NodeJS.ProcessEnv = {}): string {
  return join(root, ".arc", "user", ".internal", markerFileNameFor(env));
}

function writeSuccessFakeArc(root: string, identity = "andrew"): string {
  const fakeArcPath = join(root, "fake-arc.mjs");
  writeFileSync(fakeArcPath, [
    `process.stdout.write(${JSON.stringify(`${JSON.stringify({
      identity: { identity },
      compactionSeedWrite: {
        status: "written",
        path: join(root, ".arc", "user", identity, ".internal", "compaction-seed.json"),
      },
    })}\n`)});`,
  ].join("\n"));
  return fakeArcPath;
}

function runSeedSuccess(root: string, env: NodeJS.ProcessEnv = {}): void {
  runHookScriptRaw(seedScriptPath, root, {
    ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
    ARC_HOOK_HARNESS: "codex-cli",
    ...env,
  });
}

function runSeedFailure(root: string, env: NodeJS.ProcessEnv = {}): void {
  runHookScriptRaw(seedScriptPath, root, {
    ARC_HOOK_ARC_COMMAND: `${shellArg(process.execPath)} -e ${shellArg("process.exit(1);")}`,
    ARC_HOOK_HARNESS: "codex-cli",
    ...env,
  });
}

function withTempArcProject<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "arc-codex-hook-"));

  try {
    mkdirSync(join(root, ".arc", "user", "andrew", ".internal"), { recursive: true });
    writeFileSync(join(root, ".arc", "user", "andrew", ".internal", "compaction-seed.json"), "{}\n");
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("Codex CLI compaction recovery hook recipe", () => {
  it("ships hooks.json, an opt-in feature fragment, and shared hook scripts", () => {
    const recipe = readJson<Recipe>(resolve(packageRoot, "init-recipe.json"));

    expect(recipe.include_files).toEqual(expect.arrayContaining([
      "system/.internal/harness-hooks/codex-cli/features.config.toml",
      "system/.internal/harness-hooks/codex-cli/hooks.json",
      "system/.internal/harness-hooks/common/codex-recovery-marker.mjs",
      "system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs",
      "system/.internal/harness-hooks/common/pre-compact-seed.mjs",
      "system/.internal/harness-hooks/common/post-tool-use-recover.mjs",
      "system/.internal/harness-hooks/common/user-prompt-recover.mjs",
    ]));
    expect(recipe.include_files).not.toContain(
      "system/.internal/harness-hooks/common/post-compact-recover.mjs",
    );
    expect(existsSync(hooksPath)).toBe(true);
    expect(existsSync(featuresPath)).toBe(true);
    expect(existsSync(markerScriptPath)).toBe(true);
    expect(existsSync(clearScriptPath)).toBe(true);
    expect(existsSync(seedScriptPath)).toBe(true);
    expect(existsSync(postToolUseScriptPath)).toBe(true);
    expect(existsSync(userPromptScriptPath)).toBe(true);
  });

  it("keeps the Codex feature flag fragment narrow and canonical", () => {
    const content = readFileSync(featuresPath, "utf8");

    expect(content.replace(/\r\n?/gu, "\n")).toBe([
      "[features]",
      "hooks = true",
      "",
    ].join("\n"));
  });

  it("defines a nonblocking PreCompact seed-write hook for manual and auto compaction", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);

    expect(fragment.hooks.PreCompact).toHaveLength(1);
    const [preCompact] = fragment.hooks.PreCompact;
    expect(preCompact).toMatchObject({
      matcher: "manual|auto",
      hooks: [
        {
          type: "command",
          timeout: 30,
          statusMessage: "Writing ARC compaction seed",
        },
      ],
    });

    const hook = preCompact!.hooks[0]!;
    expect(hook.command).toContain("ARC_HOOK_HARNESS=codex-cli");
    expect(hook.command).toContain("git rev-parse --show-toplevel");
    expect(hook.command).toContain("cd \"$repo_root\"");
    expect(hook.command).toContain(".arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs");
    expect(hook.command).toContain("|| exit 0");
    expect(hook.commandWindows).toContain("ARC_HOOK_HARNESS=codex-cli");
    expect(hook.commandWindows).toContain("git rev-parse --show-toplevel");
    expect(hook.commandWindows).toContain("cd /d");
    expect(hook.commandWindows).toContain(".arc\\system\\.internal\\harness-hooks\\common\\pre-compact-seed.mjs");
    expect(hook.commandWindows).toContain("|| exit /b 0");

    const seedScript = readFileSync(seedScriptPath, "utf8");
    expect(seedScript).toContain("ARC_HOOK_ARC_COMMAND");
    expect(seedScript).toContain("status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("writePendingMarker");
    expect(seedScript).toContain("writeFallbackPendingMarker");
    expect(seedScript).toContain("reapExpiredRecoveryArtifacts");
    expect(seedScript).toContain("drainStdin");
    expect(seedScript).toContain("ARC_HOOK_STALE_BUILD_COMMAND");
    expect(seedScript).toContain("timeout: 15_000");
    expect(seedScript).toContain("stdio: [\"ignore\", \"pipe\", \"pipe\"]");
    expect(seedScript).toContain("process.exit(0)");
  });

  it("routes recovery through PostToolUse injection with a UserPromptSubmit backstop", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);

    expect(fragment.hooks.PostCompact).toBeUndefined();

    expect(fragment.hooks.PostToolUse).toHaveLength(1);
    const [postToolUseGroup] = fragment.hooks.PostToolUse;
    expect(postToolUseGroup?.matcher).toBeUndefined();
    const postToolUseHook = postToolUseGroup?.hooks[0];
    expect(postToolUseHook).toMatchObject({ type: "command", timeout: 30 });
    expect(postToolUseHook?.command).toContain(
      ".arc/system/.internal/harness-hooks/common/post-tool-use-recover.mjs",
    );
    expect(postToolUseHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\post-tool-use-recover.mjs",
    );

    expect(fragment.hooks.UserPromptSubmit).toHaveLength(1);
    expect(fragment.hooks.UserPromptSubmit[0]?.matcher).toBeUndefined();
    const userPromptHook = fragment.hooks.UserPromptSubmit[0]?.hooks[0];
    expect(userPromptHook).toMatchObject({ type: "command", timeout: 30 });
    expect(userPromptHook?.command).toContain(".arc/system/.internal/harness-hooks/common/user-prompt-recover.mjs");
    expect(userPromptHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\user-prompt-recover.mjs",
    );

    expect(fragment.hooks.SessionStart).toHaveLength(1);
    const [sessionStartGroup] = fragment.hooks.SessionStart ?? [];
    expect(sessionStartGroup?.matcher).toBe("clear");
    const sessionStartHook = sessionStartGroup?.hooks[0];
    expect(sessionStartHook?.command).toContain(
      ".arc/system/.internal/harness-hooks/common/clear-codex-recovery-pending.mjs",
    );
    expect(sessionStartHook?.command).toContain("|| exit 0");
    expect(sessionStartHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\clear-codex-recovery-pending.mjs",
    );
    expect(sessionStartHook?.commandWindows).toContain("|| exit /b 0");
  });

  it("resolves every hook script from the primary worktree and surfaces genuine failures", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);
    const pre = fragment.hooks.PreCompact[0]?.hooks[0];
    const ptu = fragment.hooks.PostToolUse[0]?.hooks[0];
    const clear = (fragment.hooks.SessionStart ?? [])[0]?.hooks[0];
    const ups = fragment.hooks.UserPromptSubmit[0]?.hooks[0];

    // Every hook resolves its script from the primary worktree (git-common-dir parent),
    // not the running worktree — so a branch-version-skewed worktree runs the canonical
    // current script instead of failing on a script its own checkout lacks.
    for (const hook of [pre, ptu, clear, ups]) {
      expect(hook?.command).toContain("--path-format=absolute --git-common-dir");
      expect(hook?.commandWindows).toContain("--path-format=absolute --git-common-dir");
    }

    // Recovery-injection hooks must NOT swallow failures: a genuinely-owed recovery that
    // cannot run surfaces (the script is always present via primary resolution, so the only
    // failure left is a real install breakage worth surfacing).
    expect(ptu?.command).not.toContain("|| exit 0");
    expect(ptu?.commandWindows).not.toContain("|| exit /b 0");
    expect(ups?.command).not.toContain("|| exit 0");
    expect(ups?.commandWindows).not.toContain("|| exit /b 0");

    // Harness-blocking hooks keep the guard: they must never block compaction or session start.
    expect(pre?.command).toContain("|| exit 0");
    expect(pre?.commandWindows).toContain("|| exit /b 0");
    expect(clear?.command).toContain("|| exit 0");
    expect(clear?.commandWindows).toContain("|| exit /b 0");
  });

  it("retries the PreCompact seed write after an explicitly configured stale-build repair", () => {
    withTempArcProject((root) => {
      const statePath = join(root, "build-state.json");
      const fakeArcPath = join(root, "fake-arc.mjs");
      const fakeBuildPath = join(root, "fake-build.mjs");
      writeFileSync(statePath, `${JSON.stringify({ built: false })}\n`);
      writeFileSync(fakeArcPath, [
        "import { readFileSync } from 'node:fs';",
        `const state = JSON.parse(readFileSync(${JSON.stringify(statePath)}, 'utf8'));`,
        "if (state.built !== true) {",
        "  console.error('error: arc dev build is stale (src/lib/recover/audit.ts changed 1s ago; dist/cli.js built 1h ago). Refusing `arc status` against stale dist; run `npm run build`, then retry.');",
        "  process.exit(1);",
        "}",
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          identity: { identity: "andrew" },
          compactionSeedWrite: {
            status: "written",
            path: join(root, ".arc", "user", "andrew", ".internal", "compaction-seed.json"),
          },
        })}\n`)});`,
      ].join("\n"));
      writeFileSync(fakeBuildPath, [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(statePath)}, JSON.stringify({ built: true }));`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_STALE_BUILD_COMMAND: nodeScriptCommand(fakeBuildPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      const marker = readJson<PendingMarker>(identityMarkerPath(root, env));
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.seedPath).toBe(".arc/user/andrew/.internal/compaction-seed.json");
    });
  });

  it("writes markers only for the Codex harness", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root, { CODEX_THREAD_ID: "thread-a", ARC_HOOK_HARNESS: "claude-code" });
      expect(existsSync(identityMarkerPath(root, { CODEX_THREAD_ID: "thread-a" }))).toBe(false);
      expect(existsSync(fallbackMarkerPath(root, { CODEX_THREAD_ID: "thread-a" }))).toBe(false);
    });

    withTempArcProject((root) => {
      const outside = mkdtempSync(join(tmpdir(), "arc-codex-outside-"));
      try {
        // CLAUDE_PROJECT_DIR present with no explicit harness reads as Claude Code.
        runHookScriptRaw(seedScriptPath, outside, {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
          CLAUDE_PROJECT_DIR: root,
          CODEX_THREAD_ID: "thread-a",
        });
        expect(existsSync(identityMarkerPath(root, { CODEX_THREAD_ID: "thread-a" }))).toBe(false);
        expect(existsSync(fallbackMarkerPath(root, { CODEX_THREAD_ID: "thread-a" }))).toBe(false);

        // An explicit harness declaration outranks the CLAUDE_PROJECT_DIR tell,
        // and marker state resolves against the project dir, not the cwd.
        runHookScriptRaw(seedScriptPath, outside, {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
          ARC_HOOK_HARNESS: "codex-cli",
          CLAUDE_PROJECT_DIR: root,
          CODEX_THREAD_ID: "thread-a",
        });
        expect(existsSync(identityMarkerPath(root, { CODEX_THREAD_ID: "thread-a" }))).toBe(true);
        expect(existsSync(identityMarkerPath(outside, { CODEX_THREAD_ID: "thread-a" }))).toBe(false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it("writes a fallback marker when the PreCompact seed command fails", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedFailure(root, env);

      const marker = readJson<PendingMarker>(fallbackMarkerPath(root, env));
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.fallback).toBe(true);
      expect(marker.seedPath).toBeNull();
      expect(marker.reason).toBe("seed command exited 1");
      expect(existsSync(identityMarkerPath(root, env))).toBe(false);
    });
  });

  it("writes a fallback marker when seed writing is skipped", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          compactionSeedWrite: {
            status: "skipped",
            reason: "identity-missing",
          },
        })}\n`)});`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root, env)).reason).toBe(
        "seed write skipped (identity-missing)",
      );
    });
  });

  it("writes a fallback marker for invalid emitted seed paths", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          identity: { identity: "andrew" },
          compactionSeedWrite: {
            status: "written",
            path: join(root, ".arc", "user", ".internal", ".internal", "compaction-seed.json"),
          },
        })}\n`)});`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root, env)).reason).toBe(
        "seed command reported an unexpected seed path",
      );
    });
  });

  it("does not trim identity when validating emitted seed paths", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          identity: { identity: "andrew " },
          compactionSeedWrite: {
            status: "written",
            path: join(root, ".arc", "user", "andrew", ".internal", "compaction-seed.json"),
          },
        })}\n`)});`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root, env)).reason).toBe(
        "seed command reported a written seed for an unsafe identity",
      );
    });
  });

  it("rejects control-character identities when validating emitted seed paths", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          identity: { identity: "bad\nname" },
          compactionSeedWrite: {
            status: "written",
            path: join(root, ".arc", "user", "bad\nname", ".internal", "compaction-seed.json"),
          },
        })}\n`)});`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root, env)).reason).toBe(
        "seed command reported a written seed for an unsafe identity",
      );
    });
  });

  it("injects recovery context once, then dedupes across both channels", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedSuccess(root, env);
      const markerPath = identityMarkerPath(root, env);
      expect(existsSync(markerPath)).toBe(true);

      const output = runHookScript(postToolUseScriptPath, root, env);
      // Codex 0.142.5 rejects extra top-level fields (suppressOutput) on
      // PostToolUse output, so the payload carries hookSpecificOutput only.
      expect(Object.keys(output)).toEqual(["hookSpecificOutput"]);
      expect(output.hookSpecificOutput).toMatchObject({ hookEventName: "PostToolUse" });
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext).toContain("=== ARC post-compaction recovery: PENDING ===");
      expect(additionalContext).toContain("Agent instructions — complete before resuming project work.");
      // The audit is mandatory even when residual context feels sufficient — compaction loss is silent.
      expect(additionalContext).toContain("mandatory even if your context feels sufficient");
      expect(additionalContext).toContain("session-recover.md");
      expect(additionalContext).toContain("2. Audit command: arc recover audit --json.");
      expect(additionalContext).toContain(
        "re-verify any actions taken since compaction",
      );
      expect(additionalContext).toContain("clear-codex-recovery-pending.mjs");
      expect(additionalContext).toContain("--marker");
      expect(additionalContext).toContain(markerPath);
      expect(additionalContext).not.toContain("Seed issue");

      // The atomic claim sentinel gates re-injection: the first boundary claims it,
      // and every later boundary — same channel or the UserPromptSubmit channel —
      // stays silent until the marker is cleared. No more re-nag.
      expect(existsSync(claimSentinelPath(markerPath))).toBe(true);
      expect(runHookScriptRaw(postToolUseScriptPath, root, env)).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root, env)).toBe("");

      expect(runHookScriptRaw(postToolUseScriptPath, root, { CODEX_THREAD_ID: "thread-b" })).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root, { CODEX_THREAD_ID: "thread-b" })).toBe("");

      // Clearing removes the marker + claim and closes the window with the banner.
      expect(runHookScriptRaw(clearScriptPath, root, env)).toContain(
        "=== ARC post-compaction recovery: COMPLETE ===",
      );
      expect(existsSync(markerPath)).toBe(false);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(false);
      expect(runHookScriptRaw(postToolUseScriptPath, root, env)).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root, env)).toBe("");
    });
  });

  it("injects from the UserPromptSubmit channel when no tool boundary claimed first", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedSuccess(root, env);
      const markerPath = identityMarkerPath(root, env);

      const output = runHookScript(userPromptScriptPath, root, env);
      expect(output.suppressOutput).toBe(true);
      expect(output.hookSpecificOutput).toMatchObject({ hookEventName: "UserPromptSubmit" });
      expect(output.hookSpecificOutput?.additionalContext).toContain("=== ARC post-compaction recovery: PENDING ===");
      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);

      // Having claimed via the prompt channel, the tool channel now stays silent.
      expect(existsSync(claimSentinelPath(markerPath))).toBe(true);
      expect(runHookScriptRaw(postToolUseScriptPath, root, env)).toBe("");
    });
  });

  it("re-arms the claim when a later compaction rewrites the marker", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedSuccess(root, env);
      runHookScript(postToolUseScriptPath, root, env);
      const markerPath = identityMarkerPath(root, env);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(true);
      expect(runHookScriptRaw(postToolUseScriptPath, root, env)).toBe("");

      // A later compaction rewrites the marker and drops the stale claim, so the
      // next boundary injects again.
      runSeedSuccess(root, env);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(false);
      const output = runHookScript(postToolUseScriptPath, root, env);
      expect(output.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
    });
  });

  it("preserves seed-write failure details in injected recovery instructions", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        `process.stdout.write(${JSON.stringify(`${JSON.stringify({
          identity: { identity: "andrew" },
          compactionSeedWrite: {
            status: "failed",
            reason: "seed-invalid",
            message: "compaction-seed: value does not match schema v1",
          },
        })}\n`)});`,
      ].join("\n"));

      const env = { CODEX_THREAD_ID: "thread-a" };
      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
        ARC_HOOK_HARNESS: "codex-cli",
      });

      const marker = readJson<PendingMarker>(fallbackMarkerPath(root, env));
      expect(marker.fallback).toBe(true);
      expect(marker.seedPath).toBeNull();
      expect(marker.reason).toContain("seed-invalid");

      const output = runHookScript(postToolUseScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: "npx arc",
      });
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext).toContain("Seed issue detected");
      expect(additionalContext).toContain("npx arc status --session-init --write-compaction-seed --json");
      expect(additionalContext).toContain("npx arc recover audit --json");
      expect(additionalContext).toContain("seed-invalid");
    });
  });

  it("keeps recovery filenames collision-free for unsafe thread ids", () => {
    withTempArcProject((root) => {
      const slashThread = { CODEX_THREAD_ID: "a/b" };
      const underscoreThread = { CODEX_THREAD_ID: "a_b" };
      runSeedSuccess(root, slashThread);
      runSeedSuccess(root, underscoreThread);

      const slashMarkerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-a%2Fb.json",
      );
      const underscoreMarkerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-a_b.json",
      );
      expect(existsSync(slashMarkerPath)).toBe(true);
      expect(existsSync(underscoreMarkerPath)).toBe(true);
      expect(readJson<PendingMarker>(slashMarkerPath).codexThreadId).toBe("a/b");
      expect(readJson<PendingMarker>(underscoreMarkerPath).codexThreadId).toBe("a_b");

      const slashOutput = runHookScript(postToolUseScriptPath, root, slashThread);
      expect(slashOutput.hookSpecificOutput?.additionalContext).toContain(slashMarkerPath);
      expect(slashOutput.hookSpecificOutput?.additionalContext).not.toContain(underscoreMarkerPath);
    });
  });

  it("rejects explicit marker paths that are not recovery marker JSON files", () => {
    withTempArcProject((root) => {
      const markerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json.bak",
      );
      writeFileSync(markerPath, "{}\n");

      expect(() =>
        runHookScriptRaw(clearScriptPath, root, { CODEX_THREAD_ID: "thread-a" }, ["--marker", markerPath]),
      ).toThrow("Invalid ARC recovery marker path");
      expect(existsSync(markerPath)).toBe(true);
    });
  });

  it("keeps marker-clear recovery instructions platform-specific", () => {
    const content = readFileSync(markerScriptPath, "utf8");

    expect(content).toContain('process.platform === "win32"');
    expect(content).toContain('for /f "delims=" %i');
    expect(content).toContain("windowsQuote");
    expect(content).toContain('.replaceAll("^", "^^")');
    expect(content).toContain('.replaceAll("%", "^%")');
    expect(content).toContain("shellQuote");
  });

  it("uses process-scoped markers instead of a global fallback when no thread id is available", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root);
      const markerPath = identityMarkerPath(root);
      expect(markerPath).toContain(`ppid-${process.pid}`);
      expect(existsSync(markerPath)).toBe(true);

      const output = runHookScript(postToolUseScriptPath, root);
      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);
    });
  });

  it("clears all same-scope pending markers when recovery sees more than one", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedFailure(root, env);
      runSeedSuccess(root, env);
      const globalMarkerPath = fallbackMarkerPath(root, env);
      const scopedMarkerPath = identityMarkerPath(root, env);
      expect(existsSync(globalMarkerPath)).toBe(true);
      expect(existsSync(scopedMarkerPath)).toBe(true);

      const output = runHookScript(userPromptScriptPath, root, env);
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext).toContain("clear the markers");
      expect(additionalContext.match(/--marker/gu)).toHaveLength(2);
      expect(additionalContext).toContain(globalMarkerPath);
      expect(additionalContext).toContain(scopedMarkerPath);

      expect(runHookScriptRaw(clearScriptPath, root, env)).toContain(
        "=== ARC post-compaction recovery: COMPLETE ===",
      );
      expect(existsSync(globalMarkerPath)).toBe(false);
      expect(existsSync(scopedMarkerPath)).toBe(false);
    });
  });

  it("injects only the markers this process won, not the full pending set", () => {
    withTempArcProject((root) => {
      // Two same-scope markers, with the global one already claimed by a
      // (simulated) concurrent process. This process must inject only the marker
      // it wins — emitting the full set from each racer would duplicate.
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedFailure(root, env);
      runSeedSuccess(root, env);
      const globalMarkerPath = fallbackMarkerPath(root, env);
      const scopedMarkerPath = identityMarkerPath(root, env);
      writeFileSync(claimSentinelPath(globalMarkerPath), `${JSON.stringify({ claimedAt: "prior" })}\n`);

      const output = runHookScript(postToolUseScriptPath, root, env);
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext.match(/--marker/gu)).toHaveLength(1);
      expect(additionalContext).toContain(scopedMarkerPath);
      expect(additionalContext).not.toContain(globalMarkerPath);
      expect(additionalContext).not.toContain("clear the markers");
    });
  });

  it("treats malformed scoped markers as pending", () => {
    withTempArcProject((root) => {
      const markerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );
      writeFileSync(markerPath, "{not-json");

      const output = runHookScript(userPromptScriptPath, root, { CODEX_THREAD_ID: "thread-a" });

      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);
    });
  });

  it("reaps expired recovery artifacts while keeping live markers", () => {
    withTempArcProject((root) => {
      const expiredEmittedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      const legacyHandoffPath = join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-seed-ppid-99999.json",
      );
      const deadScopeMarkerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-ppid-88888.json",
      );
      mkdirSync(dirname(legacyHandoffPath), { recursive: true });
      writeFileSync(legacyHandoffPath, `${JSON.stringify({
        schemaVersion: 1,
        kind: "codex-compaction-recovery-seed",
        emittedAt: expiredEmittedAt,
      })}\n`);
      writeFileSync(deadScopeMarkerPath, `${JSON.stringify({
        schemaVersion: 1,
        kind: "codex-compaction-recovery-pending",
        emittedAt: expiredEmittedAt,
      })}\n`);

      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedSuccess(root, env);

      expect(existsSync(legacyHandoffPath)).toBe(false);
      expect(existsSync(deadScopeMarkerPath)).toBe(false);
      expect(existsSync(identityMarkerPath(root, env))).toBe(true);
    });
  });

  it("uses ARC_HOOK_ARC_COMMAND in injected recovery instructions", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      runSeedSuccess(root, env);

      const output = runHookScript(postToolUseScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: "npx arc",
      });

      expect(output.hookSpecificOutput?.additionalContext).toContain(
        "2. Audit command: npx arc recover audit --json.",
      );
    });
  });

  it("hooks only SessionStart clear cleanup in Codex because source compact can fire late", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);

    expect(fragment.hooks.SessionStart).toHaveLength(1);
    expect(fragment.hooks.SessionStart?.[0]?.matcher).toBe("clear");
    expect(fragment.hooks.SessionStart?.[0]?.hooks[0]?.command).toContain(
      "clear-codex-recovery-pending.mjs",
    );
  });
});
