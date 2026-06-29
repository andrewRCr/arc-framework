import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Recipe } from "../../../src/lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");
const hookRoot = resolve(packageRoot, "arc/system/.internal/harness-hooks");
const hooksPath = resolve(hookRoot, "codex-cli/hooks.json");
const featuresPath = resolve(hookRoot, "codex-cli/features.config.toml");
const seedScriptPath = resolve(hookRoot, "common/pre-compact-seed.mjs");
const compactScriptPath = resolve(hookRoot, "common/session-start-compact.mjs");

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
    SessionStart: MatcherGroup[];
    PostCompact?: MatcherGroup[];
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

function runHookScript(path: string): HookOutput {
  return JSON.parse(execFileSync(process.execPath, [path], { encoding: "utf8" })) as HookOutput;
}

describe("Codex CLI compaction recovery hook recipe", () => {
  it("ships hooks.json, an opt-in feature fragment, and shared hook scripts", () => {
    const recipe = readJson<Recipe>(resolve(packageRoot, "init-recipe.json"));

    expect(recipe.include_files).toEqual(expect.arrayContaining([
      "system/.internal/harness-hooks/codex-cli/features.config.toml",
      "system/.internal/harness-hooks/codex-cli/hooks.json",
      "system/.internal/harness-hooks/common/pre-compact-seed.mjs",
      "system/.internal/harness-hooks/common/session-start-compact.mjs",
    ]));
    expect(existsSync(hooksPath)).toBe(true);
    expect(existsSync(featuresPath)).toBe(true);
    expect(existsSync(seedScriptPath)).toBe(true);
    expect(existsSync(compactScriptPath)).toBe(true);
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
    expect(hook.command).toContain("git rev-parse --show-toplevel");
    expect(hook.command).toContain(".arc/system/.internal/harness-hooks/common/pre-compact-seed.mjs");
    expect(hook.commandWindows).toContain("git rev-parse --show-toplevel");
    expect(hook.commandWindows).toContain(".arc\\system\\.internal\\harness-hooks\\common\\pre-compact-seed.mjs");

    const seedScript = readFileSync(seedScriptPath, "utf8");
    expect(seedScript).toContain("arc status --session-init --write-compaction-seed --json");
    expect(seedScript).toContain("stdio: \"ignore\"");
    expect(seedScript).toContain("process.exit(0)");
  });

  it("injects session-recover only for SessionStart source compact", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);
    const sessionMatchers = new Map(
      fragment.hooks.SessionStart.map((group) => [group.matcher, group]),
    );

    expect([...sessionMatchers.keys()]).toEqual(["compact"]);
    expect(fragment.hooks.PostCompact).toBeUndefined();

    const compactHook = sessionMatchers.get("compact")?.hooks[0];
    expect(compactHook).toMatchObject({
      type: "command",
      timeout: 30,
      statusMessage: "Restoring ARC recovery context",
    });
    expect(compactHook?.command).toContain(".arc/system/.internal/harness-hooks/common/session-start-compact.mjs");
    expect(compactHook?.commandWindows).toContain(
      ".arc\\system\\.internal\\harness-hooks\\common\\session-start-compact.mjs",
    );

    const output = runHookScript(compactScriptPath);
    expect(output.suppressOutput).toBe(true);
    expect(output.hookSpecificOutput).toMatchObject({
      hookEventName: "SessionStart",
    });
    expect(output.hookSpecificOutput?.additionalContext).toContain("session-recover.md");
    expect(output.hookSpecificOutput?.additionalContext).toContain("arc recover audit --json");
  });

  it("does not hook SessionStart source clear", () => {
    const fragment = readJson<CodexHooksFragment>(hooksPath);
    const clearGroup = fragment.hooks.SessionStart.find((group) => group.matcher === "clear");

    expect(clearGroup).toBeUndefined();
  });
});
