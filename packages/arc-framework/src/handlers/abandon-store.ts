/** Operational abandonment reads the complete store view before confirmation and one terminal batch. */
import { sameOwner, type OwnerIdentity } from "../lib/store/identity.js";
import type { Store } from "../lib/store/contract.js";
import type { LifecycleEntry } from "../lib/store/lifecycle-index.js";
import { SlugSchema } from "../lib/kernel/index.js";
import * as p from "../lib/terminal.js";
import { readLifecycleView } from "../lib/store/lifecycle-view.js";
import { requireCompleteInventory } from "../lib/store/lifecycle-storage.js";
import { readWorkUnit } from "../lib/store/lifecycle-write.js";
import { runStoreAbandon } from "../lib/work-unit/verbs/abandon-store.js";
import { createStoreTeardownContext } from "../lib/work-unit/store-teardown-context.js";
import type { ExecuteTransitionContext } from "../lib/work-unit/lifecycle-executor.js";
import { refuse, reportOutcome, type VerbBase } from "./lifecycle-shared.js";
/** Report store-based impact and Integrating coordination before honoring explicit confirmation. */
export async function handleStoreAbandon(base: VerbBase, executor: ExecuteTransitionContext, name: string, confirmed: boolean, baseBranch: string): Promise<void> {
  const store = executor.store;
  if (store === undefined) { refuse("Store abandonment requires an operational store."); return; }
  try {
    const view = await readLifecycleView(store);
    if (view.status === "refused") { refuse(view.refusal.condition, view.refusal); return; }
    requireCompleteInventory(store, view.result.listing);
    const read = await readWorkUnit(store, name);
    if (read.status === "refused") { refuse(read.refusal.condition, read.refusal); return; }
    const canonical = read.result.reference.owner.name;
    const entry = view.result.entries.find((candidate) => candidate.reference.owner.name === canonical);
    if (entry?.phase === "Integrating") { refuse(`Withdraw the PR with arc reopen ${canonical} before abandonment.`); return; }
    const coordination = await integratingDependents(store, view.result.entries, read.result.reference.owner);
    p.note(["Remove the primary and retain its exact terminal branch links in one batch.",
      "Release or remove its checkout, then reap created refs; adopted refs are kept.",
      ...coordination.map((dependent) => `Coordination: Integrating work unit ${dependent.reference.owner.name} depends on ${canonical}; coordinate its in-flight PR.`)].join("\n"), `Abandon ${canonical} — impact plan`);
    if (!confirmed) { refuse(`Refusing to abandon ${canonical} without --yes. Re-run with --yes to proceed.`); return; }
    const result = await runStoreAbandon({ executor, baseBranch, storeTeardown: createStoreTeardownContext(base, executor), removal: { exec: base.io.exec } }, { name: canonical, confirmed: true });
    if (result.status === "rejected") { refuse(result.reason, result.refusal, result.remedy); return; }
    for (const notice of result.notices ?? []) p.log.info(notice);
    reportOutcome("Abandoned", [`Work unit: ${canonical}`], result.outcome);
  } catch (error) { refuse(error instanceof Error ? error.message : String(error)); }
}

async function integratingDependents(store: Store, entries: readonly LifecycleEntry[], owner: OwnerIdentity): Promise<LifecycleEntry[]> {
  const dependents: LifecycleEntry[] = [], name = owner.name;
  for (const entry of entries.filter((candidate) => candidate.phase === "Integrating")) {
    for (const prerequisite of entry.fields.dependsOn) {
      if (prerequisite === name) { dependents.push(entry); break; }
      const resolved = await store.lookup({ kind: "slug", slug: SlugSchema.parse(prerequisite) });
      if (resolved.status === "refused") {
        if (resolved.refusal.code !== "not-found") throw Error(`${resolved.refusal.condition} ${resolved.refusal.remedy.text}`);
      } else if (sameOwner(resolved.result.reference.owner, owner)) { dependents.push(entry); break; }
    }
  }
  return dependents;
}
