import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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
  return JSON.parse(runHookScriptRaw(path, "", env)) as HookOutput;
}

function runHookScriptRaw(path: string, input: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [path], {
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      ARC_HOOK_ARC_COMMAND: "arc",
      ARC_HOOK_STALE_BUILD_COMMAND: "",
      CLAUDE_PROJECT_DIR: packageRoot,
      ...env,
    },
  });
}

const SESSION_ID = "8775846a-ff57-4f58-ae0d-e378343ffdc9";

function hookStdin(hookEventName: string, agentId?: string): string {
  return `${JSON.stringify({
    hook_event_name: hookEventName,
    session_id: SESSION_ID,
    ...(agentId === undefined ? {} : { agent_id: agentId, agent_type: "general-purpose" }),
  })}\n`;
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
    expect(seedScript).toContain("isCodexHarness");
    expect(seedScript).not.toContain("writeSeedHandoff");
    expect(seedScript).toContain("status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("ARC_HOOK_STALE_BUILD_COMMAND");
    expect(seedScript).toContain("const hookDeadline = Date.now() + 29_000");
    expect(seedScript).toContain("timeout: remainingTimeout()");
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
    // Single boundary marker (no PENDING/COMPLETE bracket) — Claude injects immediately.
    expect(output.hookSpecificOutput?.additionalContext).toContain("=== ARC post-compaction recovery ===");
    // Recovery is mandatory even when residual context feels sufficient — compaction loss is silent.
    expect(output.hookSpecificOutput?.additionalContext).toContain("mandatory even if your context");
  });

  it("injects recovery only into the session that compacted, never into a subagent", () => {
    const primary = JSON.parse(runHookScriptRaw(compactScriptPath, hookStdin("SessionStart"))) as HookOutput;
    expect(primary.hookSpecificOutput?.additionalContext).toContain("=== ARC post-compaction recovery ===");

    expect(runHookScriptRaw(compactScriptPath, hookStdin("SessionStart", "a79117b04f216c536"))).toBe("");
  });

  it("does not seed a subagent's own compaction", () => {
    const root = mkdtempSync(join(tmpdir(), "arc-claude-hook-"));
    try {
      const invokedPath = join(root, "seed-invoked");
      const fakeArcPath = join(root, "fake-arc.mjs");
      writeFileSync(fakeArcPath, `import { writeFileSync } from "node:fs";\n`
        + `writeFileSync(${JSON.stringify(invokedPath)}, "");\n`);
      const env = {
        ARC_HOOK_ARC_COMMAND: `"${process.execPath}" "${fakeArcPath}"`,
        ARC_HOOK_HARNESS: "claude-code",
        CLAUDE_PROJECT_DIR: root,
      };

      runHookScriptRaw(seedScriptPath, hookStdin("PreCompact", "a79117b04f216c536"), env);
      expect(existsSync(invokedPath)).toBe(false);

      runHookScriptRaw(seedScriptPath, hookStdin("PreCompact"), env);
      expect(existsSync(invokedPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
