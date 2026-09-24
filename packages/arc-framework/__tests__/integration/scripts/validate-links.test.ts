/**
 * Regression coverage for the staged markdown link validator.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
