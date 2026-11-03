/** Personal state stays out of npm packages even when root package policy overrides Git ignores. */
import { link, lstat, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { execa } from "execa";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createExecaGitExecInput } from "../../../../src/lib/git/process-executor.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { guardProjectionIgnores } from "../../../../src/lib/store/projection/ignore-guard.js";
import { writeArcIgnoreBlocks } from "../../../../src/lib/template/index.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });
async function fixture() {
  const cwd = await createTempRepoCore({ prefix: "arc-personal-npm-" });
  directories.push(cwd);
  await mkdir(join(cwd, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(cwd, ".arc/user/andrew/private.txt"), "private sentinel\n");
  await writeFile(join(cwd, "public.txt"), "public control\n");
  await writeFile(join(cwd, ".git/info/exclude"), ".arc/active/\n.arc/backlog/\n.arc/completed/\n.arc/system/.local/\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/user/*/\n");
  const guard = () => guardProjectionIgnores({ root: cwd, identity: SlugSchema.parse("andrew"),
    exec: createExecaGitExecInput(), fs: { lstat, realpath, readFile: (path) => readFile(path, "utf8") } });
  const setup = () => writeArcIgnoreBlocks(cwd, [], (path) => readFile(path, "utf8"), (path, text) => writeFile(path, text));
  return { cwd, guard, setup };
}
it("refuses a missing npm proof despite passing Git rules and accepts repair", async () => {
  const h = await fixture();
  expect(await h.guard()).toMatchObject({ kind: "refused" });
  await h.setup();
  expect(await h.guard()).toMatchObject({ kind: "passed" });
});
it.each([
  { name: "root npmignore", npmignore: true, files: undefined, child: false, entry: undefined },
  { name: "broad inclusion", npmignore: true, files: [".arc", "public.txt"], child: false, entry: undefined },
  { name: "direct private file", npmignore: false, files: [".arc/user/andrew/private.txt", "public.txt"], child: false, entry: undefined },
  { name: "private glob", npmignore: false, files: [".arc/user/**/*", "public.txt"], child: false, entry: undefined },
  { name: "recursive inclusion", npmignore: false, files: ["**/*"], child: false, entry: undefined },
  { name: "child negation", npmignore: true, files: [".arc/**", "public.txt"], child: true, entry: undefined },
  { name: "main", npmignore: true, files: ["public.txt"], child: true, entry: "main" },
  { name: "bin", npmignore: true, files: ["public.txt"], child: true, entry: "bin" },
])("keeps personal state out of npm under $name after managed setup", async (variant) => {
  const h = await fixture();
  await writeFile(join(h.cwd, "package.json"), JSON.stringify({ name: "arc-private-fixture", version: "1.0.0",
    files: variant.files, ...(variant.entry === undefined ? {} : { [variant.entry]: ".arc/user/andrew/private.txt" }) }));
  if (variant.npmignore) await writeFile(join(h.cwd, ".npmignore"), "dist/\n");
  if (variant.child) await writeFile(join(h.cwd, ".arc/user/andrew/.npmignore"), "!private.txt\n");
  await h.setup();
  expect(await h.guard()).toMatchObject({ kind: "passed" });
  const result = await execa("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: h.cwd, env: { npm_config_cache: join(h.cwd, "npm-cache") },
  });
  const files = (JSON.parse(result.stdout) as { files: { path: string }[] }[]).flatMap((pack) => pack.files.map((file) => file.path));
  expect(files).toContain("public.txt");
  expect(files.some((path) => path.startsWith(".arc/user/"))).toBe(false);
}, 30_000);

it.each(["", "# only a comment\n", "*\n!private.txt\n", "**\n", "* \n"])("refuses conflicting policy %j without changing ignore files and allows repair", async (contents) => {
  const h = await fixture();
  const policy = join(h.cwd, ".arc/user/.npmignore");
  await writeFile(policy, contents);
  await writeFile(join(h.cwd, ".ignore"), "# own search rules\n");
  await expect(h.setup()).rejects.toMatchObject({ code: "ignore.npm-policy-conflict" });
  expect(await readFile(policy, "utf8")).toBe(contents);
  expect(await readFile(join(h.cwd, ".gitignore"), "utf8")).toBe(".arc/user/*/\n");
  expect(await readFile(join(h.cwd, ".ignore"), "utf8")).toBe("# own search rules\n");
  expect(await h.guard()).toMatchObject({ kind: "refused" });
  const accepted = "# kept byte for byte\r\n\r\n*\r\n";
  await writeFile(policy, accepted);
  await h.setup();
  expect(await readFile(policy, "utf8")).toBe(accepted);
  expect(await h.guard()).toMatchObject({ kind: "passed" });
});
it.each(["link", "directory", "hardlink"])("refuses a %s npm policy and allows repaired retry", async (shape) => {
  const h = await fixture();
  const path = join(h.cwd, ".arc/user/.npmignore");
  const target = join(h.cwd, "policy-target");
  await writeFile(target, "*\n");
  if (shape === "link") await symlink(target, path);
  else if (shape === "hardlink") await link(target, path);
  else await mkdir(path);
  await expect(h.setup()).rejects.toMatchObject({ code: "ignore.unsafe-output" });
  if (shape !== "hardlink") expect(await h.guard()).toMatchObject({ kind: "refused" });
  expect(await readFile(target, "utf8")).toBe("*\n");
  await rm(path, { recursive: true });
  await h.setup();
  expect(await h.guard()).toMatchObject({ kind: "passed" });
});
