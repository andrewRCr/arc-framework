/** Merge projected edits locally when the backend cannot use their selected base. */
import { mergeEntryText } from "../concurrency/entry-merge.js";
import { mergeLineText, type MergeTextInput } from "../concurrency/line-merge.js";
import { stampEntryIds } from "../concurrency/stamp.js";
import type { EntryListConfig } from "../concurrency/entries.js";
import type { Store } from "../contract.js";
import type { RecordReference, RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { StoreRecord } from "../read.js";
import { createMarkerRenderer } from "./marker-render.js";
import { drawCheckoutDifferences } from "./checkout-differences.js";

/** A local clash's complete drawing and the actual stored record it is stamped against. */
export interface CheckoutDrawing { readonly content: string; readonly length: number; readonly record: StoreRecord; readonly basesDisagree?: boolean }
/** A locally merged edit or its unsent drawing. */
export interface CheckoutMerge { content: string; version: RecordVersion; drawing?: CheckoutDrawing }

/** Draw a hold without choosing one of its disagreeing candidate bases. */
export async function prepareAmbiguousDrawing(input: {
  store: Store; reference: RecordReference; content: string; actor: string; mtimeNs: bigint; now?: () => Date;
}): Promise<StoreResult<CheckoutDrawing>> {
  const current = await input.store.read({ reference: input.reference });
  if (current.status === "refused") return current;
  const drawn = drawCheckoutDifferences({ current: current.result.content, incoming: input.content,
    currentLabel: { actor: current.result.version, time: (input.now?.() ?? new Date()).toISOString() },
    incomingLabel: { actor: input.actor, time: new Date(Number(input.mtimeNs / 1_000_000n)).toISOString() } });
  return { status: "ok", result: { ...drawn, record: current.result, basesDisagree: true } };
}

/** Merge from the selected base onto the current record, retaining independent changes. */
export async function mergeCheckoutBase(input: {
  store: Store; reference: RecordReference; base: string; baseVersion: RecordVersion | null; content: string;
  grammar: EntryListConfig | undefined; random?: () => number; actor: string; mtimeNs: bigint; now?: () => Date;
}): Promise<StoreResult<CheckoutMerge>> {
  const current = await input.store.read({ reference: input.reference });
  if (current.status === "refused") return current;
  const observed = (input.now?.() ?? new Date()).toISOString();
  let incoming = input.content;
  if (input.grammar !== undefined) {
    if (input.random === undefined) throw new Error("An entry merge needs the edit's seeded ID stream");
    incoming = stampEntryIds(input.content, input.grammar, input.random);
  }
  const args: MergeTextInput = { record: input.reference, base: input.base, baseVersion: input.baseVersion,
    current: current.result.content, incoming,
    currentLabel: { actor: current.result.version, time: observed },
    incomingLabel: { actor: input.actor, time: new Date(Number(input.mtimeNs / 1_000_000n)).toISOString() } };
  const entry = input.grammar === undefined ? mergeLineText(args) : mergeEntryText(args, input.grammar);
  const merged = entry.conflicts.length === 0 ? entry : mergeLineText(args);
  if (merged.conflicts.length === 0) return { status: "ok", result: { content: merged.content, version: current.result.version } };
  const renderer = createMarkerRenderer([merged.content, ...merged.conflicts.flatMap(conflict => [conflict.current.content, conflict.incoming.content])]);
  const drawn = mergeLineText({ ...args, conflictMarkers: { length: renderer.length,
    render: set => renderer.renderLines(set, { shows: "checkout" }) } });
  return { status: "ok", result: { content: merged.content, version: current.result.version,
    drawing: { record: current.result, content: drawn.content, length: renderer.length } } };
}
