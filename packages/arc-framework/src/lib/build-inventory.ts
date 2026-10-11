/** Filesystem entry and resolver-control identity outside managed dependencies and generated output. */
import type { BuildEvidence } from "./build-evidence.js";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";

/** Entry inventory, broad baseline contents, and selective shared resolver identity. */
export interface BuildInventory {
  readonly entries: BuildEvidence["inventory"];
  readonly contents: Readonly<Record<string, string>>;
  readonly identity: string;
}

/**
 * Inventory first-party source/config candidates before following filesystem links.
 * @param packageRoot - Build's consuming package boundary
 * @param roots - Repository-relative source/config roots
 * @param sourceContents - Retain ordinary source digests for a generation baseline
 * @returns Rich membership and resolver controls plus broad baseline contents
 */
export function captureBuildInventory(
  packageRoot: string, roots: readonly string[] = ["."], sourceContents = true,
): BuildInventory {
  const root = resolve(packageRoot, "../..");
  const state: InventoryState = { root, packageRoot: resolve(packageRoot),
    entries: new Map(), contents: {}, sourceContents };
  for (const key of roots) {
    const directory = resolve(root, key);
    if (!isContained(root, directory)) throw new Error(`Build inventory root ${key} escapes the checkout.`);
    walkInventory(state, directory, new Set());
  }
  const entries = retainInputDirectories([...state.entries.values()]).sort((a, b) => a.path.localeCompare(b.path));
  const manifests = Object.entries(state.contents).filter(([key]) => basename(key) === "package.json")
    .sort(([a], [b]) => a.localeCompare(b));
  return { entries, contents: state.contents,
    identity: createHash("sha256").update(JSON.stringify({ entries, manifests })).digest("hex") };
}

/** Keep directory membership only when it supports an inventoried file or link. */
function retainInputDirectories(entries: BuildEvidence["inventory"]): BuildEvidence["inventory"] {
  const parents = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "directory") continue;
    for (let parent = posix.dirname(entry.path); !parents.has(parent); parent = posix.dirname(parent)) {
      parents.add(parent);
      if (parent === ".") break;
    }
  }
  return entries.filter((entry) => entry.kind !== "directory" || parents.has(entry.path));
}

interface InventoryState {
  readonly root: string;
  readonly packageRoot: string;
  readonly entries: Map<string, BuildEvidence["inventory"][number]>;
  readonly contents: Record<string, string>;
  readonly sourceContents: boolean;
}

const ROOT_ARTIFACT_DIRECTORIES = new Set([".git", ".arc", ".codex", ".claude", ".agents", "dist", ".cache"]);
const PACKAGE_ARTIFACT_DIRECTORIES = new Set([
  "dist", "__tests__", "arc", "audits", "changelog", "templates", ".cache", ".test-cost-runs",
]);

function walkInventory(state: InventoryState, path: string, ancestors: ReadonlySet<string>): void {
  const name = basename(path);
  if (name === "node_modules" || isArtifactDirectory(state, path, name)) return;
  const key = relative(state.root, path).split(sep).join("/") || ".";
  const entry = lstatSync(path);
  if (entry.isSymbolicLink()) {
    state.entries.set(key, { path: key, kind: "link", target: readlinkSync(path) });
    followLink(state, path, ancestors, key);
    return;
  }
  if (entry.isDirectory()) {
    state.entries.set(key, { path: key, kind: "directory" });
    walkDirectory(state, path, ancestors);
  } else if (entry.isFile() && isSourceCandidate(path)) {
    state.entries.set(key, { path: key, kind: "file" });
    retainContent(state, path, key);
  }
}

function followLink(state: InventoryState, path: string, ancestors: ReadonlySet<string>, key: string): void {
  let target: string;
  try {
    target = realpathSync(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (!isContained(state.root, target)) return;
  if (statSync(path).isDirectory()) walkDirectory(state, path, ancestors);
  else if (isSourceCandidate(path)) {
    retainContent(state, path, key);
  }
}

function walkDirectory(state: InventoryState, path: string, ancestors: ReadonlySet<string>): void {
  const physical = realpathSync(path);
  if (ancestors.has(physical)) return;
  const next = new Set([...ancestors, physical]);
  for (const name of readdirSync(path).sort()) walkInventory(state, join(path, name), next);
}

function isSourceCandidate(path: string): boolean {
  // bundle-require emits .mjs/.cjs siblings with a base36 id truncated to 13 characters.
  const loaderOutput = /\.bundled_[a-z0-9]{0,13}\.[mc]js$/u.test(path);
  return !loaderOutput && /\.(?:[cm]?[jt]sx?|json)$/u.test(path);
}

function isArtifactDirectory(state: InventoryState, path: string, name: string): boolean {
  const parent = dirname(path);
  return (parent === state.root && ROOT_ARTIFACT_DIRECTORIES.has(name))
    || (parent === state.packageRoot
      && (PACKAGE_ARTIFACT_DIRECTORIES.has(name) || name.startsWith(".arc-dev-build-")));
}

function retainContent(state: InventoryState, path: string, key: string): void {
  if (state.sourceContents || basename(path) === "package.json") {
    state.contents[key] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
}

function isContained(root: string, path: string): boolean {
  const key = relative(root, path);
  return key !== ".." && !key.startsWith(`..${sep}`) && !isAbsolute(key);
}
