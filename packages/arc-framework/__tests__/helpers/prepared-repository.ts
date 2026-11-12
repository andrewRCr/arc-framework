/** Prepared integration-repository templates and independent per-test copies. */

import { spawn } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

import { removeGitBackedDir } from "./temp-repo.js";

export type PreparedRepositoryKind = "plain" | "remote-bearing" | "worktree-bearing" | "multi-clone";

/** Self-contained support paths used by prepared repository shapes. */
export const PREPARED_REMOTE_PATH = ".arc-fixture/remote.git";
export const PREPARED_WORKTREE_PATH = ".arc-fixture/worktree";

/** Stable identity for one compatible prepared-repository shape. */
export interface PreparedRepositoryShape {
  readonly kind: PreparedRepositoryKind;
  readonly key: string;
}

/** A linked worktree in a separate sibling parent directory. */
export interface PreparedSiblingWorktreeShape {
  readonly kind: "sibling-worktree-bearing";
  readonly key: string;
  readonly worktreeName: string;
}

/** Independently writable repository and sibling worktree paths. */
export interface PreparedSiblingWorktreeCopy {
  readonly root: string;
  readonly parent: string;
  readonly worktree: string;
}

/** One built repository template that can serve compatible test copies. */
export interface PreparedRepositoryTemplate {
  readonly root: string;
  readonly shape: PreparedRepositoryShape | PreparedSiblingWorktreeShape;
  /** A multi-clone template's files, relative to its root, that name the root: remotes, links, alternates, pointers. */
  readonly rewrites?: readonly string[];
}

/**
 * Build one repository template for reuse by compatible tests.
 *
 * @param shape - Exact fixture shape served by the template.
 * @param build - Builder that creates the template repository once.
 * @returns The built template and its immutable shape identity.
 */
export async function prepareRepositoryTemplate(
  shape: PreparedRepositoryShape | PreparedSiblingWorktreeShape,
  build: () => Promise<string>,
): Promise<PreparedRepositoryTemplate> {
  const root = await build();
  if (shape.kind !== "multi-clone") return { root, shape };
  try {
    return { root, shape, rewrites: await multiCloneRewrites(root) };
  } catch (error) {
    await removeGitBackedDir(root);
    throw error;
  }
}

/**
 * Copy one prepared repository for an individual test.
 *
 * @param template - Prepared repository to copy.
 * @param shape - Exact shape requested by the test.
 * @returns Independent repository paths, including the parent for a sibling worktree shape.
 */
export function copyPreparedRepository(
  template: PreparedRepositoryTemplate,
  shape: PreparedSiblingWorktreeShape,
): Promise<PreparedSiblingWorktreeCopy>;
export function copyPreparedRepository(
  template: PreparedRepositoryTemplate,
  shape: PreparedRepositoryShape,
): Promise<string>;
export async function copyPreparedRepository(
  template: PreparedRepositoryTemplate,
  shape: PreparedRepositoryShape | PreparedSiblingWorktreeShape,
): Promise<string | PreparedSiblingWorktreeCopy> {
  if (template.shape.kind !== shape.kind || template.shape.key !== shape.key
    || (template.shape.kind === "sibling-worktree-bearing" && shape.kind === "sibling-worktree-bearing"
      && template.shape.worktreeName !== shape.worktreeName)) {
    throw new Error(
      `Prepared repository shape mismatch: template is ${template.shape.kind}/${template.shape.key}, `
      + `request is ${shape.kind}/${shape.key}`,
    );
  }
  const destination = await mkdtemp(join(tmpdir(), "arc-prepared-copy-"));
  await rm(destination, { recursive: true, force: true });
  try {
    await cp(template.root, destination, { recursive: true });
    if (shape.kind === "multi-clone") {
      const forms = await rootForms(template.root);
      for (const file of template.rewrites ?? []) await rewriteRootForms(join(destination, file), forms, destination);
    }
    if (shape.kind === "remote-bearing") {
      await rewriteRequiredPath(
        join(destination, ".git", "config"),
        template.root,
        destination,
      );
    }
    if (shape.kind === "worktree-bearing") {
      await rewriteRequiredPath(
        join(destination, PREPARED_WORKTREE_PATH, ".git"),
        template.root,
        destination,
      );
      await rewriteRequiredPath(
        join(destination, ".git", "worktrees", "worktree", "gitdir"),
        template.root,
        destination,
      );
    }
    if (shape.kind === "sibling-worktree-bearing") {
      const gitdir = (await readFile(join(template.root, ".git", "worktrees", shape.worktreeName, "gitdir"), "utf8")).trim();
      const originalWorktree = dirname(gitdir);
      const originalParent = dirname(originalWorktree);
      const parent = await mkdtemp(join(tmpdir(), "arc-prepared-sibling-"));
      try {
        await cp(originalParent, parent, { recursive: true });
        const worktree = join(parent, basename(originalWorktree));
        await rewriteRequiredPath(join(worktree, ".git"), template.root, destination);
        await rewriteRequiredPath(
          join(destination, ".git", "worktrees", shape.worktreeName, "gitdir"), originalParent, parent,
        );
        return { root: destination, parent, worktree };
      } catch (error) {
        await removeGitBackedDir(parent);
        throw error;
      }
    }
    return destination;
  } catch (error) {
    await removeGitBackedDir(destination);
    throw error;
  }
}

async function rewriteRequiredPath(file: string, from: string, to: string): Promise<void> {
  const content = await readFile(file, "utf8");
  const source = pathForms(from).find(candidate => content.includes(candidate));
  if (source === undefined) {
    throw new Error(`Prepared repository expected an absolute template reference in ${file}`);
  }
  await writeFile(file, content.replaceAll(source, to.replaceAll("\\", "/")), "utf8");
}

/** A path as Git and JSON may write it: native, with forward slashes, and with its backslashes and quotes escaped. */
function pathForms(path: string): string[] {
  return [path, path.replaceAll("\\", "/"), path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')];
}

/**
 * List the text files outside Git's object, reftable, and log storage that name a multi-clone template's root,
 * refusing a template whose reachable objects name it, since no copy can rewrite a path inside an object.
 */
async function multiCloneRewrites(root: string): Promise<string[]> {
  const needles = (await rootForms(root)).map(form => Buffer.from(form));
  const rewrites: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const current = directories.pop();
    if (current === undefined) break;
    const entries = await readdir(current, { withFileTypes: true });
    const has = (name: string, directory: boolean): boolean => entries.some(entry => entry.name === name
      && (directory ? entry.isDirectory() : entry.isFile()));
    const objects = has("HEAD", false) && has("objects", true);
    const gitDirectory = objects || has("HEAD", false) && has("commondir", false);
    if (objects && await objectsName(current, needles)) {
      throw new Error(`Prepared multi-clone template names its own path in an object of ${relative(root, current)}; build that state per test`);
    }
    const files = entries.filter(entry => !(gitDirectory && ["objects", "reftable", "logs", "index"].includes(entry.name)));
    for (const entry of files) {
      if (entry.isDirectory()) directories.push(join(current, entry.name));
      else if (entry.isFile()) await collectRewrite(root, join(current, entry.name), needles, rewrites);
    }
    if (objects) await collectRewrite(root, join(current, "objects", "info", "alternates"), needles, rewrites);
  }
  return rewrites.sort();
}

async function collectRewrite(root: string, file: string, needles: readonly Buffer[], rewrites: string[]): Promise<void> {
  const content = await readFile(file).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (content && !content.includes(0) && needles.some(needle => content.includes(needle))) rewrites.push(relative(root, file));
}

/** Every form a template's root takes in its files, its resolved path's first, longest first so none splits another. */
async function rootForms(root: string): Promise<string[]> {
  return [...new Set([...pathForms(await realpath(root)), ...pathForms(root)])].sort((left, right) => right.length - left.length);
}

async function rewriteRootForms(file: string, forms: readonly string[], to: string): Promise<void> {
  const content = await readFile(file, "utf8");
  if (!forms.some(form => content.includes(form))) throw new Error(`Prepared repository expected an absolute template reference in ${file}`);
  await writeFile(file, forms.reduce((text, form) => text.replaceAll(form, to.replaceAll("\\", "/")), content), "utf8");
}

async function objectsName(gitDirectory: string, needles: readonly Buffer[]): Promise<boolean> {
  const listed = (await gitOutput(gitDirectory, ["rev-list", "--objects", "--all"])).toString("utf8");
  const objects = listed.split("\n").filter(Boolean).map(line => line.split(" ")[0]);
  if (objects.length === 0) return false;
  const content = await gitOutput(gitDirectory, ["cat-file", "--batch"], `${objects.join("\n")}\n`);
  return needles.some(needle => content.includes(needle));
}

function gitOutput(gitDirectory: string, args: readonly string[], input?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [`--git-dir=${gitDirectory}`, ...args], { stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    const output: Buffer[] = [], errors: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(Buffer.concat(output))
      : reject(new Error(`git ${args.join(" ")} failed in ${gitDirectory}: ${Buffer.concat(errors).toString("utf8")}`)));
    // A git that exits before reading all its input reports through its exit status, not this write.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}
