/** State acquisition through independently reported remote fetches. */

import { FAMILY_IDS } from "../catalog.js";
import { FAMILY_REGISTRY } from "../registry.js";
import type { PullInput, PullResult, PullOutcome } from "../sync.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop } from "./designation.js";
import { writeRefRepository } from "./repository.js";
import { fetchRefRemote } from "./fetch.js";

/** Fetch only explicitly designated state sources into this store's tracking namespace. */
export async function pullRefStore(context: RefBackendContext, input: PullInput = {}): Promise<StoreResult<PullResult>> {
  const designation = await readRefDesignation(context);
  const stop = refDesignationStop(designation);
  if (stop) return { status: "ok", result: { states: [stop], pulls: [] } };
  context = await writeRefRepository(context);
  const identity = await context.identity();
  const families = FAMILY_IDS.filter((family) => family !== "project-machinery" && family !== "constitution"
    && (identity !== null || FAMILY_REGISTRY[family].scope !== "identity"));
  const pulls: PullOutcome[] = [];
  for (const remote of designation.remotes.filter(({ role }) => role === "push" || role === "read")) {
    const fetched = await fetchRefRemote(context, remote, designation, input.history);
    const common = { remote: remote.name, role: remote.role === "read" ? "read" as const : "state" as const,
      families: remote.role === "read" ? families.filter((family) => FAMILY_REGISTRY[family].scope !== "identity") : families, notices: [] };
    pulls.push(fetched.status === "unreachable" ? { ...common, status: "failed", failure: {
      code: "unreachable", class: "recoverable", cause: fetched.cause, condition: fetched.stderr || "The state fetch failed.",
      remedy: { text: "Repair remote connectivity or authentication and retry the pull."
        + (context.repository?.gitDir ? ` Transport settings in code-repository config do not reach this store; move them to global Git config or ${context.repository.gitDir}/config.` : "") },
    } } : { ...common, status: fetched.refs.length > 0 ? "pulled" : "noop" });
  }
  return { status: "ok", result: { states: [], pulls } };
}
