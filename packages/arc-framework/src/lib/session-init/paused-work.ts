/** Per-identity pause listing and shared review marks. */
import { z } from "zod";
import { SlugSchema } from "../kernel/index.js";
import { listLifecycleIndex } from "../store/lifecycle-index.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import type { Store } from "../store/contract.js";
import { MetaPauseSchema, ParsedMetaRecordSchema, type MetaPause } from "../active/meta-schema.js";
import { parseLineageRecord } from "../store/kinds/lineage/parser.js";
import type { StoreResult } from "../store/refusal.js";
import { SessionActionsSchema } from "./actions.js";

/** Complete paused-work payload, including each item's waiting context and repair actions. */
export const PausedWorkResultSchema = z.strictObject({
  items: z.array(z.strictObject({
    slug: SlugSchema,
    reason: z.string(),
    open: z.boolean(),
    reviewPrompt: z.string().optional(),
    waitsOn: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("work-unit"), slug: SlugSchema }),
      z.strictObject({ kind: z.literal("note"), text: z.string().min(1) }),
    ]).nullable(),
    marks: z.array(z.enum(["resumable", "review-due"])),
    actions: SessionActionsSchema,
  })),
});
export type PausedWorkResult = z.infer<typeof PausedWorkResultSchema>;

/** Report no paused work while the checkout-backed lifecycle is active. */
export interface RunPausedWorkOptions {
  store: Store; identity: string; reviewAfterDays: number; now?: Date;
  findHoldingCheckout: (slug: string) => Promise<string | null>;
  markerlessCheckouts?: readonly { workUnit: string; checkoutPath: string }[];
}
export function runPausedWork(): PausedWorkResult;
export function runPausedWork(options: RunPausedWorkOptions): Promise<PausedWorkResult>;
/** Keep the dormant projection synchronous and acquire records only for a bound store invocation. */
export function runPausedWork(options?: RunPausedWorkOptions): PausedWorkResult | Promise<PausedWorkResult> {
  return options === undefined ? { items: [] } : readPausedWork(options);
}

async function readPausedWork(options: RunPausedWorkOptions): Promise<PausedWorkResult> {
  if (!options.store.capabilities.stateOffBranch) return { items: [] };
  const listing = unwrap(await listLifecycleIndex(options.store, { locations: ["active"] }));
  requireCompleteInventory(options.store, listing);
  if (listing.status !== "complete") return { items: [] };
  const items: PausedWorkResult["items"] = [];
  for (const entry of listing.index.entries()) {
    if (entry.fields.owner !== options.identity || entry.fields.pause === null) continue;
    const slug = entry.reference.owner.name;
    const pause = MetaPauseSchema.parse(entry.fields.pause);
    const marking = await markPausedWorkItem({ slug, pause }, options);
    const holder = await options.findHoldingCheckout(slug);
    const markerless = options.markerlessCheckouts?.find(pair => pair.workUnit === slug);
    const action = holder !== null ? { text: `arc resume ${slug}`, argv: ["arc", "resume", slug] }
      : markerless !== undefined ? { text: `Run arc materialize ${slug} --here from ${markerless.checkoutPath}.`,
        argv: ["arc", "materialize", slug, "--here"], checkout: markerless.checkoutPath }
        : { text: `arc materialize ${slug}`, argv: ["arc", "materialize", slug] };
    const reviewActions = marking.actions.filter(review => JSON.stringify(review.argv) !== JSON.stringify(action.argv));
    items.push({ slug: SlugSchema.parse(slug), reason: pause.reason, waitsOn: pause.waitsOn, open: pause.open,
      marks: marking.marks, ...(marking.reviewPrompt === undefined ? {} : { reviewPrompt: marking.reviewPrompt }),
      actions: [action, ...reviewActions] });
  }
  items.sort((left, right) => Buffer.compare(Buffer.from(left.slug), Buffer.from(right.slug)));
  return PausedWorkResultSchema.parse({ items });
}

/** Marks shared by the person's session slot and the status surface for any owner. */
export interface PausedWorkMarks {
  marks: ("resumable" | "review-due")[];
  reviewPrompt?: string;
  actions: { text: string; argv?: string[] }[];
}
/** Mark one pause from its original date and logical prerequisite without reading a checkout. */
export async function markPausedWorkItem(item: { slug: string; pause: MetaPause },
  options: { store: Store; reviewAfterDays: number; now?: Date }): Promise<PausedWorkMarks> {
  const waiting = item.pause.waitsOn;
  const disposition = waiting?.kind === "work-unit" ? await waitingWorkDisposition(options.store, waiting.slug) : null;
  const ageDays = ((options.now ?? new Date()).getTime() - new Date(item.pause.since).getTime()) / 86_400_000;
  if (disposition === "shipped") return { marks: ["resumable"], actions: [] };
  if (disposition !== "ended" && (waiting?.kind === "work-unit" || ageDays <= options.reviewAfterDays)) return { marks: [], actions: [] };
  const resume = `arc resume ${item.slug}`;
  const handover = `arc handover ${item.slug} --to <identity>`;
  const open = `arc pause ${item.slug} --open`;
  const abandon = `arc abandon ${item.slug} --yes`;
  return { marks: ["review-due"],
    reviewPrompt: `Review paused work '${item.slug}': ${resume}, ${handover}, ${item.pause.open ? "" : `${open}, or `}${abandon}.`,
    actions: [{ text: resume, argv: ["arc", "resume", item.slug] }, { text: handover },
      ...(item.pause.open ? [] : [{ text: open, argv: ["arc", "pause", item.slug, "--open"] }]),
      { text: abandon, argv: ["arc", "abandon", item.slug, "--yes"] }] };
}
async function waitingWorkDisposition(store: Store, slug: string): Promise<"shipped" | "ended" | "live"> {
  const resolved = await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (resolved.status === "ok") {
    const record = unwrap(await store.read({ reference: resolved.result.reference }));
    if (record.reference.kind !== "work-item/meta" || record.conflicts.length > 0) throw new Error(`Pause prerequisite '${slug}' has no resolved work-unit record. Inspect and repair it before reviewing this pause.`);
    return ParsedMetaRecordSchema.parse(record.fields).state === "Shipped" ? "shipped" : "live";
  }
  if (resolved.refusal.code !== "not-found") throw new Error(`${resolved.refusal.condition} ${resolved.refusal.remedy.text}`);
  const lineage = unwrap(await store.lookup({ kind: "lineage", origin: slug }));
  const record = unwrap(await store.read({ reference: lineage.reference }));
  const terminal = parseLineageRecord(record.content);
  if (terminal === null || record.conflicts.length > 0) throw new Error(`Pause prerequisite '${slug}' has unresolved terminal lineage. Inspect and repair it before reviewing this pause.`);
  return terminal.kind === "abandon" || terminal.kind === "decompose" ? "ended" : "live";
}
function unwrap<T>(result: StoreResult<T>): T {
  if (result.status === "refused") throw new Error(`${result.refusal.condition} ${result.refusal.remedy.text}`);
  return result.result;
}
