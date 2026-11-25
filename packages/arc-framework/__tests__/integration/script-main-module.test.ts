/** A real audit entry runs through a linked source directory rather than silently exiting successfully. */
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execa } from "execa";
import { expect, it, onTestFinished } from "vitest";
import { cleanupTempDir, commitAll, createTempRepo } from "../helpers/integration.js";

it("runs the table audit when its script is reached through a linked directory", async () => {
  const root = await createTempRepo(), links = await mkdtemp(join(tmpdir(), "arc-linked-script-"));
  onTestFinished(async () => { await cleanupTempDir(root); await rm(links, { recursive: true, force: true }); });
  await writeFile(join(root, "fixture.md"), "# Fixture\n");
  await commitAll(root);
  const linked = join(links, "scripts");
  await symlink(resolve(import.meta.dirname, "../../src/scripts"), linked, "junction");
  const result = await execa(process.execPath, ["--import", import.meta.resolve("tsx"), join(linked, "audit-tables.ts"), "fixture.md"], {
    cwd: root, reject: false, env: { FORCE_COLOR: undefined, NO_COLOR: "1" },
  });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/baseline [a-f0-9]{40}/u);
  expect(result.stdout).toContain("unchanged fixture.md");
}, 15_000);
