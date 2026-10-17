/** Verify state object closure without allowing promised-object reads to fetch. */

import type { FetchOutcome } from "../../git/fetch.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { PullNotice } from "../sync.js";

/** An exhausted full refetch is a remote-scoped refusal, preserving local state for repair. */
export class RefFetchIncompleteError extends Error {
  readonly failure: Extract<StoreRefusal, { code: "refused" }>;
  constructor(missing: readonly string[], readonly notices: readonly PullNotice[]) {
    const condition = `The state fetch still lacks objects after a full refetch: ${missing.join(", ")}.`;
    super(condition);
    this.failure = { code: "refused", class: "terminal", message: condition, condition,
      remedy: { text: "Restore the missing objects on the state remote, then retry the pull; local writes were preserved." } };
  }
}

/** Read this physical repository's filter and promisor configuration, including other remotes. */
export async function refFetchNeedsCompleteness(context: RefBackendContext): Promise<boolean> {
  const { stdout } = await context.exec("git", ["config", "--null", "--list"], { cwd: context.checkoutRoot });
  return stdout.split("\0").some((row) => {
    const at = row.indexOf("\n"), key = (at < 0 ? row : row.slice(0, at)).toLowerCase(), value = at < 0 ? "true" : row.slice(at + 1);
    return (key === "extensions.partialclone" || /^remote\..+\.partialclonefilter$/u.test(key)) && value.length > 0
      || /^remote\..+\.promisor$/u.test(key) && /^(true|yes|on|1)$/iu.test(value);
  });
}

/** Check full fetched closure: tracking may have advanced before an earlier check refused. */
export async function missingRefFetchObjects(context: RefBackendContext, outcome: Extract<FetchOutcome, { status: "refs" }>): Promise<string[]> {
  const tips = [...new Set(outcome.refs.filter(({ flag, next }) => flag !== "!" && flag !== "-" && !/^0+$/u.test(next)).map(({ next }) => next))];
  if (!tips.length) return [];
  const { stdout } = await context.exec("git", ["rev-list", "--objects", "--missing=print", ...tips],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  return [...new Set(stdout.split(/\r?\n/u).flatMap((line) => /^\?([0-9a-f]{40}|[0-9a-f]{64})$/u.exec(line)?.[1] ?? []))];
}

/** Preserve original movement through an unchanged repair fetch and retain the latest refusal. */
export function combineRefFetchOutcomes(first: Extract<FetchOutcome, { status: "refs" }>, last: FetchOutcome): FetchOutcome {
  if (last.status === "unreachable") return last;
  const refs = new Map(first.refs.map((row) => [row.ref, row]));
  for (const row of last.refs) {
    const prior = refs.get(row.ref);
    refs.set(row.ref, row.flag === "=" && prior?.next === row.next ? prior : row);
  }
  return { ...last, refs: [...refs.values()], stdout: `${first.stdout}\n${last.stdout}`, stderr: `${first.stderr}\n${last.stderr}` };
}
