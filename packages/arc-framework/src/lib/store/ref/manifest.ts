/** Git-compatible manifest trees naming the current tips of registered state refs. */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { readGitDirectories } from "../../git/directories.js";
import { FAMILY_IDS } from "../catalog.js";
import { StateVersionSchema, type StateVersion } from "../identity.js";
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
  const { commonDir } = await readGitDirectories(context.checkoutRoot, context.fs);
  const config = await context.fs.readFile(join(commonDir, "config"));
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
  return FAMILY_IDS.some((family) => matchesFamilyRef(ref, family)) || /^refs\/arc\/archive\/\d{4}-Q[1-4]$/u.test(ref);
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

/** Compute the current manifest from one local ref-tip snapshot. */
export async function refStateVersion(context: RefBackendContext): Promise<StateVersion> {
  const tips = await readRefTips(context);
  return buildRefManifest(tips, await readObjectFormat(context)).version;
}
