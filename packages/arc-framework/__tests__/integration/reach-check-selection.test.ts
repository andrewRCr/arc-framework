/** How the store check reads its change: base and tree, deletions, its own check entry, and the ask. */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { readReachDeclaration, selectReachCheck } from "../../src/lib/reach-check.js";
import type { ReachDeclaration } from "../../src/lib/vitest-reach.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const checkoutRoot = resolve(packageRoot, "../..");
const declarationPath = "packages/arc-framework/__tests__/reach/store-suites.json";
const checks = ".arc/system/arc-checks.yml";

let declaration: ReachDeclaration;
beforeAll(async () => { declaration = await readReachDeclaration(join(checkoutRoot, declarationPath)); });

type Revision = string | { failure: string };

function select(changed: readonly string[], options: { env?: NodeJS.ProcessEnv; base?: Revision; tree?: Revision } = {}) {
  const shown = (revision: Revision | undefined) => typeof revision === "object"
    ? { failure: { exitCode: 128, stderr: revision.failure } } : { stdout: revision ?? "", stderr: "" };
  const git = scriptGitExec([
    { match: { prefix: ["diff", "--name-only"] }, responses: [{ stdout: changed.map(path => `${path}\0`).join(""), stderr: "" }] },
    { match: ["show", `base:${checks}`], responses: [shown(options.base)] },
    { match: ["show", `tree:${checks}`], responses: [shown(options.tree)] },
  ]);
  const env = options.env ?? { ARC_CHECK_BASE: "base", ARC_CHECK_TREE: "tree" };
  return { calls: git.calls, run: () => selectReachCheck(declaration, { checkoutRoot, declarationPath, env, git: git.exec }) };
}

const entry = (gate: string, other = "push") => `checks:\n  test:store:\n    gate: ${gate}\n  lint:md:\n    gate: ${other}\n`;

it("reads the change from its base to its tree with deletions and without rename pairing", async () => {
  const { calls, run } = select(["docs/notes.md"]);
  expect(await run()).toMatchObject({ form: "reach", suites: [] });
  expect(calls[0]?.args).toEqual(["diff", "--name-only", "--no-renames", "-z", "--end-of-options", "base", "tree", "--"]);
});

it("reaches suites through a path the change deleted", async () => {
  const deleted = "packages/arc-framework/arc/system/removed-by-the-change.md";
  const selection = await select([deleted]).run();
  expect(selection.form).toBe("reach");
  expect(selection.suites.length).toBeGreaterThan(0);
  expect(selection.reachedBy).toEqual([deleted]);
});

it("runs every suite in full when the change edits the check's own entry", async () => {
  const selection = await select([checks], { base: entry("merge"), tree: entry("push") }).run();
  expect(selection).toMatchObject({ form: "full", suites: expect.arrayContaining([expect.stringContaining("store-ref-")]) });
});

it("stays in reach form when the check declaration changes only another check's entry", async () => {
  expect(await select([checks], { base: entry("merge", "push"), tree: entry("merge", "commit") }).run())
    .toMatchObject({ form: "reach", suites: [] });
});

it("runs in full when the check's entry cannot be read at the base", async () => {
  expect(await select([checks], { base: { failure: `fatal: path '${checks}' does not exist in 'base'\n` }, tree: entry("merge") }).run())
    .toMatchObject({ form: "full" });
});

it("compares the check's entry with the working tree when the change names no tree", async () => {
  const current = await readFile(join(checkoutRoot, checks), "utf8");
  expect(await select([checks], { env: { ARC_CHECK_BASE: "base" }, base: current }).run()).toMatchObject({ form: "reach" });
  expect(await select([checks], { env: { ARC_CHECK_BASE: "base" }, base: entry("commit") }).run()).toMatchObject({ form: "full" });
});

it.each(["full", "every"])("takes the asked %s form over a change reaching nothing", async (ask) => {
  expect(await select(["docs/notes.md"], { env: { ARC_CHECK_BASE: "base", ARC_CHECK_TREE: "tree", ARC_STORE_CHECK: ask } }).run())
    .toMatchObject({ form: ask });
});

it("refuses an ask it does not know", async () => {
  await expect(select(["docs/notes.md"], { env: { ARC_CHECK_BASE: "base", ARC_STORE_CHECK: "most" } }).run())
    .rejects.toThrow(/unknown ask "most"/u);
});
