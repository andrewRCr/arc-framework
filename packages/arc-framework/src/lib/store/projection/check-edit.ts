/** Judge a hand edit over the same merged content the store will check. */
import { createKindRegistry } from "../registry.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import { mergeEntryText } from "../concurrency/entry-merge.js";
import { mergeLineText } from "../concurrency/line-merge.js";
import { stampEntryIds } from "../concurrency/stamp.js";
import type { StoreResult } from "../refusal.js";
import type { RefusedMark } from "./index-schema.js";
import type { WriteBackContext } from "./write-back.js";
import type { TakeInRequest } from "./take-in-port.js";
import type { RecoveredBase } from "./base-recovery.js";
import { readBaseContent } from "./base-content.js";
import { createWriteBackAfterView } from "./after-view.js";
import type { StoreRecord } from "../read.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);
const LABEL = { actor: "checkout", time: new Date(0).toISOString() };

interface CheckEditInput {
  context: WriteBackContext; request: TakeInRequest; base: RecoveredBase; content: string; random?: () => number;
}

/** Parse the merged check copy and return every semantic violation with its remedy. */
export async function checkWriteBackEdit(input: CheckEditInput): Promise<StoreResult<readonly RefusedMark[]>> {
  const { context, request } = input;
  const definition = kinds[request.entry.reference.kind];
  const read = await context.store.read({ reference: request.entry.reference });
  if (read.status === "refused" && read.refusal.code !== "not-found") return read;
  const prior = read.status === "ok" ? read.result : undefined;
  const merged = await mergeCheckCopy(input, prior);
  if (merged.status === "refused") return merged;
  const content = merged.result;
  const parsed = definition.parser?.(content);
  if (parsed?.success === false) return { status: "ok", result: [{ reason: parsed.error,
    remedy: { text: "Repair the merged record so its parser accepts it, then save again." } }] };
  const next = { content, fields: parsed?.data };
  const priorParsed = prior === undefined ? undefined : definition.parser?.(prior.content);
  const rules = await definition.check?.({ reference: request.entry.reference,
    ...(prior === undefined ? {} : { prior: { content: prior.content, ...(priorParsed?.success === true ? { fields: priorParsed.data } : {}) } }),
    next, writer: { kind: "hand-edit" }, before: context.store,
    after: createWriteBackAfterView({ before: context.store, reference: request.entry.reference, next, prior }),
    observations: [],
  }) ?? [];
  return { status: "ok", result: rules.map(rule => ({ reason: `${rule.rule}: ${rule.condition}`, remedy: rule.remedy })) };
}

async function mergeCheckCopy(input: CheckEditInput, prior: StoreRecord | undefined): Promise<StoreResult<string>> {
  const { context, request, base } = input;
  const definition = kinds[request.entry.reference.kind];
  if (prior === undefined || definition.merge === "single-writer" || base.kind !== "stored" || prior.version === base.version) {
    return { status: "ok", result: input.content };
  }
  const original = await readBaseContent(context, request.entry, base);
  if (original.status === "refused") return original;
  let incoming = input.content;
  if (definition.entry !== undefined) {
    if (input.random === undefined) throw new Error("An entry check needs the edit's seeded ID stream");
    incoming = stampEntryIds(incoming, definition.entry, input.random);
  }
  const mergeInput = { record: request.entry.reference, base: original.result, baseVersion: base.version,
    current: prior.content, incoming, currentLabel: LABEL, incomingLabel: LABEL };
  const merged = definition.entry === undefined ? mergeLineText(mergeInput) : mergeEntryText(mergeInput, definition.entry);
  return { status: "ok", result: merged.content };
}
