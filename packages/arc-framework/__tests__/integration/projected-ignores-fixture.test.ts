import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { writeProjectedIgnores } from "../helpers/projected-ignores.js";
import { createTempRepoCore, makeTempRoot, removeGitBackedDir } from "../helpers/temp-repo.js";
import { createRawGitExec, gitExec } from "../../src/lib/io-context.js";

async function checkoutFromTemplate(rules?: string | Buffer): Promise<string> {
  const template = await makeTempRoot("arc-git-template-");
  onTestFinished(() => removeGitBackedDir(template));
  if (rules !== undefined) {
    await mkdir(join(template, "info"));
    await writeFile(join(template, "info/exclude"), rules);
  }
  vi.stubEnv("GIT_TEMPLATE_DIR", template);
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const cwd = await createTempRepoCore();
  onTestFinished(() => removeGitBackedDir(cwd));
  return cwd;
}

it.each([
  { layout: "no info directory", rules: [] },
  { layout: "an unterminated exclude rule", rules: ["local-only.tmp"] },
])("writes separate projection rules when the Git template has $layout", async ({ rules }) => {
  const cwd = await checkoutFromTemplate(rules.length ? rules.join("\n") : undefined);
  await expect(writeProjectedIgnores(cwd, "test-user")).resolves.toBeUndefined();
  const lines = (await readFile(join(cwd, ".git/info/exclude"), "utf8")).split(/\r?\n/u);
  expect(lines).toEqual(expect.arrayContaining([...rules, ".arc/active/"]));
});

it("makes projection ignores effective when a template negates an existing projection rule", async () => {
  const rules = ".arc/active/\n!.arc/active/\n";
  const cwd = await checkoutFromTemplate(rules);

  await writeProjectedIgnores(cwd, "test-user");

  expect(await readFile(join(cwd, ".git/info/exclude"), "utf8")).toMatch(/^\.arc\/active\/\n!\.arc\/active\/\n/u);
  const { stdout } = await gitExec("git", ["check-ignore", "--no-index", "--", ".arc/active/"], { cwd });
  expect(stdout).toBe(".arc/active/");
});

it.runIf(process.platform === "linux")("preserves an existing exclude rule with non-UTF-8 bytes", async () => {
  const path = Buffer.concat([Buffer.from([0xff]), Buffer.from("-local.tmp")]);
  const rule = Buffer.concat([path, Buffer.from("\n")]);
  const cwd = await checkoutFromTemplate(rule);

  await writeProjectedIgnores(cwd, "test-user");

  const exclude = await readFile(join(cwd, ".git/info/exclude"));
  expect(exclude.subarray(0, rule.length)).toEqual(rule);
  const input = Buffer.concat([path, Buffer.from([0])]);
  const { stdout } = await createRawGitExec(cwd)(["check-ignore", "--no-index", "-z", "--stdin"], { input });
  expect(Buffer.from(stdout)).toEqual(input);
});
