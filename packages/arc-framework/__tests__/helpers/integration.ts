/**
 * Shared helpers for integration tests.
 *
 * Provides temp git repo setup, real I/O context construction, and
 * a full `arc init` runner for tests that need a working installation.
 */

import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  access,
  chmod,
  readdir,
  stat,
} from "node:fs/promises";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { runInit } from "../../src/commands/init.js";
import type { IOContext } from "../../src/commands/init.js";
import type { GitExec } from "../../src/lib/git/index.js";
import type { GitExecInput } from "../../src/lib/errand/index.js";
import type { Recipe, Manifest, FileEntry, Classification, Layer } from "../../src/lib/types.js";
import type { InitPromptResult } from "../../src/prompts/init-prompts.js";
import { getArcTemplatePath, getInternalTemplatePath } from "../../src/lib/paths.js";
import { MANIFEST_SCHEMA_VERSION } from "../../src/lib/constants.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
} from "../../src/lib/user-sync/compaction-manifest.js";
import { createTempRepoCore, removeGitBackedDir } from "./temp-repo.js";

const execFileAsync = promisify(execFile);

/** Create a real GitExec bound to a specific cwd. */
export function makeGitExec(cwd: string): GitExec {
  return async (cmd, args, options) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd, ...options });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/**
 * Create a real stdin-fed git executor bound to a cwd — the {@link GitExecInput}
 * counterpart to {@link makeGitExec}, for plumbing (`hash-object --stdin`,
 * `mktree`) that reads its payload from stdin.
 */
export function makeGitExecInput(cwd: string): GitExecInput {
  return (args, input) =>
    new Promise((resolve, reject) => {
      const proc = spawn("git", args, { cwd });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(" ")} failed (code ${code}): ${stderr}`));
      });
      proc.on("error", reject);
      proc.stdin.write(input);
      proc.stdin.end();
    });
}

/** One entry in a synthetic notes tree. */
export interface NotesTreeCommitEntry {
  /** Annotated commit represented by the entry. */
  commit: string;
  /** Note blob content. */
  content: string;
  /** Optional raw tree path for fanout and malformed-path fixtures. */
  path?: string;
}

/** Options for a synthetic notes-tree commit. */
export interface NotesTreeCommitOptions {
  /** Optional compaction manifest tree entry. */
  manifest?: NotesCompactionManifest | null;
  /** Commit subject. */
  message?: string;
  /** Parent notes-history commits, in order. */
  parents?: string[];
}

interface FixtureTreeNode {
  children: Map<string, FixtureTreeNode>;
  files: Map<string, string>;
}

function fixtureTreeNode(): FixtureTreeNode {
  return { children: new Map(), files: new Map() };
}

async function writeFixtureTree(execInput: GitExecInput, node: FixtureTreeNode): Promise<string> {
  const rows = [...node.files.entries()].map(([name, blob]) => ({ name, row: `100644 blob ${blob}\t${name}` }));
  for (const [name, child] of node.children) {
    const tree = await writeFixtureTree(execInput, child);
    rows.push({ name, row: `040000 tree ${tree}\t${name}` });
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  const input = rows.length === 0 ? "" : `${rows.map(({ row }) => row).join("\n")}\n`;
  return (await execInput(["mktree"], input)).trim();
}

/** Build a notes-tree commit from real blobs and tree objects. */
export async function makeNotesTreeCommit(
  cwd: string,
  entries: NotesTreeCommitEntry[],
  options: NotesTreeCommitOptions = {},
): Promise<{ blobs: Map<string, string>; manifestBlob: string | null; tip: string }> {
  const execInput = makeGitExecInput(cwd);
  const blobs = new Map<string, string>();
  const treeEntries = new Map<string, string>();
  for (const entry of entries) {
    const blob = (await execInput(["hash-object", "-w", "--stdin"], entry.content)).trim();
    blobs.set(entry.commit, blob);
    treeEntries.set(entry.path ?? entry.commit, blob);
  }
  const manifestBlob = options.manifest === undefined || options.manifest === null
    ? null
    : (await execInput(
        ["hash-object", "-w", "--stdin"],
        serializeNotesCompactionManifest(options.manifest),
      )).trim();
  if (manifestBlob !== null) treeEntries.set(NOTES_COMPACTION_MANIFEST_PATH, manifestBlob);
  const root = fixtureTreeNode();
  for (const [path, blob] of treeEntries) {
    const segments = path.split("/");
    const file = segments.pop();
    if (file === undefined || file === "" || segments.some((segment) => segment === "")) {
      throw new Error(`Invalid fixture tree path: ${path}`);
    }
    let node = root;
    for (const segment of segments) {
      const child = node.children.get(segment) ?? fixtureTreeNode();
      node.children.set(segment, child);
      node = child;
    }
    node.files.set(file, blob);
  }
  const tree = await writeFixtureTree(execInput, root);
  const args = [
    "commit-tree",
    tree,
    ...((options.parents ?? []).flatMap((parent) => ["-p", parent])),
    "-m",
    options.message ?? "test notes tree",
  ];
  const { stdout } = await execFileAsync("git", args, { cwd });
  return { blobs, manifestBlob, tip: stdout.trim() };
}

/**
 * Stub GitExec returning a fixed `git rev-parse --abbrev-ref HEAD` value
 * for tests that need branch-pattern fallback behavior without a real
 * git repo. Pass `null` for detached HEAD (emits the literal `HEAD`).
 */
export function stubGitExec(branch: string | null): GitExec {
  const stdout = branch ?? "HEAD";
  return async () => ({ stdout, stderr: "" });
}

/** Create a real IOContext for a given cwd. */
export function makeIOContext(cwd: string): IOContext {
  return {
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    access: (path) => access(path),
    chmod: (path, mode) => chmod(path, mode),
    exec: makeGitExec(cwd),
  };
}

/** SHA-256 hex digest of a string. */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/** Ensure a directory exists (recursive). */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** Initialize a temp directory with git repo and config. */
export function createTempRepo(prefix = "arc-test-"): Promise<string> {
  return createTempRepoCore({ prefix });
}

/** Clean up a temp directory via the shared retry-safe removal primitive. */
export function cleanupTempDir(dir: string): Promise<void> {
  return removeGitBackedDir(dir);
}

/** Load the real init recipe from the template directory. */
export async function loadRecipe(): Promise<Recipe> {
  const templateDir = getArcTemplatePath();
  const content = await readFile(
    join(templateDir, "..", "init-recipe.json"),
    "utf-8",
  );
  return JSON.parse(content) as Recipe;
}

/** Sensible defaults for InitPromptResult. Override only what matters per test. */
export const DEFAULT_PROMPTS: InitPromptResult = {
  project_name: "Test Project",
  tools: ["claude"],
  pm_mode: "none",
  team_mode: false,
};

/**
 * Run a full `arc init` in a temp repo with the given prompt values.
 *
 * Returns the temp directory path. Caller is responsible for cleanup.
 */
export async function initInTempRepo(
  prompts: InitPromptResult,
  identity = "test-user",
): Promise<string> {
  const dir = await createTempRepo();
  const templateDir = getArcTemplatePath();
  const recipe = await loadRecipe();
  const io = makeIOContext(dir);

  await runInit({
    cwd: dir,
    io,
    templateDir,
    internalTemplateDir: getInternalTemplatePath(),
    recipe,
    prompts,
    identityResult: identity,
  });

  return dir;
}

/**
 * Recursively list files under a directory (relative paths).
 * Skips `system/.internal/` by default.
 */
export async function listFiles(
  dir: string,
  opts: { skipInternal?: boolean } = {},
): Promise<string[]> {
  const { skipInternal = true } = opts;
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const relPath = relative(dir, fullPath);
      // Skip generated bookkeeping artifacts (not part of the recipe-driven
      // file inventory). Recipe-installed machinery under system/.internal/
      // (githooks, scripts, skills) is real inventory and is still listed.
      if (
        skipInternal &&
        (relPath === "system/.internal/manifest.json" ||
          relPath === "system/.internal/pristine.json")
      ) {
        continue;
      }
      // Skip user/{identity}/ directories (gitignored personal workspace)
      if (/^user\/[^/]+\//.test(relPath)) continue;
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        await walk(fullPath);
      } else {
        results.push(relPath);
      }
    }
  }
  await walk(dir);
  return results.sort();
}

// --- ARC Internal Path Helpers ---

/** Path to the manifest inside an ARC installation. */
export function manifestPath(cwd: string): string {
  return join(cwd, ".arc", "system", ".internal", "manifest.json");
}

/** Path to the pristine store inside an ARC installation. */
export function pristineStorePath(cwd: string): string {
  return join(cwd, ".arc", "system", ".internal", "pristine.json");
}

/** Read and parse the manifest from an ARC installation. */
export async function readManifestFile(cwd: string): Promise<Manifest> {
  const raw = await readFile(manifestPath(cwd), "utf-8");
  return JSON.parse(raw) as Manifest;
}

/** Read and parse the pristine store from an ARC installation. */
export async function readPristineStore(cwd: string): Promise<Record<string, string>> {
  const raw = await readFile(pristineStorePath(cwd), "utf-8");
  return JSON.parse(raw) as Record<string, string>;
}

/** Write a modified pristine store back (for tests that manipulate pristine state). */
export async function writePristineStore(cwd: string, store: Record<string, string>): Promise<void> {
  await writeFile(pristineStorePath(cwd), JSON.stringify(store, null, 2) + "\n", "utf-8");
}

/** Check whether a file exists. */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// --- ARC State Setup ---

/** File spec for setupInitialState. */
export interface FileSpec {
  content: string;
  classification: Classification;
  layer?: Layer;
}

/**
 * Set up a minimal ARC installation in a temp dir.
 * Writes .arc/ files, pristine.json, and manifest.json to .arc/system/.internal/.
 */
export async function setupInitialState(
  dir: string,
  files: Record<string, FileSpec>,
  installConfig?: Manifest["install_config"],
): Promise<void> {
  const arcDir = join(dir, ".arc");
  const internalDir = join(arcDir, "system", ".internal");

  const manifestFiles: Record<string, FileEntry> = {};
  const pristineStore: Record<string, string> = {};

  for (const [path, { content, classification, layer }] of Object.entries(files)) {
    await ensureDir(dirname(join(arcDir, path)));
    await writeFile(join(arcDir, path), content, "utf-8");

    if (classification !== "Scaffolded") {
      pristineStore[path] = content;
    }

    manifestFiles[path] = {
      classification,
      layer: layer ?? "core",
      pristine_hash: sha256(content),
    };
  }

  const manifest: Manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    framework_version: "0.0.0",
    installed_at: "2026-01-01T00:00:00.000Z",
    install_config: installConfig ?? {
      project_name: "Test Project",
      pm_mode: "none",
      tools: [],
    },
    files: manifestFiles,
  };

  await ensureDir(internalDir);
  await writeFile(
    join(internalDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  await writeFile(
    join(internalDir, "pristine.json"),
    JSON.stringify(pristineStore, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Create a temporary directory populated with given file contents.
 * Caller is responsible for cleanup via cleanupTempDir().
 */
export async function createTemplateDir(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-templates-"));
  for (const [path, content] of Object.entries(files)) {
    await ensureDir(dirname(join(dir, path)));
    await writeFile(join(dir, path), content, "utf-8");
  }
  return dir;
}

// --- Git Notes Helpers ---

import { spawn } from "node:child_process";
import type { DirEntry } from "../../src/lib/git/index.js";
import type { UserIOContext } from "../../src/commands/user.js";

/**
 * Write content to a git note ref on a commit via stdin piping.
 * Returns a function bound to the given cwd.
 */
export function makeGitNoteWriter(cwd: string) {
  return (ref: string, content: string, commit: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const proc = spawn("git", [
        "notes", "--ref", ref, "add", "-f", "-F", "-", commit,
      ], { cwd });
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git notes add failed (code ${code}): ${stderr}`));
      });
      proc.on("error", reject);
      proc.stdin.write(content);
      proc.stdin.end();
    });
  };
}

/**
 * Read content from a git note ref on a commit.
 * Returns a function bound to the given cwd.
 */
export function makeGitNoteReader(cwd: string) {
  return async (ref: string, commit: string): Promise<string | null> => {
    try {
      const { stdout } = await execFileAsync("git", [
        "notes", "--ref", ref, "show", commit,
      ], { cwd });
      return stdout;
    } catch {
      return null;
    }
  };
}

/**
 * Read directory entries with name and size (real filesystem).
 * Recurses into subdirectories — entries use relative paths.
 * Skips dot-directories (infrastructure, not user content).
 */
export async function readUserDir(dirPath: string): Promise<DirEntry[]> {
  const entries: DirEntry[] = [];

  async function walk(currentPath: string, prefix: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(currentPath);
    } catch {
      return;
    }
    for (const name of names) {
      const fullPath = join(currentPath, name);
      const s = await stat(fullPath);
      if (s.isDirectory()) {
        if (name.startsWith(".")) continue;
        await walk(fullPath, prefix ? `${prefix}/${name}` : name);
      } else if (s.isFile()) {
        const relativeName = prefix ? `${prefix}/${name}` : name;
        entries.push({ name: relativeName, size: s.size });
      }
    }
  }

  await walk(dirPath, "");
  return entries;
}

/** Create a real UserIOContext for a temp repo. */
export function makeUserIO(cwd: string): UserIOContext {
  return {
    exec: makeGitExec(cwd),
    execInput: makeGitExecInput(cwd),
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) => mkdir(path, opts).then(() => undefined),
    readDir: readUserDir,
    writeNote: makeGitNoteWriter(cwd),
    readNote: makeGitNoteReader(cwd),
  };
}

/** Create a commit in a temp repo. Returns the commit hash.
 *  Bypasses hooks — these are scaffolding commits for test setup, not hook tests. */
export async function makeCommit(cwd: string, message: string): Promise<string> {
  await execFileAsync(
    "git", ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", message],
    { cwd },
  );
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

/** Create a bare remote repo and add it as origin to the working repo. */
export async function addBareRemote(cwd: string): Promise<string> {
  const remoteDir = await mkdtemp(join(tmpdir(), "arc-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remoteDir]);
  await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd });
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd });
  return remoteDir;
}

// Re-export for convenience
export { readFile, writeFile, mkdir, rm, readdir, stat, join, dirname };
// Re-export the teardown primitive so integration tests route inline
// git-backed removals through it without reaching past the tier helper.
export { removeGitBackedDir };
export { execFileAsync };
export { getArcTemplatePath, getInternalTemplatePath };
export type { IOContext, GitExec, GitExecInput, Recipe, InitPromptResult, Manifest, DirEntry, UserIOContext };
