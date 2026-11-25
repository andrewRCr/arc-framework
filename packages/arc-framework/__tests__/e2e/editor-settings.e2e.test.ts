/** The installed CLI leaves editor opt-in dark before state moves off the branch. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

it.each(["vscode", "zed"])("refuses unsupported %s setup and removal before inspecting settings", async editor => {
  const cwd = await createTempRepo("arc-editor-");
  try {
    const folder = editor === "vscode" ? ".vscode" : ".zed";
    await mkdir(join(cwd, folder));
    const path = join(cwd, folder, "settings.json"), content = "unparseable user content\n";
    await writeFile(path, content);
    for (const args of [[editor], [editor, "--remove"]]) {
      const result = await runArc(["editor", ...args], cwd);
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.stderr).toContain("unsupported");
      expect(await readFile(path, "utf8")).toBe(content);
    }
    expect((await runArc(["--help"], cwd)).stdout).toMatch(/^\s+editor\s+/mu);
    expect((await runArc(["editor", "--help"], cwd)).stdout).toContain("--remove");
  } finally { await cleanupTempDir(cwd); }
});

it.each(["init", "join"])("keeps Zed user guidance absent from legacy %s", async command => {
  const cwd = await createTempRepo("arc-editor-setup-");
  try {
    if (command === "join") {
      await mkdir(join(cwd, ".arc/system"), { recursive: true });
      await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
    }
    const args = command === "init" ? ["init", "--name", "Example", "--tools", "", "--pm-mode", "none", "--identity", "alice"]
      : ["join", "--tools", "", "--identity", "alice"];
    const result = await runArc(["--no-input", ...args], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).not.toContain("file_scan_inclusions");
    await expect(access(join(cwd, ".zed/settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await cleanupTempDir(cwd); }
}, 30_000);
