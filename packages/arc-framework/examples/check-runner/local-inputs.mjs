/** Independent public artifact verification and child environment composition. */
import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import process from "node:process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, open, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

/**
 * @typedef {import("./local-types.mjs").Plan} Plan
 * @typedef {import("./local-types.mjs").SourceManifest} SourceManifest
 * @typedef {import("./local-types.mjs").Invocation} Invocation
 */
const identityKeys = /** @type {const} */ (["dev", "ino", "size", "mode", "mtimeNs", "ctimeNs"]);

// The public repository-selector contract, implemented without ARC-private imports.
const gitNames = ["GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE", "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX", "GIT_SHALLOW_FILE", "GIT_COMMON_DIR"];
const ownedNames = new Set([...gitNames, "ARC_CHECK_BASE", "ARC_CHECK_TREE", "ARC_CHECK_MERGED", "ARC_CHECK_NOTICE"]);
/** @param {import("node:crypto").BinaryLike} bytes */
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/**
 * @param {string} root
 * @param {string} path
 */
function contained(root, path) {
  const suffix = relative(root, path);
  return suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

/** @param {string} target */
function manifestLinkTarget(target) {
  return process.platform === "win32" ? target.replaceAll("\\", "/") : target;
}

// Follow a link target component by component: contained dangling and cyclic targets are accepted, while
// escapes and the generated Git administration that replaced the repository's own are refused.
/**
 * @param {string} root
 * @param {string} link
 * @param {string} target
 */
async function assertLinkContained(root, link, target) {
  let cursor = await realpath(dirname(link));
  let pending = target.split("/");
  const visited = new Set();
  for (let hops = 0; pending.length > 0;) {
    if (!contained(root, resolve(cursor, ...pending))) throw new Error("Source symbolic link escapes its root");
    const state = JSON.stringify([cursor, pending]);
    if (visited.has(state)) return;
    visited.add(state);
    const path = resolve(cursor, /** @type {string} */ (pending.shift()));
    if (!contained(root, path)) throw new Error("Source symbolic link escapes its root");
    if ((relative(root, path).split(sep)[0] ?? "").toLowerCase() === ".git") throw new Error("Source symbolic link targets Git administration");
    const stat = await lstat(path).catch(/** @param {unknown} error */ error => { if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return undefined; throw error; });
    if (stat === undefined) return;
    if (stat.isSymbolicLink()) {
      const next = manifestLinkTarget(await readlink(path));
      if (++hops > 256 || next === "" || isAbsolute(next)) throw new Error("Source symbolic link chain cannot be followed within its root");
      pending = [...next.split("/"), ...pending];
      cursor = dirname(path);
    } else cursor = path;
  }
}

/**
 * Resolve a directory after validating its caller-provided spelling.
 * @param {string} root
 * @param {unknown} cwd
 */
export async function childDirectory(root, cwd) {
  if (typeof cwd !== "string" || (cwd !== "." && (isAbsolute(cwd) || cwd.split("/").some(part => !part || part === "." || part === "..")))) {
    throw new Error("Invocation cwd must be a contained slash-relative directory");
  }
  const physical = await realpath(resolve(root, cwd));
  if (!contained(await realpath(root), physical)) throw new Error("Invocation cwd escapes the captured source");
  return physical;
}

/**
 * @param {string} path
 * @param {import("./local-types.mjs").FileIdentity} identity
 */
async function verifyFile(path, identity) {
  if (typeof identity.bytes !== "number" || typeof identity.digest !== "string"
    || (identity.mode !== undefined && typeof identity.mode !== "number")) throw new Error("Captured input identity is invalid");
  const before = await lstat(path, { bigint: true });
  if (!before.isFile()) throw new Error("Captured input is no longer a regular file");
  const file = await open(path, "r");
  try {
    const opened = await file.stat({ bigint: true });
    const digest = createHash("sha256");
    const buffer = Buffer.alloc(65536);
    let bytes = 0;
    for (;;) {
      const read = await file.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) break;
      bytes += read.bytesRead;
      if (bytes > identity.bytes) throw new Error("Captured input grew during verification");
      digest.update(buffer.subarray(0, read.bytesRead));
    }
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    /** @param {import("node:fs").BigIntStats} stat */
    const same = stat => stat.isFile() && identityKeys.every(key => stat[key] === before[key]);
    if (![opened, after, current].every(same) || bytes !== identity.bytes || `sha256:${digest.digest("hex")}` !== identity.digest
      || (identity.mode !== undefined && Number(before.mode & 0o7777n) !== identity.mode)) throw new Error("Captured input bytes or identity changed");
  } finally { await file.close(); }
}

/**
 * Verify fixed source and explicit files before execution.
 * @param {Plan} plan
 * @param {string} [expectedGit]
 */
export async function verifyInputs(plan, expectedGit) {
  const source = plan.source;
  const root = await realpath(source.root);
  if (contained(root, resolve(source.manifest))) throw new Error("Source manifest must be outside captured project paths");
  const encoding = await readFile(source.manifest, "utf8");
  /** @type {unknown} */
  const decoded = JSON.parse(encoding);
  const manifest = /** @type {SourceManifest} */ (decoded);
  if (manifest.version !== 1 || !Array.isArray(manifest.entries) || JSON.stringify(manifest.coordinates) !== JSON.stringify(source.coordinates)) {
    throw new Error("Source manifest coordinates are invalid");
  }
  const coordinates = manifest.coordinates;
  const canonical = { version: 1, coordinates: { tree: coordinates.tree,
    ...(coordinates.head === undefined ? {} : { head: coordinates.head }), ...(coordinates.base === undefined ? {} : { base: coordinates.base }),
    merged: coordinates.merged }, entries: manifest.entries.map(entry => entry.kind === "file"
    ? { path: entry.path, kind: "file", mode: entry.mode, digest: entry.digest, bytes: entry.bytes }
    : { path: entry.path, kind: "symlink", target: entry.target }) };
  if (JSON.stringify(canonical) !== encoding || hash(encoding) !== source.digest) throw new Error("Source manifest digest or canonical encoding changed");
  /** @type {string | undefined} */
  let previous;
  for (const entry of manifest.entries) {
    if (typeof entry.path !== "string" || isAbsolute(entry.path) || entry.path.includes("\0")
      || entry.path.split("/").some(part => !part || part === "." || part === ".." || part === ".git")
      || (previous !== undefined && Buffer.compare(Buffer.from(previous), Buffer.from(entry.path)) >= 0)) throw new Error("Invalid source entry path or ordering");
    previous = entry.path;
    const path = resolve(root, entry.path);
    if (!contained(root, await realpath(dirname(path)))) throw new Error("Source entry parent escapes its root");
    if (entry.kind === "file") await verifyFile(path, entry);
    else {
      if (entry.kind !== "symlink" || typeof entry.target !== "string" || entry.target === "" || isAbsolute(entry.target)) {
        throw new Error("Source symbolic link changed or escapes its root");
      }
      const before = await lstat(path, { bigint: true });
      if (!before.isSymbolicLink()) throw new Error("Source symbolic link changed or escapes its root");
      const target = await readlink(path);
      if (manifestLinkTarget(target) !== entry.target) throw new Error("Source symbolic link changed or escapes its root");
      await assertLinkContained(root, path, entry.target);
      const after = await lstat(path, { bigint: true });
      if (!after.isSymbolicLink() || identityKeys.some(key => before[key] !== after[key]) || await readlink(path) !== target) {
        throw new Error("Source symbolic link changed during verification");
      }
    }
  }
  if (!(await lstat(resolve(root, ".git"))).isDirectory()) throw new Error("Independent source Git administration is unavailable");
  await verifyInventory(root, /** @type {{path: string}[]} */ (manifest.entries));
  const git = await administrationIdentity(resolve(root, ".git"));
  if (expectedGit !== undefined && git !== expectedGit) throw new Error("Captured Git administration changed; retry with a fresh attempt");
  for (const binding of Object.values(plan.environment)) if (binding.kind === "file" && binding.state === "file") await verifyFile(binding.path, binding);
  return git;
}

/**
 * @param {string} root
 * @param {{path: string}[]} entries
 */
async function verifyInventory(root, entries) {
  const files = new Set(entries.map(entry => entry.path));
  const directories = new Set(["."]);
  for (const entry of entries) {
    const components = entry.path.split("/");
    for (let count = 1; count < components.length; count++) directories.add(components.slice(0, count).join("/"));
  }
  /**
   * @param {string} prefix
   * @returns {Promise<void>}
   */
  const visit = async prefix => {
    for (const name of await readdir(resolve(root, prefix))) {
      const path = prefix === "." ? name : `${prefix}/${name}`;
      if (path === ".git") continue;
      if ((await lstat(resolve(root, path))).isDirectory()) {
        if (!directories.has(path)) throw new Error("Unexpected directory changed the captured source; retry with a fresh attempt");
        await visit(path);
      } else if (!files.has(path)) throw new Error("Unexpected file changed the captured source; retry with a fresh attempt");
    }
  };
  await visit(".");
}

// Git reads every top-level file and these directories as repository state. Git commands may still refresh the index's
// stat cache, which a split index also writes to sharedindex files, or add logs, locks and tool directories, so the
// index counts by its staged entries alone.
const gitStateDirectories = new Set(["hooks", "info", "objects", "refs"]);
/** @param {string} name */
const indexFile = name => name === "index" || name.startsWith("sharedindex.");

/** @param {string} root */
async function administrationIdentity(root) {
  const hash = createHash("sha256");
  /**
   * @param {string} path
   * @returns {Promise<void>}
   */
  const visit = async path => {
    const location = resolve(root, path);
    const before = await lstat(location, { bigint: true });
    if (!before.isDirectory() && !before.isFile()) throw new Error("Source Git administration contains unsupported linked or special entries");
    hash.update(JSON.stringify({ path, mode: Number(before.mode & 0o7777n), directory: before.isDirectory(), bytes: before.isFile() ? String(before.size) : undefined }));
    if (before.isDirectory()) {
      const names = (await readdir(location)).sort((first, second) => Buffer.compare(Buffer.from(first), Buffer.from(second)));
      for (const name of names) await visit(path === "." ? name : `${path}/${name}`);
    } else for await (const bytes of /** @type {AsyncIterable<Buffer>} */ (createReadStream(location))) hash.update(bytes);
    hash.update("\0");
    const after = await lstat(location, { bigint: true });
    if (identityKeys.some(key => before[key] !== after[key])) throw new Error("Source Git administration changed during verification");
  };
  const names = (await readdir(root)).sort((first, second) => Buffer.compare(Buffer.from(first), Buffer.from(second)));
  for (const name of names) {
    const directory = (await lstat(resolve(root, name))).isDirectory();
    if (directory ? gitStateDirectories.has(name) : !indexFile(name) && !name.endsWith(".lock")) await visit(name);
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !gitNames.includes(name.toUpperCase())));
  const { stdout } = await promisify(execFile)("git", [`--git-dir=${root}`, "ls-files", "--stage", "-z"],
    { cwd: root, env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  hash.update(stdout);
  return hash.digest("hex");
}

/**
 * Compose explicit bindings and invocation-owned channels.
 * @param {Plan} plan
 * @param {Partial<Invocation>} invocation
 * @param {string} [notice]
 * @returns {NodeJS.ProcessEnv}
 */
export function childEnvironment(plan, invocation, notice) {
  const explicit = new Set(Object.keys(plan.environment));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !ownedNames.has(name.toUpperCase())
    && !explicit.has(name)));
  for (const [name, binding] of Object.entries(plan.environment)) {
    if (ownedNames.has(name.toUpperCase())) throw new Error("Explicit binding overrides an execution-owned environment channel");
    const value = binding.kind === "value" ? (binding.state === "set" ? binding.value : undefined)
      : binding.state === "empty" ? "" : binding.state === "file" ? binding.path : undefined;
    if (value !== undefined) Object.defineProperty(env, name, { value, enumerable: true, writable: true, configurable: true });
  }
  const content = invocation.commandContent;
  if (content !== undefined) {
    env.ARC_CHECK_TREE = content.tree;
    if (content.base !== undefined) env.ARC_CHECK_BASE = content.base;
    if (content.merged?.length) env.ARC_CHECK_MERGED = content.merged.join(" ");
  }
  if (notice !== undefined) env.ARC_CHECK_NOTICE = notice;
  return env;
}

/**
 * Read the bounded child notice after native completion.
 * @param {string} path
 * @param {number} exitCode
 */
export async function readChildNotice(path, exitCode) {
  const text = await (async () => {
    const handle = await open(path, "r");
    try {
      const bytes = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      return bytes.subarray(0, bytesRead).toString("utf8");
    } finally { await handle.close(); }
  })().catch(() => "");
  const lines = text.split(/\r\n|\r|\n/u).map(line => line.replace(/\p{Cc}+/gu, " ").trim()).filter(Boolean);
  const notRun = exitCode === 0 ? undefined : lines.find(line => line.startsWith("not run:"));
  return { ...(lines.length ? { notice: lines.join("; ").slice(0, 200) } : {}),
    ...(notRun === undefined ? {} : { notRunReason: notRun.slice(8).trim().slice(0, 200) || "runner reported no check result" }) };
}
