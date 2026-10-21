/** Construct nested state trees directly in Git without touching the index or checkout. */

import type { RefBackendContext } from "./context.js";
import type { RefTreeEntry } from "./batch-read.js";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { readGitDirectories } from "../../git/directories.js";
import { readObjectFormat, type ObjectFormat } from "./manifest.js";
import { hashObjectTree, writeObjectTrees, type ObjectTree, type ObjectTreeEntry } from "./object-trees.js";

interface TreeNode { files: Map<string, RefTreeEntry>; children: Map<string, TreeNode> }

/** Write UTF-8 record bytes as a blob in the local object store. */
export async function writeRefBlob(context: RefBackendContext, content: string): Promise<string> {
  if (context.blobStage) {
    const bytes = Buffer.from(content);
    const oid = createHash(context.blobStage.format).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
    context.blobStage.blobs.set(oid, bytes);
    return oid;
  }
  const { stdout } = await context.rawExec(["hash-object", "-w", "--stdin"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: Buffer.from(content),
  });
  return new TextDecoder().decode(stdout).trim();
}

/** Write every prospective blob into the repository protected by the commit scope. */
export async function flushRefBlobStage(context: RefBackendContext): Promise<RefBackendContext> {
  const physical = { ...context, blobStage: undefined };
  const blobs = [...context.blobStage?.blobs ?? []];
  if (blobs.length === 0) return physical;
  const commonDir = context.repository?.commonDir ?? (await readGitDirectories(context.checkoutRoot, context.fs)).commonDir;
  const directory = join(commonDir, "arc", `object-stage-${randomUUID()}`);
  try {
    await context.fs.mkdir(directory, { recursive: true });
    const paths: string[] = [];
    for (const [index, [, bytes]] of blobs.entries()) {
      const path = join(directory, String(index));
      await context.fs.writeBytes(path, bytes);
      paths.push(quoteGitPath(path));
    }
    const { stdout } = await physical.rawExec(["hash-object", "-w", "--no-filters", "--stdin-paths"], {
      cwd: physical.checkoutRoot, objectAccess: "local-only", input: Buffer.from(paths.join("\n") + "\n"),
    });
    const written = new TextDecoder().decode(stdout).trim().split(/\r?\n/u);
    if (written.length !== blobs.length || written.some((oid, index) => oid !== blobs[index]?.[0])) {
      throw new Error("A staged blob does not match the store's object format");
    }
  } finally { await context.fs.removeDirectory(directory); }
  return physical;
}

/** Build a recursive tree while retaining every untouched entry's mode and object identity. */
export async function writeRefTree(context: RefBackendContext, entries: Iterable<RefTreeEntry>): Promise<string> {
  const node = (): TreeNode => ({ files: new Map(), children: new Map() });
  const root = node();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    const name = parts.pop();
    if (!name) throw new Error("A state tree entry has no filename");
    let parent = root;
    for (const part of parts) {
      let child = parent.children.get(part);
      if (!child) { child = node(); parent.children.set(part, child); }
      parent = child;
    }
    parent.files.set(name, entry);
  }
  const trees: ObjectTree[] = [];
  const oid = buildNode(root, await readObjectFormat(context), trees);
  // Retained entries may already name unavailable objects; keep their identities unchanged.
  await writeObjectTrees(context, trees, true);
  return oid;
}

function buildNode(node: TreeNode, format: ObjectFormat, trees: ObjectTree[]): string {
  const entries: ObjectTreeEntry[] = [...node.files].map(([name, entry]) => ({
    name, oid: entry.oid, mode: entry.mode === "040000" ? "40000" : entry.mode,
  }));
  for (const [name, child] of node.children) entries.push({ name, oid: buildNode(child, format, trees), mode: "40000" });
  const tree = hashObjectTree(entries, format);
  trees.push(tree);
  return tree.oid;
}

function quoteGitPath(path: string): string {
  let quoted = '"';
  for (const byte of Buffer.from(path)) {
    if (byte === 34 || byte === 92) quoted += `\\${String.fromCharCode(byte)}`;
    else quoted += byte >= 32 && byte < 127 ? String.fromCharCode(byte) : `\\${byte.toString(8).padStart(3, "0")}`;
  }
  return quoted + '"';
}
