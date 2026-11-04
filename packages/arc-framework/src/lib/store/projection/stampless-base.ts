/** Compare every recorded base of a stampless save before allowing its write. */
import { KIND_REGISTRY } from "../registry.js";
import { mergeEntryText } from "../concurrency/entry-merge.js";
import { mergeLineText } from "../concurrency/line-merge.js";
import { stampEntryIds } from "../concurrency/stamp.js";
import type { StoreResult } from "../refusal.js";
import { recoverBase, type HistoryMemo, type RecoveredBase } from "./base-recovery.js";
import { readHistoricalBaseContent, type BaseSelectionContext } from "./base-content.js";
import type { WriteBackBaseDecision } from "./base-selection.js";
import { gitBlobId } from "./blob-id.js";
import { readTakenInCopy } from "./taken-in.js";
import type { TakeInRequest } from "./take-in-port.js";
import { restoreWriteBackIds } from "./write-back-ids.js";

type HeldBase = Extract<WriteBackBaseDecision, { kind: "held" }>;
type CopyBase = Extract<RecoveredBase, { kind: "copy" }>;
type BaseContext = BaseSelectionContext & { readonly memo: HistoryMemo };
const LABEL = { actor: "checkout", time: new Date(0).toISOString() };

/** Select the carried base only where every possible base gives the same merge without a clash. */
export async function selectStamplessBase(
  context: BaseContext, request: TakeInRequest, content: string,
): Promise<StoreResult<WriteBackBaseDecision>> {
  const blob = request.base.kind === "blob" ? request.base.blob : request.entry.base.blob;
  const carried = await resolveCarriedBase(context, request, content, blob);
  if (carried.status === "refused" || carried.result.kind === "held") return carried;
  const candidates = await possibleBases(context, request, carried.result.base);
  if (candidates.kind === "held") return { status: "ok", result: candidates };
  if (candidates.bases.length === 1) return carried;
  const current = await context.store.read({ reference: request.entry.reference });
  if (current.status === "refused") return current;
  const agreement = await compareCandidates(context, request, candidates.bases, current.result.content, content);
  if (agreement.status === "refused") return { status: "ok", result: { kind: "held",
    mark: { reason: agreement.refusal.condition, remedy: agreement.refusal.remedy } } };
  return agreement.result ? carried : { status: "ok", result: ambiguousBase() };
}

async function compareCandidates(
  context: BaseContext, request: TakeInRequest, candidates: readonly RecoveredBase[], current: string, content: string,
): Promise<StoreResult<boolean>> {
  let agreed: string | undefined;
  for (const base of candidates) {
    const prior = base.kind === "stored" ? await readHistoricalBaseContent(context, request.entry, base.version)
      : { status: "ok" as const, result: base.kind === "copy" ? base.content : "" };
    if (prior.status === "refused") return prior;
    const merged = mergeCandidate(request, base, prior.result, current, content);
    if (merged.conflicts.length > 0 || (agreed !== undefined && agreed !== merged.content)) {
      return { status: "ok", result: false };
    }
    agreed = merged.content;
  }
  return { status: "ok", result: true };
}

async function resolveCarriedBase(
  context: BaseContext, request: TakeInRequest, content: string, blob: string,
): Promise<StoreResult<WriteBackBaseDecision>> {
  const selected = (base: RecoveredBase): StoreResult<WriteBackBaseDecision> => ({ status: "ok", result: { kind: "selected", base, stamp: blob } });
  if (blob === request.entry.base.blob) return selected({ kind: "stored", version: request.entry.base.version });
  const replaced = request.entry.inProgress?.replaces;
  if (replaced?.blob === blob) return selected({ kind: "stored", version: replaced.version });
  const history = await context.memo.read(request.entry.reference);
  if (history.status === "refused") return history;
  const found = history.result.find(each => each.content !== null && gitBlobId(each.content, context.format) === blob);
  if (found?.version !== undefined && found.version !== null) return selected({ kind: "stored", version: found.version });
  const kept = request.entry.persisted?.takenIn;
  const copy = kept?.kind === "copy" ? await keptCopy(context, kept.name) : undefined;
  if (copy?.kind === "held") return { status: "ok", result: copy };
  const recovered = await recoverBase({ content, entry: request.entry, format: context.format, memo: context.memo,
    readCopy: () => {
      if (copy === undefined) throw new Error("Recovery requested a retained base the entry does not name");
      return Promise.resolve(copy.content);
    } });
  return recovered.status === "refused" ? recovered : selected(recovered.result);
}

async function possibleBases(
  context: BaseContext, request: TakeInRequest, carried: RecoveredBase,
): Promise<{ kind: "bases"; bases: RecoveredBase[] } | HeldBase> {
  const bases: RecoveredBase[] = [carried];
  const replaced = request.entry.inProgress?.replaces;
  if (request.copy === null && replaced !== undefined) bases.push({ kind: "stored", version: replaced.version });
  const takenIn = request.entry.persisted?.takenIn;
  if (takenIn !== undefined) {
    bases.push({ kind: "stored", version: takenIn.version });
    if (takenIn.kind === "copy") {
      const copy = await keptCopy(context, takenIn.name);
      if (copy.kind === "held") return copy;
      bases.push(copy);
    }
  }
  const unique = new Map<string, RecoveredBase>();
  for (const base of bases) {
    const key = base.kind === "stored" ? `stored:${base.version}` : base.kind === "copy" ? `copy:${gitBlobId(base.content, context.format)}` : "empty";
    unique.set(key, base);
  }
  return { kind: "bases", bases: [...unique.values()] };
}

async function keptCopy(context: BaseSelectionContext, name: string): Promise<CopyBase | HeldBase> {
  try {
    return { kind: "copy", content: await readTakenInCopy(context.location, name) };
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error)) throw error;
    return { kind: "held", mark: { reason: `The retained write-back base cannot be read: ${error.message}`,
      remedy: { text: "Restore the retained base copy or recover a projection from readable stored content, then retry." } } };
  }
}

function ambiguousBase(): HeldBase {
  return { kind: "held", mark: { reason: "ambiguous-base", remedy: {
    text: "The save's possible bases give different merges; keep this file and resolve its intended changes against the stored content.",
  } } };
}

function mergeCandidate(request: TakeInRequest, base: RecoveredBase, prior: string, current: string, incoming: string) {
  const grammar = KIND_REGISTRY[request.entry.reference.kind].entry;
  if (grammar !== undefined) {
    const restored = restoreWriteBackIds({ reference: request.entry.reference, base: prior, content: incoming, grammar });
    incoming = stampEntryIds(restored.content, grammar, restored.random);
  }
  const input = { base: prior, baseVersion: base.kind === "stored" ? base.version : null, current, incoming,
    record: request.entry.reference, currentLabel: LABEL, incomingLabel: LABEL };
  return grammar === undefined ? mergeLineText(input) : mergeEntryText(input, grammar);
}
