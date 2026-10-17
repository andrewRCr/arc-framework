/** Git-compatible manifest trees naming the current tips of registered state refs. */

import { readRefRepository } from "./repository.js";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import { readGitDirectories } from "../../git/directories.js";
import { FAMILY_IDS } from "../catalog.js";
import { StateVersionSchema, type StateVersion } from "../identity.js";
import { isArchiveRef } from "./archive-read.js";
import { matchesFamilyRef } from "./codec.js";
import { readRefTips } from "./batch-read.js";
import type { RefBackendContext } from "./context.js";

/** Supported object hashing, selected from the store's own common config. */
export type ObjectFormat = "sha1" | "sha256";
/** A tree entry in both Git's binary object and mktree input. */
export interface ManifestEntry { mode: "40000" | "160000"; name: string; oid: string }
/** Children precede parents so all manifest trees can be written in one batch. */
export interface ManifestTree { oid: string; entries: readonly ManifestEntry[] }
/** The root's object ID is the saved-state token. */
export interface RefManifest { version: StateVersion; trees: readonly ManifestTree[] }
interface ManifestNode { tips: Map<string, string>; children: Map<string, ManifestNode> }

/** Read the configured object format without invoking Git or consulting identity. */
export async function readObjectFormat(context: RefBackendContext): Promise<ObjectFormat> {
  const gitDir = context.repository?.gitDir ?? context.repository?.commonDir ?? (await readGitDirectories(context.checkoutRoot, context.fs)).commonDir;
  const config = await context.fs.readFile(join(gitDir, "config"));
  let extensions = false;
  let format: ObjectFormat = "sha1";
  for (const line of config.split(/\r?\n/u)) {
    const section = /^\s*\[([^\]]+)\]/u.exec(line);
    if (section) { extensions = section[1]?.trim().toLowerCase() === "extensions"; continue; }
    const assignment = extensions ? /^\s*objectformat\s*=\s*(?:"(sha1|sha256)"|(sha1|sha256))\s*(?:[#;].*)?$/iu.exec(line) : null;
    if (assignment) format = (assignment[1] ?? assignment[2])?.toLowerCase() === "sha256" ? "sha256" : "sha1";
  }
  return format;
}

/** Select registered state refs while excluding history and machine-local/control refs. */
export function isManifestRef(ref: string): boolean {
  return FAMILY_IDS.some((family) => matchesFamilyRef(ref, family)) || isArchiveRef(ref);
}

/** Compute Git's exact object IDs for a ref manifest, retaining its writable tree entries. */
export function buildRefManifest(tips: ReadonlyMap<string, string>, format: ObjectFormat): RefManifest {
  const node = (): ManifestNode => ({ tips: new Map(), children: new Map() });
  const root = node();
  for (const [ref, oid] of tips) {
    if (!isManifestRef(ref)) continue;
    const parts = ref.slice("refs/arc/".length).split("/");
    const name = parts.pop() ?? "";
    let parent = root;
    for (const part of parts) {
      let child = parent.children.get(part);
      if (!child) { child = node(); parent.children.set(part, child); }
      parent = child;
    }
    parent.tips.set(name, oid);
  }
  const trees: ManifestTree[] = [];
  const version = StateVersionSchema.parse(hashTree(root, format, trees));
  return { version, trees };
}

function hashTree(node: ManifestNode, format: ObjectFormat, trees: ManifestTree[]): string {
  const entries: ManifestEntry[] = [...node.tips].map(([name, oid]) => ({ name, oid, mode: "160000" }));
  for (const [name, child] of node.children) entries.push({ name, oid: hashTree(child, format, trees), mode: "40000" });
  const sortName = (entry: ManifestEntry) => Buffer.from(entry.name + (entry.mode === "40000" ? "/" : ""));
  entries.sort((left, right) => Buffer.compare(sortName(left), sortName(right)));
  const bytes = Buffer.concat(entries.flatMap((entry) => [Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, "hex")]));
  const oid = createHash(format).update(Buffer.from(`tree ${bytes.byteLength}\0`)).update(bytes).digest("hex");
  trees.push({ oid, entries });
  return oid;
}

/** Persist a captured manifest and retain it with an expected-value local token ref. */
export async function saveCapturedManifest(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StateVersion> {
  const manifest = buildRefManifest(tips, await readObjectFormat(context));
  const tokenRef = context.readSource?.versionRef ?? "refs/arc/tmp/version";
  if (tips.get(tokenRef) === manifest.version) return manifest.version;
  const input = manifest.trees.map((tree) => tree.entries.map((entry) =>
    `${entry.mode} ${entry.mode === "40000" ? "tree" : "commit"} ${entry.oid}\t${entry.name}\0`).join("") + "\0").join("");
  const { stdout } = await context.rawExec(["mktree", "--batch", "-z"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: Buffer.from(input),
  });
  const written = new TextDecoder().decode(stdout).trim().split(/\r?\n/u);
  if (written.length !== manifest.trees.length || written.some((oid, index) => oid !== manifest.trees[index]?.oid)) {
    throw new Error("Git wrote a manifest tree different from its computed object ID");
  }
  // A competing checkout may retain a newer token; this captured manifest remains a valid result.
  await updateRefTransaction(context, [{ ref: tokenRef, next: manifest.version, expected: tips.get(tokenRef) ?? null }], {
    cwd: context.checkoutRoot,
  });
  return manifest.version;
}

/** Compute and retain the current manifest from one local ref-tip snapshot. */
export async function refStateVersion(context: RefBackendContext): Promise<StateVersion> {
  context = await readRefRepository(context);
  return saveCapturedManifest(context, await readRefTips(context));
}
