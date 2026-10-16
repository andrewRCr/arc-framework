/** Capability-selected entry plans keep lifecycle handlers focused on their runtime operation. */
import { legacyInboxEntryDigest } from "../lib/store/legacy-inbox-origin.js";
import { removePartialOrigin } from "../lib/inbox/partial-origin.js";
import { resolveQueueExecutionOffer } from "../lib/inbox/offer.js";
import { resolveInboxEntryOperand } from "../lib/inbox-entry-operand.js";
import { createStoreSyncPort } from "../lib/store/operational-sync.js";
import { prepareErrandAdoption } from "../lib/inbox/errand-adoption.js";
import { prepareErrandReturn, type ErrandReturn } from "../lib/inbox/errand-return.js";
import type { ErrandInboxOrigin } from "../lib/errand/inbox-origin.js";
import type { ErrandOperationResult } from "../lib/errand/operation-result.js";
import type { InboxContext } from "../lib/inbox/types.js";
import type { Mutation } from "../lib/store/write.js";

/** Invocation's capture basis and atomic companions. */
export interface HandlerErrandAdoption { origin: ErrandInboxOrigin | null; writes: Mutation[]; closed?: string }
/** Select the legacy title adoption or qualified store plan before any lifecycle mutation.
 * @param input - Entry selector or free text concern.
 * @param context - Selected backend and identity.
 * @param legacy - Existing lock-based title reader.
 * @returns Origin and companions.
 */
export async function prepareHandlerErrandAdoption(input: { slug: string; literal?: string; file?: string; intent?: string; partial?: boolean }, context: InboxContext, legacy: () => Promise<ErrandInboxOrigin>): Promise<HandlerErrandAdoption> {
  const selected = input.literal !== undefined || input.file !== undefined;
  if (!context.store.capabilities.stateOffBranch) return { origin: selected ? await legacy() : null, writes: [] };
  const pulled = await (context.sync ?? createStoreSyncPort()).pull();
  if (pulled.status === "unreachable") throw new Error(`${pulled.condition} ${pulled.remedy.text}`);
  const from = selected ? await resolveInboxEntryOperand({ literal: input.literal, file: input.file, stateOffBranch: true }) : undefined;
  const adoption = await prepareErrandAdoption({ slug: input.slug, from, intent: input.intent, partial: input.partial }, context);
  if (adoption.status === "refused") throw new Error(`${adoption.refusal.condition} ${adoption.refusal.remedy.text}`);
  return adoption.result;
}
/** Drop partial-start queue references only after the identity-free provision succeeds.
 * @param result - Provision result.
 * @param partial - Protection posture.
 * @param writes - Queue mutation, when a captured entry was queued.
 * @param context - Invocation store.
 * @returns Runtime result, refusing a failed queue write without losing occupancy evidence.
 */
export async function completePartialQueueDrop(result: ErrandOperationResult, partial: boolean, writes: readonly Mutation[], context: InboxContext): Promise<ErrandOperationResult> {
  if (!context.store.capabilities.stateOffBranch || !partial || !writes.length || (result.outcome !== "applied" && result.outcome !== "idempotent")) return result;
  const written = await context.store.batch({ writes: [...writes], provenance: { verb: "errand-open", lifecycleAction: "open" } });
  if (written.status === "refused") return { outcome: "error", operation: "errand-open", error: { code: "locus.errand-open.inbox", message: written.refusal.condition }, recommendedPromptText: written.refusal.remedy.text };
  return result;
}
/** Read a full-protection return plan before destructive cleanup.
 * @param slug - Errand to abandon.
 * @param protection - Active protection.
 * @param context - Invocation backend.
 * @returns No plan on the legacy/partial arms, exact companions otherwise.
 */
export async function prepareHandlerErrandReturn(slug: string, protection: "full" | "partial", context: InboxContext): Promise<ErrandReturn | null> {
  if (!context.store.capabilities.stateOffBranch || protection === "partial") return null;
  const prepared = await prepareErrandReturn(slug, context);
  if (prepared.status === "refused") throw new Error(`${prepared.refusal.condition} ${prepared.refusal.remedy.text}`);
  return prepared.result;
}

/** Settle one partial capture and read its next offer while preserving both reports.
 * @param binding - Raw version arm or legacy digest arm from terminal authority.
 * @param context - Invocation backend.
 * @param legacyDigest - Compatibility caller's existing exact digest primitive.
 * @returns Exact disposition and queue selection or refusal.
 */
export async function settleStorePartialCapture(binding: { originEntry: string | null; originEntryVersion?: string; originEntrySourceDigest?: string; parentCheckoutPath: string | null }, context: InboxContext, legacyDigest: (content: string, title: string) => string = legacyInboxEntryDigest) {
  const removed = await removePartialOrigin(binding, context, legacyDigest);
  if (removed.status === "refused") return { outcome: { kind: "refused" as const, reason: removed.refusal.condition }, disposition: "retained" as const, offer: null };
  const offer = await resolveQueueExecutionOffer(context, binding.parentCheckoutPath);
  if (offer.status === "refused") return { outcome: { kind: "refused" as const, reason: offer.refusal.condition }, disposition: removed.result.disposition, offer: null };
  return { outcome: { kind: removed.result.disposition === "removed" ? "applied" as const : "idempotent" as const, nextOffer: offer.result.nextOffer }, disposition: removed.result.disposition, offer: offer.result };
}

/** Include the previously ended home which admission observed, without changing its new origin.
 * @param result - Operation result.
 * @param closed - Prior ended Errand, if any.
 * @returns Result with the admission notice in its normal report.
 */
export function reportPriorErrand(result: ErrandOperationResult, closed?: string): ErrandOperationResult {
  return closed === undefined ? result : { ...result, recommendedPromptText: `${result.recommendedPromptText} This capture's prior Errand ${closed} already ended.` };
}
