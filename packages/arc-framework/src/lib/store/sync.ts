/** Independent sync states, remote pulls, and measured family-scoped publications. */

import { z } from "zod";
import { RemoteFailureReasonSchema } from "../kernel/index.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "./identity.js";
import { CommitShaSchema } from "./links.js";
import { FamilyIdSchema } from "./read.js";
import { HistoryRefSchema, PublishFailureSchema, RemedySchema } from "./refusal.js";

const families = z.array(FamilyIdSchema).min(1);
const condition = z.string().trim().min(1);
const measured = { retryCount: z.number().int().nonnegative(), waitedMs: z.number().nonnegative() };
const explained = { condition, remedy: RemedySchema };

/** Configuration and move states are independent of failed remote operations. */
export const SyncStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("no-remote") }),
  z.strictObject({ status: z.literal("no-identity"), families, remedy: RemedySchema }),
  z.strictObject({ status: z.literal("designation-ambiguous"), remotes: z.array(z.string().min(1)), remedy: RemedySchema }),
  z.strictObject({ status: z.enum(["move-incomplete", "move-unfinished"]), ...explained }),
  z.strictObject({ status: z.literal("moved"), remote: z.string().min(1), remedy: RemedySchema }),
  z.strictObject({ status: z.literal("designation-needed"), remote: z.string().min(1),
    choices: z.array(z.enum(["push", "read", "off"])).min(1), remedy: RemedySchema }),
]);
/** One independently reported configuration state. */
export type SyncState = z.infer<typeof SyncStateSchema>;
const states = z.array(SyncStateSchema).refine(
  (values) => new Set(values.map((state) => state.status)).size === values.length,
  "A sync state is reported only once",
);

/** Optional ended-item history to fetch beside the live namespaces. */
export const PullInputSchema = z.strictObject({ history: z.array(HistoryRefSchema).optional() });
/** Fetch selection supplied by a caller. */
export type PullInput = z.infer<typeof PullInputSchema>;
/** Optional code publication carried beside state, with an explicit rewrite lease. */
export const PushInputSchema = z.strictObject({ carry: z.strictObject({ ref: z.string().min(1), expect: CommitShaSchema.optional() }).optional() });
/** Publication input supplied by a caller. */
export type PushInput = z.infer<typeof PushInputSchema>;

/** Per-ref and per-item observations survive beside partially applied pull failures. */
export const PullNoticeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("history-diverged"), ref: z.string().min(1), local: CommitShaSchema, remote: CommitShaSchema, ...explained }),
  z.strictObject({ kind: z.literal("tracking-update-failed"), ref: z.string().min(1), ...explained }),
  z.strictObject({ kind: z.literal("ended-with-conflicts"), item: OwnerIdentitySchema, conflicts: z.array(RecordReferenceSchema) }),
  z.strictObject({ kind: z.enum(["end-withdrawn", "ended-twice"]), item: OwnerIdentitySchema, ...explained }),
  z.strictObject({ kind: z.literal("rule-broken"), reference: RecordReferenceSchema, rule: z.string().min(1), ...explained }),
  z.strictObject({ kind: z.literal("end-pending"), item: OwnerIdentitySchema, ref: z.string().min(1), ...explained }),
  z.strictObject({ kind: z.literal("namespace-corrupt"), ref: z.string().min(1), ...explained }),
]);
/** A notice raised while applying fetched state. */
export type PullNotice = z.infer<typeof PullNoticeSchema>;
const pulled = { remote: z.string().min(1), families, notices: z.array(PullNoticeSchema) };
const pullFailure = z.union([PublishFailureSchema.options[1], PublishFailureSchema.options[2]]);
/** Only a failed presence read can report the candidate role. */
export const PullOutcomeSchema = z.union([
  z.strictObject({ status: z.enum(["pulled", "noop"]), role: z.enum(["state", "read"]), ...pulled }),
  z.strictObject({ status: z.literal("failed"), role: z.enum(["state", "read", "candidate"]), failure: pullFailure, ...pulled }),
]);
/** The result of fetching one remote, including its partial notices. */
export type PullOutcome = z.infer<typeof PullOutcomeSchema>;
/** A fetch-only result publishes no family. */
export const PullResultSchema = z.strictObject({ states, pulls: z.array(PullOutcomeSchema) });
/** Configuration states and remote pull results. */
export type PullResult = z.infer<typeof PullResultSchema>;

/** A publish names its families and measures the settling retry loop. */
export const PublishOutcomeSchema = z.union([
  z.strictObject({ status: z.enum(["pushed", "noop", "reconciled"]), families, ...measured }),
  z.strictObject({ status: z.literal("failed"), families, failure: PublishFailureSchema, ...measured }),
  z.strictObject({
    status: z.enum(["conflict", "blocked", "unpublished-history", "history-diverged", "compaction-lineage", "proof-unavailable"]),
    families, ...explained,
  }),
]);
/** A publication outcome, including interim notes-only conditions. */
export type PublishOutcome = z.infer<typeof PublishOutcomeSchema>;
/** A carried code ref's refusal is independent of state publication. */
export const CarryRefusalSchema = z.enum([
  "non-fast-forward", "fetch-first", "stale-info", "raced", "remote-rejected", "hook-declined", "no-push-destination",
]);
/** The closed carried-ref rejection vocabulary. */
export type CarryRefusal = z.infer<typeof CarryRefusalSchema>;
/** Preserve the carried code ref's own disposition. */
export const CarryOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ ref: z.string().min(1), status: z.literal("pushed") }),
  z.strictObject({ ref: z.string().min(1), status: z.literal("refused"), reason: CarryRefusalSchema, message: z.string().min(1) }),
  z.strictObject({ ref: z.string().min(1), status: z.literal("unreachable"), cause: RemoteFailureReasonSchema }),
]);
/** A carried code ref's result. */
export type CarryOutcome = z.infer<typeof CarryOutcomeSchema>;
/** Pulls remain ordered across every attempt of the publishing loop. */
export const PushResultSchema = z.strictObject({ states, pulls: z.array(PullOutcomeSchema), publishes: z.array(PublishOutcomeSchema), carry: CarryOutcomeSchema.optional() });
/** Complete publishing result, including independent code-ref and family failures. */
export type PushResult = z.infer<typeof PushResultSchema>;
/** Backends without Git maintenance report null rather than fabricated measurements. */
export const MaintainResultSchema = z.strictObject({ measurements: z.array(z.strictObject({
  ref: z.string().min(1), commits: z.number().int().nonnegative(), diskBytes: z.number().int().nonnegative(),
})).nullable() });
/** Per-ref growth measurements, or no measurement capability. */
export type MaintainResult = z.infer<typeof MaintainResultSchema>;
