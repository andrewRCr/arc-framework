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

// Codex delivers the session identity on the hook's stdin JSON payload (session_id),
// not via an environment variable, so the test harness feeds it the same way. The
// default is a realistic UUIDv7 (Codex 0.142.5's session_id shape); a null sessionId
// exercises the sessionless fallback scope.
const DEFAULT_SESSION_ID = "019f2efb-d813-7900-ae5b-519a9cbaea26";

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
  sessionId: string | null;
  emittedAt: string;
  fallback: boolean;
  reason: string | null;
  seedPath: string | null;
}

interface RunOpts {
  // undefined → DEFAULT_SESSION_ID on stdin; null → no session_id (sessionless scope).
  sessionId?: string | null;
  env?: NodeJS.ProcessEnv;
  args?: string[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function claimSentinelPath(markerPath: string): string {
  return markerPath.replace(/\.json$/, ".claim.json");
}

function hookStdin(sessionId: string | null): string {
  const payload: Record<string, unknown> = { hook_event_name: "PreCompact" };
  if (sessionId !== null) {
    payload.session_id = sessionId;
  }
  return `${JSON.stringify(payload)}\n`;
}

function hookEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ARC_HOOK_ARC_COMMAND: "arc",
    ARC_HOOK_STALE_BUILD_COMMAND: "",
    ARC_HOOK_HARNESS: "",
    CLAUDE_PROJECT_DIR: "",
    ...overrides,
  };
}

function resolveSessionId(opts: RunOpts): string | null {
  return opts.sessionId === undefined ? DEFAULT_SESSION_ID : opts.sessionId;
}

function runHookScript(path: string, cwd?: string, opts: RunOpts = {}): HookOutput {
  return JSON.parse(runHookScriptRaw(path, cwd, opts)) as HookOutput;
}

function runHookScriptRaw(path: string, cwd?: string, opts: RunOpts = {}): string {
  return execFileSync(process.execPath, [path, ...(opts.args ?? [])], {
    cwd,
    encoding: "utf8",
    input: hookStdin(resolveSessionId(opts)),
    stdio: ["pipe", "pipe", "pipe"],
    env: hookEnv(opts.env),
  });
}

// Runs a hook script under an intermediate short-lived shell (`true && node …`),
// exactly like a real Codex hook command — so the node process's parent pid is the
// ephemeral shell, and differs between successive invocations. This reproduces the
// production condition a scope keyed on parent pid could never survive; a
// session_id-keyed scope matches across these distinct-pid processes.
function runHookViaShellRaw(path: string, cwd: string, opts: RunOpts = {}): string {
  const command = `true && ${shellArg(process.execPath)} ${shellArg(path)}`;
  return execFileSync("sh", ["-c", command], {
    cwd,
    encoding: "utf8",
    input: hookStdin(resolveSessionId(opts)),
    stdio: ["pipe", "pipe", "pipe"],
    env: hookEnv(opts.env),
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

function markerFileNameFor(sessionId: string | null = DEFAULT_SESSION_ID): string {
  const suffix = sessionId !== null && sessionId.length > 0 ? sessionId : "sessionless";
  return `codex-compaction-recovery-pending-${recoveryFileSuffix(suffix)}.json`;
}

function identityMarkerPath(root: string, sessionId: string | null = DEFAULT_SESSION_ID): string {
  return join(root, ".arc", "user", "andrew", ".internal", markerFileNameFor(sessionId));
}

function fallbackMarkerPath(root: string, sessionId: string | null = DEFAULT_SESSION_ID): string {
  return join(root, ".arc", "user", ".internal", markerFileNameFor(sessionId));
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

function runSeedSuccess(root: string, opts: RunOpts = {}): void {
  runHookScriptRaw(seedScriptPath, root, {
    ...opts,
    env: {
      ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
      ARC_HOOK_HARNESS: "codex-cli",
      ...opts.env,
    },
  });
}

function runSeedFailure(root: string, opts: RunOpts = {}): void {
  runHookScriptRaw(seedScriptPath, root, {
    ...opts,
    env: {
      ARC_HOOK_ARC_COMMAND: `${shellArg(process.execPath)} -e ${shellArg("process.exit(1);")}`,
      ARC_HOOK_HARNESS: "codex-cli",
      ...opts.env,
    },
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
    expect(seedScript).toContain("readHookInput");
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_STALE_BUILD_COMMAND: nodeScriptCommand(fakeBuildPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      const marker = readJson<PendingMarker>(identityMarkerPath(root));
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.seedPath).toBe(".arc/user/andrew/.internal/compaction-seed.json");
    });
  });

  it("writes markers only for the Codex harness", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root, { env: { ARC_HOOK_HARNESS: "claude-code" } });
      expect(existsSync(identityMarkerPath(root))).toBe(false);
      expect(existsSync(fallbackMarkerPath(root))).toBe(false);
    });

    withTempArcProject((root) => {
      const outside = mkdtempSync(join(tmpdir(), "arc-codex-outside-"));
      try {
        // CLAUDE_PROJECT_DIR present with no explicit harness reads as Claude Code.
        runHookScriptRaw(seedScriptPath, outside, {
          env: {
            ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
            CLAUDE_PROJECT_DIR: root,
          },
        });
        expect(existsSync(identityMarkerPath(root))).toBe(false);
        expect(existsSync(fallbackMarkerPath(root))).toBe(false);

        // An explicit harness declaration outranks the CLAUDE_PROJECT_DIR tell,
        // and marker state resolves against the project dir, not the cwd.
        runHookScriptRaw(seedScriptPath, outside, {
          env: {
            ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
            ARC_HOOK_HARNESS: "codex-cli",
            CLAUDE_PROJECT_DIR: root,
          },
        });
        expect(existsSync(identityMarkerPath(root))).toBe(true);
        expect(existsSync(identityMarkerPath(outside))).toBe(false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it("writes a fallback marker when the PreCompact seed command fails", () => {
    withTempArcProject((root) => {
      runSeedFailure(root);

      const marker = readJson<PendingMarker>(fallbackMarkerPath(root));
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.fallback).toBe(true);
      expect(marker.seedPath).toBeNull();
      expect(marker.reason).toBe("seed command exited 1");
      expect(existsSync(identityMarkerPath(root))).toBe(false);
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root)).reason).toBe(
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root)).reason).toBe(
        "seed command reported an unexpected seed path",
      );
    });
  });

  it("accepts the emitted seed path when the hook runs from a subdirectory of the ARC root", () => {
    withTempArcProject((root) => {
      // The seed-path check must resolve the ARC root by walking up to `.arc/`,
      // exactly as the `arc` emitter's resolveArcRoot does — not by naive-joining
      // the raw hook cwd. When PreCompact runs from a subdirectory (or a linked
      // worktree) the raw cwd is not the ARC root, yet the emitter still writes the
      // seed under the walked-up root; a naive join would mis-expect the path and
      // fall back with "unexpected seed path". A real git repo makes resolveRepoRoot
      // (git show-toplevel) deterministic, mirroring production.
      execFileSync("git", ["init", "-q"], { cwd: root });
      const subdir = join(root, "packages", "arc-framework");
      mkdirSync(subdir, { recursive: true });

      runHookScriptRaw(seedScriptPath, subdir, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      // The real (non-fallback) marker is armed under the walked-up root, and no
      // "unexpected seed path" fallback is written.
      expect(readJson<PendingMarker>(identityMarkerPath(root)).fallback).toBe(false);
      expect(existsSync(fallbackMarkerPath(root))).toBe(false);
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root)).reason).toBe(
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      expect(readJson<PendingMarker>(fallbackMarkerPath(root)).reason).toBe(
        "seed command reported a written seed for an unsafe identity",
      );
    });
  });

  it("injects recovery context once, then dedupes across both channels", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root);
      const markerPath = identityMarkerPath(root);
      expect(existsSync(markerPath)).toBe(true);

      const output = runHookScript(postToolUseScriptPath, root);
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
      expect(runHookScriptRaw(postToolUseScriptPath, root)).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root)).toBe("");

      // A different session never claims this session's marker.
      expect(runHookScriptRaw(postToolUseScriptPath, root, { sessionId: "other-session" })).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root, { sessionId: "other-session" })).toBe("");

      // Clearing removes the marker + claim and closes the window with the banner.
      expect(runHookScriptRaw(clearScriptPath, root)).toContain(
        "=== ARC post-compaction recovery: COMPLETE ===",
      );
      expect(existsSync(markerPath)).toBe(false);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(false);
      expect(runHookScriptRaw(postToolUseScriptPath, root)).toBe("");
      expect(runHookScriptRaw(userPromptScriptPath, root)).toBe("");
    });
  });

  it("matches the marker across separate hook processes with distinct parent pids", () => {
    withTempArcProject((root) => {
      // The regression this fix closes: the PreCompact writer and the PostToolUse
      // reader are independent OS processes under different short-lived shells, so
      // their parent pids differ. They agree on the marker only because both key it
      // on the stdin session_id — a ppid-derived scope would never match here. (The
      // prior in-process harness spawned every hook as a child of one test process,
      // so a shared pid masked exactly this bug.)
      const sessionId = "019f2f00-aaaa-7000-8000-000000000001";
      runHookViaShellRaw(seedScriptPath, root, {
        sessionId,
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(writeSuccessFakeArc(root)),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });
      const markerPath = identityMarkerPath(root, sessionId);
      expect(existsSync(markerPath)).toBe(true);

      const output = JSON.parse(runHookViaShellRaw(postToolUseScriptPath, root, { sessionId })) as HookOutput;
      expect(output.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);

      // A separate-process reader on a different session id still must not cross-inject.
      expect(runHookViaShellRaw(postToolUseScriptPath, root, { sessionId: "019f2f00-bbbb-7000-8000-000000000002" }))
        .toBe("");
    });
  });

  it("injects from the UserPromptSubmit channel when no tool boundary claimed first", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root);
      const markerPath = identityMarkerPath(root);

      const output = runHookScript(userPromptScriptPath, root);
      expect(output.suppressOutput).toBe(true);
      expect(output.hookSpecificOutput).toMatchObject({ hookEventName: "UserPromptSubmit" });
      expect(output.hookSpecificOutput?.additionalContext).toContain("=== ARC post-compaction recovery: PENDING ===");
      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);

      // Having claimed via the prompt channel, the tool channel now stays silent.
      expect(existsSync(claimSentinelPath(markerPath))).toBe(true);
      expect(runHookScriptRaw(postToolUseScriptPath, root)).toBe("");
    });
  });

  it("re-arms the claim when a later compaction rewrites the marker", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root);
      runHookScript(postToolUseScriptPath, root);
      const markerPath = identityMarkerPath(root);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(true);
      expect(runHookScriptRaw(postToolUseScriptPath, root)).toBe("");

      // A later compaction rewrites the marker and drops the stale claim, so the
      // next boundary injects again.
      runSeedSuccess(root);
      expect(existsSync(claimSentinelPath(markerPath))).toBe(false);
      const output = runHookScript(postToolUseScriptPath, root);
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

      runHookScriptRaw(seedScriptPath, root, {
        env: {
          ARC_HOOK_ARC_COMMAND: nodeScriptCommand(fakeArcPath),
          ARC_HOOK_HARNESS: "codex-cli",
        },
      });

      const marker = readJson<PendingMarker>(fallbackMarkerPath(root));
      expect(marker.fallback).toBe(true);
      expect(marker.seedPath).toBeNull();
      expect(marker.reason).toContain("seed-invalid");

      const output = runHookScript(postToolUseScriptPath, root, {
        env: { ARC_HOOK_ARC_COMMAND: "npx arc" },
      });
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext).toContain("Seed issue detected");
      expect(additionalContext).toContain("npx arc status --session-init --write-compaction-seed --json");
      expect(additionalContext).toContain("npx arc recover audit --json");
      expect(additionalContext).toContain("seed-invalid");
    });
  });

  it("keeps recovery filenames collision-free for unsafe session ids", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root, { sessionId: "a/b" });
      runSeedSuccess(root, { sessionId: "a_b" });

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
      expect(readJson<PendingMarker>(slashMarkerPath).sessionId).toBe("a/b");
      expect(readJson<PendingMarker>(underscoreMarkerPath).sessionId).toBe("a_b");

      const slashOutput = runHookScript(postToolUseScriptPath, root, { sessionId: "a/b" });
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
        runHookScriptRaw(clearScriptPath, root, { args: ["--marker", markerPath] }),
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

  it("uses a stable sessionless-scoped marker when no session id is available", () => {
    withTempArcProject((root) => {
      // With no session_id on stdin, the writer falls back to a single stable scope —
      // NOT a ppid-derived one. A separate reader process (also session-id-less)
      // computes the same marker name and finds it, which a per-process ppid scope
      // never could.
      runSeedSuccess(root, { sessionId: null });
      const markerPath = identityMarkerPath(root, null);
      expect(markerPath).toContain("codex-compaction-recovery-pending-sessionless.json");
      expect(existsSync(markerPath)).toBe(true);
      expect(readJson<PendingMarker>(markerPath).scope).toEqual({ kind: "sessionless", id: "sessionless" });
      expect(readJson<PendingMarker>(markerPath).sessionId).toBeNull();

      const output = runHookScript(postToolUseScriptPath, root, { sessionId: null });
      expect(output.hookSpecificOutput?.additionalContext).toContain(markerPath);
    });
  });

  it("clears all same-scope pending markers when recovery sees more than one", () => {
    withTempArcProject((root) => {
      runSeedFailure(root);
      runSeedSuccess(root);
      const globalMarkerPath = fallbackMarkerPath(root);
      const scopedMarkerPath = identityMarkerPath(root);
      expect(existsSync(globalMarkerPath)).toBe(true);
      expect(existsSync(scopedMarkerPath)).toBe(true);

      const output = runHookScript(userPromptScriptPath, root);
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext).toContain("clear the markers");
      expect(additionalContext.match(/--marker/gu)).toHaveLength(2);
      expect(additionalContext).toContain(globalMarkerPath);
      expect(additionalContext).toContain(scopedMarkerPath);

      expect(runHookScriptRaw(clearScriptPath, root)).toContain(
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
      runSeedFailure(root);
      runSeedSuccess(root);
      const globalMarkerPath = fallbackMarkerPath(root);
      const scopedMarkerPath = identityMarkerPath(root);
      writeFileSync(claimSentinelPath(globalMarkerPath), `${JSON.stringify({ claimedAt: "prior" })}\n`);

      const output = runHookScript(postToolUseScriptPath, root);
      const additionalContext = output.hookSpecificOutput?.additionalContext ?? "";
      expect(additionalContext.match(/--marker/gu)).toHaveLength(1);
      expect(additionalContext).toContain(scopedMarkerPath);
      expect(additionalContext).not.toContain(globalMarkerPath);
      expect(additionalContext).not.toContain("clear the markers");
    });
  });

  it("treats malformed scoped markers as pending", () => {
    withTempArcProject((root) => {
      const markerPath = identityMarkerPath(root);
      writeFileSync(markerPath, "{not-json");

      const output = runHookScript(userPromptScriptPath, root);

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

      runSeedSuccess(root);

      expect(existsSync(legacyHandoffPath)).toBe(false);
      expect(existsSync(deadScopeMarkerPath)).toBe(false);
      expect(existsSync(identityMarkerPath(root))).toBe(true);
    });
  });

  it("uses ARC_HOOK_ARC_COMMAND in injected recovery instructions", () => {
    withTempArcProject((root) => {
      runSeedSuccess(root);

      const output = runHookScript(postToolUseScriptPath, root, {
        env: { ARC_HOOK_ARC_COMMAND: "npx arc" },
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
