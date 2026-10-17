/** Finish publication from an already landed import without rereading or reminting its source. */
import type { Store } from "../../contract.js";
import type { MigrateReport, StoreMigrateResult } from "../../commands.js";
import type { RefBackendContext } from "../context.js";
import type { StoreRefusal, Remedy } from "../../refusal.js";

/** A retry publishes the existing landing through the same store synchronization operation. */
export async function publishImport(context: RefBackendContext, store: Store, report: MigrateReport): Promise<StoreMigrateResult> {
  await context.migrateStep?.("import.publish");
  const pushed = await store.push();
  if (pushed.status === "refused") return storeFailure(pushed.refusal);
  for (const pull of pushed.result.pulls) {
    report.notices.push(...pull.notices.map((notice) => ({
      condition: notice.kind === "rule-broken" ? `${notice.rule}: ${notice.condition}` : notice.condition, remedy: notice.remedy,
    })));
    if (pull.status === "failed") return storeFailure(pull.failure);
  }
  for (const outcome of pushed.result.publishes) {
    if (outcome.status === "failed") return storeFailure(outcome.failure);
    if ("condition" in outcome) return unfinished(outcome.condition, outcome.remedy);
  }
  const missingIdentity = pushed.result.states.find(({ status }) => status === "no-identity");
  if (missingIdentity?.status === "no-identity") report.notices.push({ condition: "Only project state was synchronized because no personal identity is configured.", remedy: missingIdentity.remedy });
  const state = pushed.result.states.find(({ status }) => status !== "no-remote" && status !== "no-identity");
  if (state && "remedy" in state) return unfinished(`State publication reported ${state.status}.`, state.remedy);
  return { status: "ok", result: report };
}

function importRetry(remedy: Remedy): Remedy {
  return { text: `${remedy.text} Then rerun arc store migrate --import to publish its existing landing.`,
    argv: ["arc", "store", "migrate", "--import"] };
}

function storeFailure(refusal: StoreRefusal): StoreMigrateResult {
  return { status: "refused", refusal: { code: "store", refusal: { ...refusal, remedy: importRetry(refusal.remedy) } } };
}

function unfinished(condition: string, remedy: Remedy): StoreMigrateResult {
  return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable", condition,
    remedy: importRetry(remedy) } };
}
