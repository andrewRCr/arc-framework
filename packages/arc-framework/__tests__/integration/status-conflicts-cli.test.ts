/** The registered conflict mode reports the pre-cutover Git route. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runHandlerAt } from "../helpers/handler.js";

it.each([false, true])("refuses the registered conflict mode before the capability flips (json=%s)", async json => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  const result = await runHandlerAt(cwd, () => dispatchRegisteredCli(["--no-input", "status", "--conflicts", ...(json ? ["--json"] : [])]));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/Error \[unsupported\]: .*git status/u);
  if (json) expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining("git status") } } });
  else expect(result.stdout).toBe("");
}, 30_000);
