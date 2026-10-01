/**
 * Regression coverage for the ARC integrity verifier.
 */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const repoRoot = join(dirname(__filename), "..", "..", "..", "..", "..");
const verifyIntegrityScript = join(
  repoRoot,
  "packages/arc-framework/arc/system/.internal/scripts/verify-integrity.sh",
);

async function write(path: string, content = "\n"): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf-8");
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await write(path, content);
  await chmod(path, 0o755);
}

async function writeMinimalArcInstall(root: string): Promise<void> {
  const arc = join(root, ".arc");
  const coreFiles = [
    "reference/briefs/AGENT-BRIEF.ARC.md",
    "reference/briefs/AGENT-BRIEF.PROJECT.md",
    "system/rules/DEV-RULES.ARC.md",
    "system/rules/DEV-RULES.PROJECT.md",
    "reference/QUICK-REFERENCE.md",
    "system/arc-config.yml",
    "reference/strategies/STRATEGY-INDEX.md",
    "system/workflows/arc/session-lifecycle/session-init.md",
    "system/workflows/arc/process-task-loop.md",
  ];
  for (const file of coreFiles) await write(join(arc, file), "# Test\n");

  await mkdir(join(arc, "reference/strategies/arc"), { recursive: true });
  await write(
    join(arc, "system/methods/example.md"),
    "---\nname: example\ndescription: Example method\noverride-active: false\n---\n",
  );
  await write(
    join(arc, "system/extensions/example.md"),
    "---\nname: example\ndescription: Example extension\nactive: false\n---\n",
  );

  await writeExecutable(
    join(arc, "system/.internal/scripts/arc-lib.sh"),
    "ARC_RED=\nARC_YELLOW=\nARC_GREEN=\nARC_NC=\narc_config_get() { echo \"$2\"; }\n",
  );
  await writeExecutable(join(arc, "system/.internal/scripts/validate-config.sh"), "echo PASS config\n");
  for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
    await writeExecutable(join(arc, "system/.internal/githooks", hook), "#!/usr/bin/env bash\nexit 0\n");
  }
}

describe("verify-integrity.sh", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir !== undefined) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("flags lifecycle metas missing the closing metadata rule", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-verify-integrity-"));
    await writeMinimalArcInstall(tmpDir);
    await write(
      join(tmpDir, ".arc/backlog/planned/foo/meta-foo.md"),
      [
        "# Metadata: Foo",
        "",
        "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
        "| --------- | --------- | ---------- | --------- | ------------ |",
        "| `Planning` | `andrew` | `[none]` | `Light` | `P1` |",
        "",
        "- **Design:** `draft-foo.md`",
        "- **Task List:** [none]",
        "",
      ].join("\n"),
    );

    await expect(execFileAsync("bash", [verifyIntegrityScript], { cwd: tmpDir })).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("closing `---`"),
    });
  });

  it("finds every core file it requires in a real installed ARC tree", async () => {
    // The repository's own .arc/ is a rendered installation, so it carries the installed file names;
    // other sections may report unrelated findings there, so only the file-structure section is asserted.
    const stdout = await execFileAsync("bash", [verifyIntegrityScript], { cwd: repoRoot }).then(
      (result) => result.stdout,
      (error: { stdout?: string }) => error.stdout ?? "",
    );
    const fileStructure = stdout.split("--- File Structure ---")[1]?.split("\n\n")[0] ?? "";

    expect(fileStructure).toContain("PASS  Process task loop: .arc/system/workflows/arc/process-task-loop.md");
    expect(fileStructure).not.toContain("ERROR");
  });

  it("reports an unexpected config-validator exit as an error", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-verify-integrity-"));
    await writeMinimalArcInstall(tmpDir);
    await writeExecutable(
      join(tmpDir, ".arc/system/.internal/scripts/validate-config.sh"),
      "echo validator crashed\nexit 127\n",
    );

    await expect(execFileAsync("bash", [verifyIntegrityScript], { cwd: tmpDir })).rejects.toMatchObject({
      code: 2,
      stdout: expect.stringContaining("ERROR Config validation exited unexpectedly with status 127"),
    });
  });
});
