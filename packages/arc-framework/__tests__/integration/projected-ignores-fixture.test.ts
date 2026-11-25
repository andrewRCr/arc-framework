import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { writeProjectedIgnores } from "../helpers/projected-ignores.js";
import { createTempRepoCore, makeTempRoot, removeGitBackedDir } from "../helpers/temp-repo.js";

it.each([
  { layout: "no info directory", rules: [] },
  { layout: "an unterminated exclude rule", rules: ["local-only.tmp"] },
])("writes separate projection rules when the Git template has $layout", async ({ rules }) => {
  const template = await makeTempRoot("arc-git-template-");
  onTestFinished(() => removeGitBackedDir(template));
  if (rules.length) {
    await mkdir(join(template, "info"));
    await writeFile(join(template, "info/exclude"), rules.join("\n"));
  }
  vi.stubEnv("GIT_TEMPLATE_DIR", template);
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const cwd = await createTempRepoCore();
  onTestFinished(() => removeGitBackedDir(cwd));

  await expect(writeProjectedIgnores(cwd, "test-user")).resolves.toBeUndefined();
  const lines = (await readFile(join(cwd, ".git/info/exclude"), "utf8")).split(/\r?\n/u);
  expect(lines).toEqual(expect.arrayContaining([...rules, ".arc/active/"]));
});
