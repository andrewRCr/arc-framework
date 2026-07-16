/**
 * Unit coverage for arc-config shell validation.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..", "..");
const scriptPath = join(repoRoot, "packages/arc-framework/arc/system/.internal/scripts/validate-config.sh");

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runValidateConfig(content: string): Promise<ScriptResult> {
  const root = await mkdtemp(join(tmpdir(), "arc-validate-config-"));
  const configPath = join(root, "arc-config.yml");
  await writeFile(configPath, content);
  try {
    return await new Promise<ScriptResult>((resolve) => {
      execFile(
        "bash",
        [scriptPath],
        {
          cwd: repoRoot,
          env: { ...process.env, ARC_CONFIG_FILE: configPath },
        },
        (error, stdout, stderr) => {
          const code = typeof error?.code === "number" ? error.code : 0;
          resolve({ code, stdout, stderr });
        },
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("validate-config.sh — user.notes_push", () => {
  it.each(["manual", "prompt", "on-sync"])("accepts %s", async (value) => {
    const result = await runValidateConfig(`user.notes_push: ${value}\n`);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`PASS  user.notes_push: ${value}`);
  });

  it("rejects the legacy user.sync_push key as unknown", async () => {
    const result = await runValidateConfig("user.sync_push: prompt\n");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("WARN  Unknown key: 'user.sync_push'");
  });

  it("rejects the legacy always value for user.notes_push", async () => {
    const result = await runValidateConfig("user.notes_push: always\n");

    expect(result.code).toBe(2);
    expect(result.stdout).toContain("ERROR user.notes_push: 'always' is not valid");
    expect(result.stdout).toContain("manual prompt on-sync");
  });
});

describe("validate-config.sh — session.init_load.notes", () => {
  it.each(["manual", "prompt", "always"])("accepts %s", async (value) => {
    const result = await runValidateConfig(`session.init_load.notes: ${value}\n`);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`PASS  session.init_load.notes: ${value}`);
  });

  it("rejects unknown values with the valid-set message", async () => {
    const result = await runValidateConfig("session.init_load.notes: bogus\n");
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("ERROR session.init_load.notes: 'bogus' is not valid");
    expect(result.stdout).toContain("manual prompt always");
  });

  it("recognizes the key as known (no Unknown-key warning)", async () => {
    const result = await runValidateConfig("session.init_load.notes: prompt\n");
    expect(result.stdout).not.toContain("Unknown key: 'session.init_load.notes'");
  });
});

describe("validate-config.sh — worktree provisioning keys", () => {
  it("recognizes post-create and harness-dir settings as known", async () => {
    const result = await runValidateConfig("worktree.post_create: npm install\nworktree.harness_dirs: .codex\n");

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Unknown key: 'worktree.post_create'");
    expect(result.stdout).not.toContain("Unknown key: 'worktree.harness_dirs'");
  });
});

describe("validate-config.sh — commit-message numeric domains", () => {
  it.each([
    ["hooks.subject_max_length", "10"],
    ["hooks.subject_max_length", "9007199254740991"],
    ["hooks.body_max_lines", "1"],
    ["hooks.body_max_lines", "9007199254740991"],
    ["hooks.body_max_line_length", "1"],
    ["hooks.body_max_line_length", "9007199254740991"],
  ])("accepts %s boundary %s", async (key, value) => {
    const result = await runValidateConfig(`${key}: ${value}\n`);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`PASS  ${key}: ${value}`);
  });

  it.each([
    ["hooks.subject_max_length", "9"],
    ["hooks.subject_max_length", "+10"],
    ["hooks.subject_max_length", "0x10"],
    ["hooks.subject_max_length", "9007199254740992"],
    ["hooks.body_max_lines", "0"],
    ["hooks.body_max_line_length", "-1"],
  ])("rejects out-of-domain %s value %s", async (key, value) => {
    const result = await runValidateConfig(`${key}: ${value}\n`);

    expect(result.code).toBe(2);
    expect(result.stdout).toContain(`ERROR ${key}: '${value}'`);
  });

  it("checks custom-pattern presence without compiling a second regex dialect", async () => {
    const result = await runValidateConfig("commit.format: custom\ncommit.custom_pattern: '[.'\n");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("PASS  commit.custom_pattern is set for custom format");
  });
});
