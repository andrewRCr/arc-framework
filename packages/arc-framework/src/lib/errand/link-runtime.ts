/** Production complete-basis transaction composition for ordinary Errand late-link. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";
import type { ErrandOperationResult } from "./operation-result.js";
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
): Promise<ErrandOperationResult> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  return linkOrdinaryErrand({
    slug: options.slug,
    inbox: options.inbox,
    updatedAt: options.updatedAt,
    dependencies: {
      readIdentity: async (slug) => {
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
