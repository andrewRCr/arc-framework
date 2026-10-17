/** Construct nested state trees directly in Git without touching the index or checkout. */

import type { RefBackendContext } from "./context.js";
import type { RefTreeEntry } from "./batch-read.js";
import { createHash } from "node:crypto";

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
  for (const [oid, bytes] of context.blobStage?.blobs ?? []) {
    const { stdout } = await physical.rawExec(["hash-object", "-w", "--stdin"], {
      cwd: physical.checkoutRoot, objectAccess: "local-only", input: bytes,
    });
    if (new TextDecoder().decode(stdout).trim() !== oid) throw new Error("A staged blob does not match the store's object format");
  }
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
  return writeNode(context, root);
}

async function writeNode(context: RefBackendContext, node: TreeNode): Promise<string> {
  const rows = [...node.files].map(([name, entry]) =>
    `${entry.mode} ${entry.mode === "160000" ? "commit" : entry.mode === "040000" ? "tree" : "blob"} ${entry.oid}\t${name}\0`);
  for (const [name, child] of node.children) rows.push(`040000 tree ${await writeNode(context, child)}\t${name}\0`);
  // Retained entries may already name unavailable blobs; keep their identities unchanged.
  const { stdout } = await context.rawExec(["mktree", "-z", "--missing"], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: Buffer.from(rows.join("")),
  });
  return new TextDecoder().decode(stdout).trim();
}
