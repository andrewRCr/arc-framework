/** Native burst recovery after every publishing writer has exited. */
import { lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Store, PushResult, StoreResult } from "../../../src/lib/store/index.js";

export interface BurstRecoveryInput {
  root: string;
  layout: "default" | "separate";
  publication: StoreResult<PushResult>;
  store: Pick<Store, "push">;
}

/** Remove only observed native locks named by publication failures after every writer has exited, then retry. */
export async function recoverStrandedBurstPublication(input: BurstRecoveryInput): Promise<StoreResult<PushResult>> {
  const failures = input.publication.status === "refused" ? [input.publication.refusal]
    : input.publication.result.publishes.flatMap(row => row.status === "failed" ? [row.failure] : []);
  if (!failures.length) return input.publication;
  const directory = join(input.root, ".git", ...input.layout === "separate" ? ["arc", "store"] : []);
  const remote = input.layout === "default" ? "origin" : "backing";
  const candidates = ["refs/arc/user/andrew/personal", `refs/arc-remotes/${remote}/user/andrew/personal`,
    `refs/arc/tmp/seen/${remote}/user/andrew/personal`].map(ref => join(directory, `${ref}.lock`));
  candidates.push(join(directory, "reftable", "tables.list.lock"), join(directory, "packed-refs.lock"));
  const observed: string[] = [];
  for (const path of candidates) {
    try { if ((await lstat(path)).isFile()) observed.push(path); }
    catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || !["ENOENT", "ENOTDIR"].includes(String(error.code))) throw error;
    }
  }
  const named = new Set<string>();
  for (const failure of failures) {
    const matching = observed.filter(path => failure.code === "lock-held" ? failure.lock === path
      : failure.code === "refused" && failure.condition.includes(path));
    if (!matching.length) throw new Error(`Publication did not name an observed stranded lock: ${JSON.stringify({ publication: input.publication, observed })}`);
    matching.forEach(path => named.add(path));
  }
  for (const path of named) await unlink(path);
  return input.store.push();
}
