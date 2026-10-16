/** Production complete-basis transaction composition for ordinary Errand late-link. */
import { readRuntimeErrand, transitionRuntimeErrand, type ErrandRuntimeStorageOptions } from "../store/errand-runtime-transactions.js";

import type { GitExec, GitExecInput } from "../git/exec.js";
import type { ErrandInboxOrigin } from "./inbox-origin.js";
import type { ErrandOperationResult } from "./operation-result.js";
import { linkOrdinaryErrand } from "./link.js";

export interface LinkOrdinaryErrandRuntimeOptions extends ErrandRuntimeStorageOptions {
  readonly slug: string;
  readonly inbox: ErrandInboxOrigin;
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
        return readRuntimeErrand(options, io, slug);
      },
      transact: (request) => transitionRuntimeErrand(options, io, request, `arc: link errand ${request.previous.slug}`),
    },
  });
}
