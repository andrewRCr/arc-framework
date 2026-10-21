/** Registry commits provide an atomic move version without changing registry content. */
import { appendStoreCreationReceipt } from "../commit-creation-receipt.js";
import { randomUUID } from "node:crypto";
import { renderStoreCommitMessage } from "../commit-provenance.js";
import { RecordReferenceSchema } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** Preserve the exact captured tree and attribute the move to its actual project. */
export async function commitMigrationRegistry(code: RefBackendContext, parent: string, action: "move-remote" | "forward"): Promise<string> {
  const refs = new Map([["refs/arc/project/registry", parent]]);
  const owner = projectOwnerFromObjects(refs, await readBatchObjects(code, projectIdentityQueries(refs)));
  if (owner.status === "refused") throw new MigrationRefusal({ code: "store", refusal: owner.refusal });
  const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: owner.result });
  const { stdout: tree } = await code.exec("git", ["rev-parse", `${parent}^{tree}`], { cwd: code.checkoutRoot });
  const identity = await code.identity(), actor = identity === null ? undefined : await code.actor(identity);
  const batchId = randomUUID();
  const { stdout } = await code.exec("git", ["commit-tree", tree.trim(), "-p", parent, "-m",
    appendStoreCreationReceipt(renderStoreCommitMessage({ verb: "migrate", lifecycleAction: action }, reference, batchId, actor),
      { schemaVersion: 1, batchId, createdOwners: [] })], { cwd: code.checkoutRoot });
  return stdout.trim();
}

/** Require an initialized project where a forwarding record must carry its UUID. */
export async function migrationProjectId(code: RefBackendContext, registry: string): Promise<string> {
  const refs = new Map([["refs/arc/project/registry", registry]]);
  const owner = projectOwnerFromObjects(refs, await readBatchObjects(code, projectIdentityQueries(refs)));
  if (owner.status === "refused") throw new MigrationRefusal({ code: "store", refusal: owner.refusal });
  if (owner.result.type === "project" && owner.result.uid) return owner.result.uid;
  throw new MigrationRefusal({ code: "store", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/registry",
    condition: "The state remote's registry has no project identity to forward.", remedy: { text: "Restore the initialized project identity on the state remote, then retry arc store migrate." } } });
}
