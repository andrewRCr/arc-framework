/** Compute and persist child-first Git trees with one object-writing process. */
import { createHash } from "node:crypto";
import type { RefBackendContext } from "./context.js";
import type { ObjectFormat } from "./manifest.js";

/** Canonical binary tree modes; directories omit the textual leading zero. */
export interface ObjectTreeEntry { mode: string; name: string; oid: string }
/** A fully computed tree, ready for native Git's batch verification. */
export interface ObjectTree { oid: string; entries: readonly ObjectTreeEntry[] }

/** Hash exact Git binary tree bytes in Git's bytewise directory-aware order. */
export function hashObjectTree<T extends ObjectTreeEntry>(entries: T[], format: ObjectFormat): { oid: string; entries: T[] } {
  const sortName = (entry: ObjectTreeEntry) => Buffer.from(entry.name + (entry.mode === "40000" ? "/" : ""));
  entries.sort((left, right) => Buffer.compare(sortName(left), sortName(right)));
  const bytes = Buffer.concat(entries.flatMap((entry) => [Buffer.from(`${entry.mode} ${entry.name}\0`), Buffer.from(entry.oid, "hex")]));
  const oid = createHash(format).update(Buffer.from(`tree ${bytes.byteLength}\0`)).update(bytes).digest("hex");
  return { oid, entries };
}

/** Persist child-first trees and require native Git to agree with every computed identity. */
export async function writeObjectTrees(context: RefBackendContext, trees: readonly ObjectTree[], allowMissing = false): Promise<void> {
  const input = trees.map((tree) => tree.entries.map((entry) =>
    `${entry.mode} ${entry.mode === "40000" ? "tree" : entry.mode === "160000" ? "commit" : "blob"} ${entry.oid}\t${entry.name}\0`).join("") + "\0").join("");
  const { stdout } = await context.rawExec(["mktree", "--batch", "-z", ...allowMissing ? ["--missing"] : []], {
    cwd: context.checkoutRoot, objectAccess: "local-only", input: Buffer.from(input),
  });
  const written = new TextDecoder().decode(stdout).trim().split(/\r?\n/u);
  if (written.length !== trees.length || written.some((oid, index) => oid !== trees[index]?.oid)) {
    throw new Error("Git wrote a tree different from its computed object ID");
  }
}
