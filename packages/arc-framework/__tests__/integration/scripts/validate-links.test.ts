/**
 * Regression coverage for the staged markdown link validator.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, it, expect, afterEach } from "vitest";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..", "..");
const validateLinksScript = join(
  repoRoot,
  "packages/arc-framework/arc/system/.internal/scripts/validate-links.sh",
);

describe("validate-links.sh", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir !== undefined) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("matches reference definitions case-insensitively", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "arc-validate-links-"));
    const targetPath = join(tmpDir, "target.md");
    const sourcePath = join(tmpDir, "source.md");

    await writeFile(targetPath, "# Target\n", "utf-8");
    await writeFile(sourcePath, "[Example][Foo]\n\n[foo]: ./target.md\n", "utf-8");

    await expect(execFileAsync("bash", [validateLinksScript, sourcePath])).resolves.toMatchObject({
      stderr: "",
    });
  });

  it("ships the same executable target rules as the installed validator", async () => {
    const installed = join(repoRoot, ".arc/system/.internal/scripts/validate-links.sh");
    expect(await readFile(validateLinksScript, "utf8")).toBe(await readFile(installed, "utf8"));
    expect((await stat(validateLinksScript)).mode & 0o111).not.toBe(0);
    expect((await stat(installed)).mode & 0o111).not.toBe(0);
    tmpDir = await mkdtemp(join(tmpdir(), "arc-validate-targets-"));
    await execFileAsync("git", ["init", "-q"], { cwd: tmpDir });
    await mkdir(join(tmpDir, ".arc/active"), { recursive: true });
    await mkdir(join(tmpDir, ".arc/user/alice"), { recursive: true });
    await writeFile(join(tmpDir, ".gitignore"), ".arc/user/*\n");
    await writeFile(join(tmpDir, ".arc/active/meta-example.md"), "# Target\n");
    await writeFile(join(tmpDir, ".arc/user/alice/private.md"), "# Private\n");
    const source = join(tmpDir, "README.md");
    await writeFile(source, "[movable](/.arc/active/meta-example.md)\n[ignored](.arc/user/alice/private.md)\n");
    await expect(execFileAsync("bash", [validateLinksScript, source], { cwd: tmpDir })).rejects.toMatchObject({
      code: 1, stderr: expect.stringContaining("link to movable artifact"),
    });
    await writeFile(join(tmpDir, "guide.md"), "# Guide\n");
    await writeFile(source, "[guide](/guide.md)\n");
    await expect(execFileAsync("bash", [validateLinksScript, source], { cwd: tmpDir })).resolves.toMatchObject({ stderr: "" });
  });
});
