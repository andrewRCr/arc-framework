/** Real declared Markdown processes report findings on every admitted projected file. */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { load } from "js-yaml";
import { execa } from "execa";
import { afterEach, expect, it, vi } from "vitest";
import { handleCheckIncrement } from "../../src/commands/check.js";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { matchPathList } from "../../src/lib/checks/path-list.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { runHandlerAt } from "../helpers/handler.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { copyLiveTree } from "../helpers/copy-live-tree.js";

const repository = resolve(import.meta.dirname, "../../../..");
const markdownSelectionIds = ["lint:md:selection", "lint:md:underwrap:selection", "lint:arc:links:selection"] as const;

/** Write a literal repository-relative file, creating its parents. */
async function writeMarkdownFixture(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

/** Copy live scripts, rules, and declarations; projected roots use per-clone Git excludes. */
async function createMarkdownToolRepository(): Promise<string> {
  const root = await createTempRepoCore({ prefix: "arc-markdown-tools-" });
  for (const path of ["package.json", "package-lock.json", "packages/arc-framework/package.json", ".markdownlint-cli2.jsonc"]) {
    await writeMarkdownFixture(root, path, await readFile(join(repository, path), "utf8"));
  }
  for (const path of ["src/lib", "src/scripts"]) {
    await copyLiveTree(join(repository, "packages/arc-framework", path), join(root, "packages/arc-framework", path));
  }
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "junction");
  await symlink(join(repository, "packages/arc-framework/node_modules"), join(root, "packages/arc-framework/node_modules"), "junction");
  await writeMarkdownFixture(root, ".gitignore", "node_modules/\n.arc-check-forecast.json\n");
  await writeMarkdownFixture(root, ".git/info/exclude", ".arc/active/\n.arc/user/\n.arc/completed/\n");
  const declaration = CheckDeclarationSchema.parse(load(await readFile(join(repository, ".arc/system/arc-checks.yml"), "utf8")));
  const checks = Object.fromEntries(markdownSelectionIds.map(id => {
    const check = declaration.checks[id];
    if (check === undefined) throw new Error(`Missing Markdown feedback declaration: ${id}`);
    return [id, { command: check.command, mode: check.mode, inputs: check.inputs }];
  }));
  await writeMarkdownFixture(root, ".arc/system/arc-checks.yml", JSON.stringify({ checks }));
  await writeMarkdownFixture(root, "README.md", "# Markdown tools\n");
  await execa("git", ["add", "--all"], { cwd: root });
  await execa("git", ["commit", "-qm", "Markdown tool fixture"], { cwd: root });
  return root;
}

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await removeGitBackedDirs(roots.splice(0)); });
const context = makeInteractionContext({ noInput: true, machineReadable: true });
const changed = [
  ".arc/active/current/notes-unit.md", ".arc/active/current/deep/[probe].md",
  ".arc/active/current/#hash space.md", ".arc/active/current/.venv-probe.md",
  ...(process.platform === "win32" ? [] : [".arc/active/current/literal*.md", ".arc/active/current/space:colon.md"]),
  ".arc/active/current/.venv-test/probe.md", ".arc/active/current/node_modules/probe.md",
  ".arc/active/current/venv/probe.md", ".arc/active/current/NODE_MODULES/probe.md",
  ".arc/active/current/.VENV-probe.md", ".arc/active/current/.hidden/temp-probe.md",
  ".arc/user/alice/WORKING-MEMORY.md", ".arc/user/alice/USER-INBOX.md",
  ".arc/user/alice/nested/WORKING-MEMORY.md", ".arc/user/alice/nested/USER-INBOX.md",
  ".arc/user/alice/nested/working-memory.md", ".arc/active/current/probe.template.md",
  ".arc/active/current/template-probe.md",
];
const unchanged = ".arc/active/current/unchanged.md";
const outside = [unchanged, ".arc/completed/notes-old.md", ".arc/active/current/protected.md",
  ".arc/active/current/conflict.md", ".arc/user/alice/.internal/secret.md", ".arc/user/alice/scratch/scratch.md"];
const findings = "# Fixture\n\nShort first line.\nThe next word fits.\n\n[Missing](/missing-target.md)\n\n\n";

it("reports every admitted changed finding and never reads the rest of the supplier's corpus", async () => {
  vi.stubEnv("FORCE_COLOR", undefined);
  const root = await createMarkdownToolRepository();
  roots.push(root);
  for (const path of [...changed, ...outside]) await writeMarkdownFixture(root, path, findings);
  await writeMarkdownFixture(root, ".arc/active/current/conflict.md", `<<<<<<< ours\n${findings}=======\nother\n>>>>>>> theirs\n`);
  const definition = CheckDeclarationSchema.parse(JSON.parse(await readFile(join(root, ".arc/system/arc-checks.yml"), "utf8")));
  const result = await runHandlerAt(root, () => handleCheckIncrement({ json: true }, context,
    { readProjectedSelection: async (_root, options) => ({ status: "ok", paths: options.changed ? changed : [...changed, unchanged] }) }));
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  const checks = JSON.parse(result.stdout).result.checks;
  for (const id of markdownSelectionIds) {
    const check = checks.find((entry: { id: string }) => entry.id === id);
    expect(check, id).toMatchObject({ kind: "feedback", outcome: "failed" });
    const declaration = definition.checks[id];
    if (declaration === undefined) throw new Error(`Missing declaration: ${id}`);
    const admitted = await matchPathList({ git: createRawGitExec(root) }, root, changed, declaration.inputs);
    if (admitted.status !== "ok") throw new Error(admitted.reason);
    for (const path of admitted.paths) expect(check.output, `${id}: ${path}`).toContain(`${path}:`);
    for (const path of [...changed.filter(path => !admitted.paths.includes(path)), ...outside]) {
      expect(check.output, `${id}: excluded ${path}`).not.toContain(`${path}:`);
    }
    expect(check.output).toContain(id === "lint:md:selection" ? "MD012"
      : id === "lint:md:underwrap:selection" ? "ARC001" : "missing-target.md");
  }
}, 60_000);
