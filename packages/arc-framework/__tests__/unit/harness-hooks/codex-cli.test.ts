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

function runHookScript(path: string, cwd?: string, env: NodeJS.ProcessEnv = {}): HookOutput {
  return JSON.parse(runHookScriptRaw(path, cwd, env)) as HookOutput;
}

function runHookScriptRaw(path: string, cwd?: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [path], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_THREAD_ID: "",
      ...env,
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
    expect(hook.command).toContain("ARC_HOOK_HARNESS=codex-cli");
    expect(hook.command).toContain("git rev-parse --show-toplevel");
    expect(hook.command).toContain(".arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs");
    expect(hook.commandWindows).toContain("ARC_HOOK_HARNESS=codex-cli");
    expect(hook.commandWindows).toContain("git rev-parse --show-toplevel");
    expect(hook.commandWindows).toContain(".arc\\system\\.internal\\harness-hooks\\common\\pre-compact-seed.mjs");

    const seedScript = readFileSync(seedScriptPath, "utf8");
    expect(seedScript).toContain("ARC_HOOK_ARC_COMMAND");
    expect(seedScript).toContain("ARC_HOOK_HARNESS");
    expect(seedScript).toContain("status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("stdio: \"ignore\"");
    expect(seedScript).toContain("process.exit(0)");
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
      expect(postCompactOutput.systemMessage).toContain("repo instructions and session context");
      expect(postCompactOutput.systemMessage).toContain("Send \"continue\" to the agent");
      expect(existsSync(markerPath)).toBe(true);

      const marker = readJson<{ kind: string; seedPath: string; codexThreadId: string }>(markerPath);
      expect(marker.kind).toBe("codex-compaction-recovery-pending");
      expect(marker.codexThreadId).toBe("thread-a");
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

      const clearOtherThreadOutput = runHookScript(clearScriptPath, root, { CODEX_THREAD_ID: "thread-b" });
      expect(clearOtherThreadOutput.removed).toEqual([]);
      expect(existsSync(markerPath)).toBe(true);

      const clearOutput = runHookScript(clearScriptPath, root, env);
      expect(clearOutput.removed).toHaveLength(1);
      expect(existsSync(markerPath)).toBe(false);
      expect(runHookScriptRaw(userPromptScriptPath, root, env)).toBe("");
    });
  });

  it("uses ARC_HOOK_ARC_COMMAND in injected recovery instructions", () => {
    withTempArcProject((root) => {
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
