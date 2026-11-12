/** The production Commander tree enters projection even when its backend is dark. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

it("runs the registered dark hooks around a command without mixing projection output into JSON", async () => {
  const directories: string[] = [];
  const h = await createEngineFixture(directories);
  const nested = join(h.checkout, "nested");
  await mkdir(nested);
  const cwd = process.cwd();
  const exit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  try {
    process.chdir(nested);
    process.exitCode = undefined;
    beginProjectionCommand();
    await dispatchRegisteredCli(["config", "status", "--json"]);
    expect(JSON.parse(stdout)).toMatchObject({ mode: "full" });
    expect(projectionProcessState()).toMatchObject({ start: { kind: "disabled" } });
    expect(stderr).not.toContain("projection:");
    expect(process.exitCode).toBeUndefined();
  } finally {
    out.mockRestore(); err.mockRestore();
    process.chdir(cwd); process.exitCode = exit;
    await removeGitBackedDirs(directories);
  }
});
