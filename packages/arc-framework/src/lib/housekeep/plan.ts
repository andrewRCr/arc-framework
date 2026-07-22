/** Canonical confirmed housekeeping write plan. */

import { z } from "zod";

import { canonicalDigest, canonicalize, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import { LocusDigestSchema, LocusOpaqueTextSchema } from "../locus/schema/index.js";
import { inspectInboxEntry } from "../user-sync/inbox-writer.js";

const common = { title: LocusOpaqueTextSchema, sourceDigest: LocusDigestSchema };
const intentCommon = { title: LocusOpaqueTextSchema };
const noDestination = ["dismiss", "defer", "retain", "execute-now"] as const;
const entries = [
  ...noDestination.map((disposition) => z.strictObject({ ...common, disposition: z.literal(disposition) })),
  z.strictObject({ ...common, disposition: z.literal("existing-stub"), destination: LocusOpaqueTextSchema }),
  z.strictObject({ ...common, disposition: z.literal("owner-adoption"), destination: LocusOpaqueTextSchema }),
  z.strictObject({
    ...common, disposition: z.literal("new-stub"), destination: LocusOpaqueTextSchema,
    commitment: z.enum(["planned", "provisional"]),
  }),
];
const intentEntries = [
  ...noDestination.map((disposition) => z.strictObject({ ...intentCommon, disposition: z.literal(disposition) })),
  z.strictObject({ ...intentCommon, disposition: z.literal("existing-stub"), destination: LocusOpaqueTextSchema }),
  z.strictObject({ ...intentCommon, disposition: z.literal("owner-adoption"), destination: LocusOpaqueTextSchema }),
  z.strictObject({
    ...intentCommon, disposition: z.literal("new-stub"), destination: LocusOpaqueTextSchema,
    commitment: z.enum(["planned", "provisional"]),
  }),
];

export const HousekeepPlanV1Schema = z.strictObject({
  version: z.literal(1),
  entries: z.array(z.union(entries)).min(1).max(500),
}).superRefine((value, context) => {
  const titles = value.entries.map((entry) => entry.title);
  if (new Set(titles).size !== titles.length) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Entry titles must be unique" });
  }
});

export type HousekeepPlanV1 = z.infer<typeof HousekeepPlanV1Schema>;

export const HousekeepPlanIntentV1Schema = z.strictObject({
  version: z.literal(1),
  entries: z.array(z.union(intentEntries)).min(1).max(500),
}).superRefine((value, context) => {
  const titles = value.entries.map((entry) => entry.title);
  if (new Set(titles).size !== titles.length) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Entry titles must be unique" });
  }
});

export interface ParsedHousekeepPlan {
  readonly plan: HousekeepPlanV1;
  readonly canonicalJson: string;
  readonly digest: CanonicalDigest;
}

/** Parse one bounded exact-key plan and derive its encoding-independent digest. */
export function parseHousekeepPlan(input: string): ParsedHousekeepPlan {
  if (Buffer.byteLength(input, "utf8") > 1_048_576) throw new Error("Housekeeping plan exceeds 1 MiB");
  const plan = HousekeepPlanV1Schema.parse(JSON.parse(input) as unknown);
  const canonicalJson = canonicalize(plan);
  return { plan, canonicalJson, digest: canonicalDigest(plan) };
}

/** Compile one judgment-only routing intent against exact current inbox entry generations. */
export function compileHousekeepPlan(input: string, inboxContent: string): ParsedHousekeepPlan {
  if (Buffer.byteLength(input, "utf8") > 1_048_576) throw new Error("Housekeeping intent exceeds 1 MiB");
  const intent = HousekeepPlanIntentV1Schema.parse(JSON.parse(input) as unknown);
  const plan = {
    version: 1 as const,
    entries: intent.entries.map((entry) => {
      const inspected = inspectInboxEntry(inboxContent, entry.title);
      if (inspected.dispatchId !== null) {
        throw new Error(`USER-INBOX entry '${entry.title}' is already dispatch-bound.`);
      }
      return { ...entry, sourceDigest: inspected.sourceDigest };
    }),
  };
  return parseHousekeepPlan(JSON.stringify(plan));
}

/** Exact execute-now entries whose inbox blocks become dispatch-bound. */
export function executePlanEntries(plan: HousekeepPlanV1): Array<{
  title: string;
  sourceDigest: CanonicalDigest;
}> {
  return plan.entries.flatMap((entry) => entry.disposition === "execute-now"
    ? [{ title: entry.title, sourceDigest: entry.sourceDigest as CanonicalDigest }]
    : []);
}
