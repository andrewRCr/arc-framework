/**
 * Update command E2E tests.
 *
 * Exercises `arc update` for clean updates (no changes), customization
 * preservation through three-way merge, and conflict detection when
 * adopter and framework changes overlap.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("update", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("clean update with no changes exits 0 and reports no changes", async () => {
    // Init, then immediately update — same templates, no modifications
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);

    const update = await runArc(["update"], tmpDir);

    expect(update.exitCode).toBe(0);
    const output = update.stdout + update.stderr;
    expect(output).toContain("unchanged");
  });

  it("customization preserved: adopter changes survive update", async () => {
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);

    // Modify a Configurable file — DEV-RULES.PROJECT.md
    const rulesPath = join(tmpDir, ".arc", "reference", "constitution", "DEV-RULES.PROJECT.md");
    const original = await readFile(rulesPath, "utf-8");
    const customized = original + "\n## My Custom Section\n\nProject-specific rules here.\n";
    await writeFile(rulesPath, customized, "utf-8");

    // Update — same template version, so no framework-side changes
    const update = await runArc(["update"], tmpDir);
    expect(update.exitCode).toBe(0);

    // Adopter customization preserved
    const afterUpdate = await readFile(rulesPath, "utf-8");
    expect(afterUpdate).toContain("## My Custom Section");
    expect(afterUpdate).toContain("Project-specific rules here.");
  });

  it("conflict handling: overlapping changes produce conflict markers", async () => {
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);

    // Pick a Framework file and modify it
    const filePath = join(tmpDir, ".arc", "README.md");
    const pristinePath = join(tmpDir, ".arc", ".pristine", "README.md");

    // Read current content
    const original = await readFile(filePath, "utf-8");
    const lines = original.split("\n");

    // Modify the installed file (adopter's version) — change the first line
    lines[0] = "# My Customized ARC";
    await writeFile(filePath, lines.join("\n"), "utf-8");

    // Modify the pristine (simulate old template version) so the three-way
    // merge sees the current template as a "new" change at the same location
    await writeFile(pristinePath, "# Old ARC Title\n" + lines.slice(1).join("\n"), "utf-8");

    // Now update: base (pristine) = "# Old ARC Title", current = "# My Customized ARC",
    // updated (template) = "# .arc — ARC Framework" — all three differ on line 1 → conflict
    const update = await runArc(["update"], tmpDir);

    expect(update.exitCode).toBe(0);
    const output = update.stdout + update.stderr;
    expect(output.toLowerCase()).toContain("conflict");

    // File should contain conflict markers
    const afterUpdate = await readFile(filePath, "utf-8");
    expect(afterUpdate).toContain("<<<<<<<");
    expect(afterUpdate).toContain(">>>>>>>");
  });
});
