import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Recipe } from "../../../src/lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");
const hookRoot = resolve(packageRoot, "arc/system/.internal/harness-hooks");
const settingsPath = resolve(hookRoot, "claude-code/compaction-recovery.settings.json");
const seedScriptPath = resolve(hookRoot, "common/pre-compact-seed.mjs");
const compactScriptPath = resolve(hookRoot, "common/session-start-compact.mjs");

interface CommandHook {
  type: "command";
  command: string;
  args?: string[];
  timeout?: number;
}

interface MatcherGroup {
  matcher: string;
  hooks: CommandHook[];
}

interface ClaudeCodeSettingsFragment {
  hooks: {
    PreCompact: MatcherGroup[];
    SessionStart: MatcherGroup[];
  };
}

interface HookOutput {
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function runHookScript(path: string, env: NodeJS.ProcessEnv = {}): HookOutput {
  return JSON.parse(execFileSync(process.execPath, [path], {
    encoding: "utf8",
    env: {
      ...process.env,
      ARC_HOOK_ARC_COMMAND: "arc",
      ARC_HOOK_STALE_BUILD_COMMAND: "",
      CLAUDE_PROJECT_DIR: packageRoot,
      ...env,
    },
  })) as HookOutput;
}

describe("Claude Code compaction recovery hook recipe", () => {
  it("ships every recipe artifact through init-recipe.json", () => {
    const recipe = readJson<Recipe>(resolve(packageRoot, "init-recipe.json"));

    expect(recipe.include_files).toEqual(expect.arrayContaining([
      "system/.internal/harness-hooks/claude-code/compaction-recovery.settings.json",
      "system/.internal/harness-hooks/common/pre-compact-seed.mjs",
      "system/.internal/harness-hooks/common/session-start-compact.mjs",
    ]));
    expect(recipe.include_files).not.toContain(
      "system/.internal/harness-hooks/claude-code/session-start-clear.mjs",
    );
    expect(recipe.include_files).not.toContain(
      "system/.internal/harness-hooks/claude-code/pre-compact-seed.mjs",
    );
    expect(recipe.include_files).not.toContain(
      "system/.internal/harness-hooks/claude-code/session-start-compact.mjs",
    );
  });

  it("defines a nonblocking PreCompact seed-write hook for manual and auto compaction", () => {
    const settings = readJson<ClaudeCodeSettingsFragment>(settingsPath);

    expect(settings.hooks.PreCompact).toHaveLength(1);
    const [preCompact] = settings.hooks.PreCompact;
    expect(preCompact).toMatchObject({
      matcher: "manual|auto",
      hooks: [
        {
          type: "command",
          command: "node",
          args: [
            "${CLAUDE_PROJECT_DIR}/.arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs",
          ],
          timeout: 30,
        },
      ],
    });
    expect(existsSync(seedScriptPath)).toBe(true);

    const seedScript = readFileSync(seedScriptPath, "utf8");
    expect(seedScript).toContain("ARC_HOOK_ARC_COMMAND");
    expect(seedScript).not.toContain("ARC_HOOK_HARNESS");
    expect(seedScript).toContain("writeSeedHandoff");
    expect(seedScript).toContain("status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("ARC_HOOK_STALE_BUILD_COMMAND");
    expect(seedScript).toContain("timeout: 15_000");
    expect(seedScript).toContain("stdio: [\"ignore\", \"pipe\", \"pipe\"]");
    expect(seedScript).toContain("process.exit(0)");
  });

  it("injects session-recover only for SessionStart source compact", () => {
    const settings = readJson<ClaudeCodeSettingsFragment>(settingsPath);

    expect(settings.hooks.SessionStart).toHaveLength(1);
    const [compactGroup] = settings.hooks.SessionStart;
    expect(compactGroup?.matcher).toBe("compact");
    expect(compactGroup?.hooks[0]).toMatchObject({
      type: "command",
      command: "node",
      args: [
        "${CLAUDE_PROJECT_DIR}/.arc/system/.internal/harness-hooks/common/session-start-compact.mjs",
      ],
      timeout: 30,
    });

    const output = runHookScript(compactScriptPath);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toMatchObject({
      hookEventName: "SessionStart",
    });
    expect(output.hookSpecificOutput?.additionalContext).toContain("session-recover.md");
    expect(output.hookSpecificOutput?.additionalContext).toContain("arc recover audit --json");
  });

  it("uses ARC_HOOK_ARC_COMMAND in injected recovery instructions", () => {
    const output = runHookScript(compactScriptPath, { ARC_HOOK_ARC_COMMAND: "npx arc" });

    expect(output.hookSpecificOutput?.additionalContext).toContain(
      "Recovery audit command: npx arc recover audit --json.",
    );
  });

  it("does not hook SessionStart source clear", () => {
    const settings = readJson<ClaudeCodeSettingsFragment>(settingsPath);
    const clearGroup = settings.hooks.SessionStart.find((group) => group.matcher === "clear");

    expect(clearGroup).toBeUndefined();
  });
});
