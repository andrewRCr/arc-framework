/**
 * Process-level coverage for the ROADMAP conflict remedy entry point.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = join(testDir, "..", "..", "..");
const scriptPath = join(packageRoot, "src", "scripts", "remedy-roadmap-conflict.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));

describe("ROADMAP conflict remedy script", () => {
  it("reports unexpected Git failures without an unhandled rejection", () => {
    const cwd = mkdtempSync(join(tmpdir(), "arc-roadmap-remedy-"));
    try {
      const result = spawnSync(process.execPath, [tsxCliPath, scriptPath], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^ROADMAP conflict auto-remedy failed:/u);
      expect(result.stderr).not.toContain("node:internal/process/promises");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
