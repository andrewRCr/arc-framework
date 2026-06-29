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
const postCompactScriptPath = resolve(hookRoot, "common/post-compact-recover.mjs");
const userPromptScriptPath = resolve(hookRoot, "common/user-prompt-recover.mjs");

interface CommandHook {
  type: "command";
  command: string;
  commandWindows?: string;
  statusMessage?: string;
  timeout?: number;
}

interface MatcherGroup {
  matcher: string;
  hooks: CommandHook[];
}

interface CodexHooksFragment {
  hooks: {
    PreCompact: MatcherGroup[];
    PostCompact: MatcherGroup[];
    UserPromptSubmit: MatcherGroup[];
    SessionStart?: MatcherGroup[];
  };
}

interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  systemMessage?: string;
  suppressOutput?: boolean;
  removed?: string[];
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
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
  env: NodeJS.ProcessEnv = {},
  args: string[] = [],
): string {
  return execFileSync(process.execPath, [path, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CODEX_THREAD_ID: "",
      ...env,
    },
  });
}

function writeSeedHandoff(root: string, env: NodeJS.ProcessEnv = {}): string {
  const threadId = env.CODEX_THREAD_ID?.trim();
  const suffix = threadId && threadId.length > 0 ? threadId : `ppid-${process.pid}`;
  const scope = threadId && threadId.length > 0
    ? { kind: "thread", id: threadId }
    : { kind: "process", id: String(process.pid) };
  const handoffPath = join(
    root,
    ".arc",
    "user",
    ".internal",
    `codex-compaction-recovery-seed-${suffix}.json`,
  );

  mkdirSync(dirname(handoffPath), { recursive: true });
  writeFileSync(handoffPath, `${JSON.stringify({
    schemaVersion: 1,
    kind: "codex-compaction-recovery-seed",
    scope,
    codexThreadId: threadId && threadId.length > 0 ? threadId : null,
    hookParentPid: process.pid,
    emittedAt: new Date().toISOString(),
    seedPath: ".arc/user/andrew/.internal/compaction-seed.json",
  }, null, 2)}\n`);
  return handoffPath;
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
      "system/.internal/harness-hooks/common/post-compact-recover.mjs",
      "system/.internal/harness-hooks/common/user-prompt-recover.mjs",
    ]));
    expect(existsSync(hooksPath)).toBe(true);
    expect(existsSync(featuresPath)).toBe(true);
    expect(existsSync(markerScriptPath)).toBe(true);
    expect(existsSync(clearScriptPath)).toBe(true);
    expect(existsSync(seedScriptPath)).toBe(true);
    expect(existsSync(postCompactScriptPath)).toBe(true);
    expect(existsSync(userPromptScriptPath)).toBe(true);
  });

  it("keeps the Codex feature flag fragment narrow and canonical", () => {
    const content = readFileSync(featuresPath, "utf8");

    expect(content).toBe([
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
    expect(hook.command).not.toContain("ARC_HOOK_HARNESS");
    expect(hook.command).toContain("git rev-parse --show-toplevel");
    expect(hook.command).toContain(".arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs");
    expect(hook.commandWindows).not.toContain("ARC_HOOK_HARNESS");
    expect(hook.commandWindows).toContain("git rev-parse --show-toplevel");
    expect(hook.commandWindows).toContain(".arc\\system\\.internal\\harness-hooks\\common\\pre-compact-seed.mjs");

    const seedScript = readFileSync(seedScriptPath, "utf8");
    expect(seedScript).toContain("ARC_HOOK_ARC_COMMAND");
    expect(seedScript).toContain("status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("writeSeedHandoff");
    expect(seedScript).toContain("ARC_HOOK_STALE_BUILD_COMMAND");
    expect(seedScript).toContain("timeout: 15_000");
    expect(seedScript).toContain("stdio: [\"ignore\", \"pipe\", \"pipe\"]");
    expect(seedScript).toContain("process.exit(0)");
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
        "process.stdout.write(`${JSON.stringify({ identity: { identity: 'andrew' } })}\\n`);",
      ].join("\n"));
      writeFileSync(fakeBuildPath, [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(statePath)}, JSON.stringify({ built: true }));`,
      ].join("\n"));

      runHookScriptRaw(seedScriptPath, root, {
        ARC_HOOK_ARC_COMMAND: `${process.execPath} ${fakeArcPath}`,
        ARC_HOOK_STALE_BUILD_COMMAND: `${process.execPath} ${fakeBuildPath}`,
        CODEX_THREAD_ID: "thread-a",
      });

      expect(existsSync(join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-seed-thread-a.json",
      ))).toBe(true);
    });
  });

  it("clears a prior seed handoff when the PreCompact seed write fails", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      const handoffPath = writeSeedHandoff(root, env);

      runHookScriptRaw(seedScriptPath, root, {
        ...env,
        ARC_HOOK_ARC_COMMAND: "false",
      });

      expect(existsSync(handoffPath)).toBe(false);
    });
  });

  it("does not write a seed handoff for unsafe identities", () => {
    withTempArcProject((root) => {
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, [
        "process.stdout.write(`${JSON.stringify({ identity: { identity: '../other' } })}\\n`);",
      ].join("\n"));

      runHookScriptRaw(seedScriptPath, root, {
        ARC_HOOK_ARC_COMMAND: `${process.execPath} ${fakeArcPath}`,
        CODEX_THREAD_ID: "thread-a",
      });

      expect(existsSync(join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-seed-thread-a.json",
      ))).toBe(false);
    });
  });

  it("stops after PostCompact and injects recovery context on the next user prompt", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);
    const postCompactMatchers = new Map(
      fragment.hooks.PostCompact.map((group) => [group.matcher, group]),
    );

    expect([...postCompactMatchers.keys()]).toEqual(["manual|auto"]);
    expect(fragment.hooks.UserPromptSubmit).toHaveLength(1);
    expect(fragment.hooks.UserPromptSubmit[0]?.matcher).toBeUndefined();

    const postCompactHook = postCompactMatchers.get("manual|auto")?.hooks[0];
    expect(postCompactHook).toMatchObject({
      type: "command",
      timeout: 30,
      statusMessage: "Stopping for ARC recovery",
    });
    expect(postCompactHook?.command).toContain(".arc/system/.internal/harness-hooks/common/post-compact-recover.mjs");
    expect(postCompactHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\post-compact-recover.mjs",
    );

    const userPromptHook = fragment.hooks.UserPromptSubmit[0]?.hooks[0];
    expect(userPromptHook).toMatchObject({
      type: "command",
      timeout: 30,
    });
    expect(userPromptHook?.command).toContain(".arc/system/.internal/harness-hooks/common/user-prompt-recover.mjs");
    expect(userPromptHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\user-prompt-recover.mjs",
    );

    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      writeSeedHandoff(root, env);
      const markerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );

      const postCompactOutput = runHookScript(postCompactScriptPath, root, env);
      expect(postCompactOutput.continue).toBe(false);
      expect(postCompactOutput.stopReason).toContain("ARC recovery required");
      expect(postCompactOutput.systemMessage).toContain("=== ARC compaction recovery ===");
      expect(postCompactOutput.systemMessage).toContain("ARC paused after compaction");
      expect(postCompactOutput.systemMessage).toContain("ARC session context");
      expect(postCompactOutput.systemMessage).toContain("Send \"continue\" to the agent");
      expect(existsSync(markerPath)).toBe(true);
      expect(existsSync(join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-seed-thread-a.json",
      ))).toBe(false);

      const marker = readJson<{
        kind: string;
        seedPath: string;
        codexThreadId: string;
        scope: { kind: string; id: string };
      }>(markerPath);
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.codexThreadId).toBe("thread-a");
      expect(marker.scope).toEqual({ kind: "thread", id: "thread-a" });
      expect(marker.seedPath).toBe(".arc/user/andrew/.internal/compaction-seed.json");

      expect(runHookScriptRaw(userPromptScriptPath, root, { CODEX_THREAD_ID: "thread-b" })).toBe("");

      const userPromptOutput = runHookScript(userPromptScriptPath, root, env);
      expect(userPromptOutput.suppressOutput).toBe(true);
      expect(userPromptOutput.hookSpecificOutput).toMatchObject({
        hookEventName: "UserPromptSubmit",
      });
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain(
        "=== ARC post-compaction recovery (agent instructions) ===",
      );
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain("session-recover.md");
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain("2. Audit command: arc recover audit --json.");
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain("clear-codex-recovery-pending.mjs");
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain("--marker");
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain(markerPath);

      expect(() => runHookScriptRaw(clearScriptPath, root, env, ["--marker"])).toThrow(
        "Missing value for --marker",
      );
      expect(existsSync(markerPath)).toBe(true);

      const clearOtherThreadOutput = runHookScript(clearScriptPath, root, { CODEX_THREAD_ID: "thread-b" });
      expect(clearOtherThreadOutput.removed).toEqual([]);
      expect(existsSync(markerPath)).toBe(true);

      const clearOutput = runHookScript(clearScriptPath, root, { CODEX_THREAD_ID: "thread-b" }, ["--marker", markerPath]);
      expect(clearOutput.removed).toHaveLength(1);
      expect(existsSync(markerPath)).toBe(false);
      expect(runHookScriptRaw(userPromptScriptPath, root, env)).toBe("");
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
    const content = readFileSync(userPromptScriptPath, "utf8");

    expect(content).toContain('process.platform === "win32"');
    expect(content).toContain('for /f "delims=" %i');
    expect(content).toContain("windowsQuote");
    expect(content).toContain("shellQuote");
  });

  it("uses process-scoped markers instead of a global fallback when no thread id is available", () => {
    withTempArcProject((root) => {
      writeSeedHandoff(root);
      const markerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        `codex-compaction-recovery-pending-ppid-${process.pid}.json`,
      );
      const legacyGlobalMarkerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending.json",
      );

      const postCompactOutput = runHookScript(postCompactScriptPath, root);
      expect(postCompactOutput.continue).toBe(false);
      expect(existsSync(markerPath)).toBe(true);
      expect(existsSync(legacyGlobalMarkerPath)).toBe(false);

      const userPromptOutput = runHookScript(userPromptScriptPath, root);
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain(markerPath);
    });
  });

  it("writes a fallback marker after PostCompact when the seed handoff is missing", () => {
    withTempArcProject((root) => {
      const fallbackMarkerPath = join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );
      const output = runHookScript(postCompactScriptPath, root, { CODEX_THREAD_ID: "thread-a" });

      expect(output.continue).toBe(false);
      expect(output.stopReason).toContain("ARC recovery required");
      expect(output.systemMessage).toContain("report the seed issue");
      expect(existsSync(fallbackMarkerPath)).toBe(true);

      const marker = readJson<{
        fallback: boolean;
        reason: string;
        seedPath: null;
      }>(fallbackMarkerPath);
      expect(marker.fallback).toBe(true);
      expect(marker.reason).toContain("codex-compaction-recovery-seed-thread-a.json");
      expect(marker.seedPath).toBeNull();

      const userPromptOutput = runHookScript(userPromptScriptPath, root, { CODEX_THREAD_ID: "thread-a" });
      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain(fallbackMarkerPath);
    });
  });

  it("writes a fallback marker when the seed handoff body has the wrong scope", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      const handoffPath = writeSeedHandoff(root, env);
      const handoff = readJson<Record<string, unknown>>(handoffPath);
      writeFileSync(handoffPath, `${JSON.stringify({
        ...handoff,
        scope: { kind: "thread", id: "thread-b" },
      }, null, 2)}\n`);

      const fallbackMarkerPath = join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );
      const identityMarkerPath = join(
        root,
        ".arc",
        "user",
        "andrew",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );
      const output = runHookScript(postCompactScriptPath, root, env);

      expect(output.systemMessage).toContain("report the seed issue");
      expect(existsSync(fallbackMarkerPath)).toBe(true);
      expect(existsSync(identityMarkerPath)).toBe(false);
      expect(readJson<{ reason: string }>(fallbackMarkerPath).reason).toContain(
        "Mismatched ARC recovery seed handoff scope",
      );
    });
  });

  it("writes a fallback marker when the seed handoff is future dated", () => {
    withTempArcProject((root) => {
      const env = { CODEX_THREAD_ID: "thread-a" };
      const handoffPath = writeSeedHandoff(root, env);
      const handoff = readJson<Record<string, unknown>>(handoffPath);
      writeFileSync(handoffPath, `${JSON.stringify({
        ...handoff,
        emittedAt: new Date(Date.now() + 60_000).toISOString(),
      }, null, 2)}\n`);

      const fallbackMarkerPath = join(
        root,
        ".arc",
        "user",
        ".internal",
        "codex-compaction-recovery-pending-thread-a.json",
      );
      const output = runHookScript(postCompactScriptPath, root, env);

      expect(output.systemMessage).toContain("report the seed issue");
      expect(existsSync(fallbackMarkerPath)).toBe(true);
      expect(readJson<{ reason: string }>(fallbackMarkerPath).reason).toContain(
        "Stale ARC recovery seed handoff",
      );
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

  it("uses ARC_HOOK_ARC_COMMAND in injected recovery instructions", () => {
    withTempArcProject((root) => {
      writeSeedHandoff(root, { CODEX_THREAD_ID: "thread-a" });
      runHookScript(postCompactScriptPath, root, { CODEX_THREAD_ID: "thread-a" });

      const userPromptOutput = runHookScript(userPromptScriptPath, root, {
        ARC_HOOK_ARC_COMMAND: "npx arc",
        CODEX_THREAD_ID: "thread-a",
      });

      expect(userPromptOutput.hookSpecificOutput?.additionalContext).toContain(
        "2. Audit command: npx arc recover audit --json.",
      );
    });
  });

  it("does not hook SessionStart in Codex because source compact can fire late", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);

    expect(fragment.hooks.SessionStart).toBeUndefined();
  });
});
