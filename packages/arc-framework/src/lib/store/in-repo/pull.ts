/** Fetch personal notes without publishing, preserving producer-owned fetch and load outcomes. */
import type { Slug } from "../../kernel/schema/slug.js";
import { isGitProcessError } from "../../git/process-error.js";
import { classifyRemoteFailure } from "../../git/remote-ref-reader.js";
import { PullResultSchema, type PullOutcome, type PullResult } from "../sync.js";
import type { InRepoContext } from "./context.js";
import { notesIO } from "./sync-io.js";

/** Fetch notes for the configured identity and load every successful fetch.
 * @param context - Explicit notes, filesystem, identity, and remote dependencies.
 * @returns Independent configuration states and the personal family's pull outcome.
 */
export async function pullInRepo(context: InRepoContext): Promise<PullResult> {
  const [identity, remote] = await Promise.all([context.ports.identity(), context.ports.remote()]);
  const states: PullResult["states"] = remote === null ? [{ status: "no-remote" }] : [];
  if (identity === null) states.push({ status: "no-identity", families: ["personal"],
    remedy: { text: "Set arc.identity, then pull again." } });
  if (identity === null || remote === null) return { states, pulls: [] };
  return PullResultSchema.parse({ states, pulls: [await pullPersonal(context, identity, remote)] });
}

async function pullPersonal(context: InRepoContext, identity: Slug, remote: string): Promise<PullOutcome> {
  const [{ runUserFetch }, { runUserLoad }] = await Promise.all([
    import("../../../commands/user/push-fetch.js"), import("../../../commands/user/save-load.js"),
  ]);
  const io = notesIO(context, identity);
  const fetch = await runUserFetch({ io, identity });
  const base = { remote, role: "state" as const, families: ["personal" as const], notices: [] };
  if (fetch.kind === "remote-unavailable") {
    if (isGitProcessError(fetch.error) && fetch.error.expectedOutcome === "absent-remote-ref") return { ...base, status: "noop" };
    return { ...base, status: "failed", failure: { code: "unreachable", class: "recoverable",
      cause: classifyRemoteFailure(fetch.error), condition: fetch.error.message,
      remedy: { text: "Repair the fetch failure, then retry the personal-state pull." } } };
  }
  if (fetch.kind === "refused-diverged") return { ...base, status: "failed", failure: {
    code: "refused", class: "terminal", message: "Local and remote personal notes have diverged.",
    condition: "Local and remote personal notes have diverged.",
    remedy: { text: "Run arc sync to reconcile the notes, then retry pull.", argv: ["arc", "sync"] },
  } };
  if (fetch.kind === "refused-local-ahead") return { ...base, status: "noop" };
  const loaded = await runUserLoad({ cwd: context.ports.checkoutRoot, io, identity });
  const moved = fetch.kind === "created" || fetch.localTip !== fetch.remoteTip;
  return { ...base, status: loaded !== null && moved ? "pulled" : "noop" };
}
