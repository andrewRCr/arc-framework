/** Typed operation outcomes and repair information for store-backed decomposition. */
import { z } from "zod";
import { RemedySchema, StoreRefusalSchema, type StoreRefusal } from "../store/refusal.js";

/** Domain conditions over records; repository candidates and Git pins have no role here. */
export const DecomposeReasonSchema = z.enum([
  "cut-in-flight", "inbound-held", "origin-state", "planning-profile", "source-artifact",
  "source-unit-duplicate", "outgoing-edge-duplicate", "machine-envelope", "source-conflict", "inventory-incomplete",
  "invalid-structure", "unsupported-version", "incomplete-authoring", "machine-order", "machine-identity",
  "authoring-identity", "authoring-order", "source-shape", "companion-disposition", "destination-coverage",
  "placement-cardinality", "shape-cardinality", "stale-machine", "wrong-shape-mode", "name-collision",
  "completed-task", "unwritable-target", "existing-home", "started-edge", "document-home", "provider",
  "purpose", "no-stored-map", "origin-kind", "origin-changed", "member-gone", "seed-divergence",
  "locator-unresolved", "fanout-conflict", "removal-check", "stale-apply-authority", "started-member-removal",
  "started-member-seed", "removed-stub-held", "removed-stub-cut", "removed-cohort-held", "member-renamed",
  "cut-landed", "stored-map-conflict", "cohort-parent", "cohort-origin-name", "member-depends-on-origin",
  "unsupported", "finish-map-operand", "version-conflict",
  "duplicate-destination-identity", "retiring-origin-destination", "incompatible-allocation-locator",
  "incompatible-source-ownership", "origin-reference-remains", "self-dependency", "redundant-external-edge",
  "unchanged-dependency-slot", "retiring-origin-target", "unknown-external-target", "no-new-member",
  "multi-member-cohortless", "placement-member-count", "unexpected-coordination-location", "missing-parent",
]);

const common = {
  status: z.literal("refused"),
  class: z.enum(["recoverable", "terminal"]),
  locus: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  remedy: RemedySchema,
};

/** A refused mode names its condition and preserves the operator's repair boundary. */
export const DecomposeRefusalSchema = z.union([
  z.strictObject({ ...common, reason: DecomposeReasonSchema }),
  z.strictObject({ ...common, reason: z.literal("store"), storeRefusal: StoreRefusalSchema })
    .superRefine((value, ctx) => {
      if (value.class !== value.storeRefusal.class) {
        ctx.addIssue({ code: "custom", path: ["class"], message: "Keep the store refusal's class." });
      }
      if (value.remedy.text !== value.storeRefusal.remedy.text
        || JSON.stringify(value.remedy.argv) !== JSON.stringify(value.storeRefusal.remedy.argv)) {
        ctx.addIssue({ code: "custom", path: ["remedy"], message: "Keep the store refusal's remedy." });
      }
    }),
]);
export type DecomposeRefusal = z.infer<typeof DecomposeRefusalSchema>;

/** Lift a store failure without rewriting its authoritative recovery information. */
export function decomposeStoreRefusal(refusal: StoreRefusal): DecomposeRefusal {
  return { status: "refused", reason: "store", class: refusal.class,
    message: refusal.condition, remedy: refusal.remedy, storeRefusal: refusal };
}

/** Bind a mode's success payload to the shared refusal contract. */
export function decomposeResultSchema<T extends z.ZodType>(result: T) {
  return z.union([z.strictObject({ status: z.literal("ok"), result }), DecomposeRefusalSchema]);
}

/** Mode outcomes keep the success payload typed without erasing refusal details. */
export type DecomposeResult<T> = { status: "ok"; result: T } | DecomposeRefusal;
