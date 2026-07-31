/** Production complete-basis transaction composition for ordinary Errand late-link. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import type { LocusMutationResultV1 } from "../locus/schema/index.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";
import { readTransientIdentitySnapshot } from "./identity-snapshot.js";
import { ordinaryErrandTransform } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import { linkOrdinaryErrand } from "./link.js";

export interface LinkOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly inbox: InspectedInboxEntry;
  readonly updatedAt: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/** Run one production ordinary-Errand late-link transaction. */
export async function linkOrdinaryErrandAtRuntime(
  options: LinkOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  return linkOrdinaryErrand({
    slug: options.slug,
    inbox: options.inbox,
    updatedAt: options.updatedAt,
    dependencies: {
      readIdentity: async (slug) => {
        const local = await readTransientIdentitySnapshot(io);
        if (local.kind === "complete") {
          const localRecord = local.records.get(slug);
          if (localRecord?.version === 1 || localRecord?.version === 2) {
            return { kind: "idempotent", value: localRecord, tip: local.tip };
          }
        }
        return transactTransientIdentities(io, {
          remote: "origin",
          message: `arc: reconcile errand identity ${slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
        });
      },
      transact: (request) => transactTransientIdentities(io, {
        remote: "origin",
        message: `arc: link errand ${request.previous.slug}`,
        transform: ordinaryErrandTransform(request),
      }),
    },
  });
}
