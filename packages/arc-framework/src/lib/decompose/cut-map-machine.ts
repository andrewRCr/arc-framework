/** Store-native decomposition machine identities. */
import { z } from "zod";
import { canonicalDigest, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import { SlugSchema } from "../kernel/index.js";
import { CanonicalDigestSchema } from "../kernel/schema/vocabulary.js";
import { V3DecomposeLocatorSchema } from "../work-unit/decompose-content.js";
/** Identify a source unit independently of its content. */
export function cutSourceId(source: { sourceLocator: unknown }): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 4, sourceLocator: V3DecomposeLocatorSchema.parse(source.sourceLocator) });
}
/** Identify a dependent independently of its current name and other edges. */
export function cutIncomingEdgeId(edge: { dependent: { slug: string; uid: string } }): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 4, kind: "incoming", uid: edge.dependent.uid });
}
/** Identify a provider by generation, or by slug when no unique generation resolves. */
export function cutOutgoingEdgeId(edge: { provider: { slug: string; uid?: string } }): CanonicalDigest {
  const provider = edge.provider.uid === undefined ? { slug: edge.provider.slug } : { uid: edge.provider.uid };
  return canonicalDigest({ schemaVersion: 4, kind: "outgoing", provider });
}
/** Bind all machine facts to one preflight identity. */
export function cutPreflightId(value: CutMapMachineFacts): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 4, ...facts.parse(value) });
}

/** Closed machine envelope for a cut over stored records. */
export const CutBasenameSchema = z.string().min(1).refine(value =>
  !value.includes("/") && !value.includes("\\") && value !== "." && value !== ".."
  && !value.includes("\0") && value.normalize("NFC") === value, "must be a slash-free NFC basename");
/** Planning artifacts whose units can be allocated by this cut. */
export const CutPlanningProfileSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("draft"), sourceDesign: z.array(CutBasenameSchema).max(1) }),
  z.strictObject({ kind: z.literal("single-spec"), sourceDesign: z.tuple([CutBasenameSchema]) }),
  z.strictObject({ kind: z.literal("paired-spec"), sourceDesign: z.tuple([CutBasenameSchema, CutBasenameSchema]) }),
]);
const origin = z.strictObject({ slug: SlugSchema, uid: z.uuid() });
const provider = z.strictObject({ slug: SlugSchema, uid: z.uuid().optional() });
const facts = z.strictObject({
  origin,
  sourceKind: z.enum(["backlog-stub", "started-planning", "active-origin"]),
  planningProfile: CutPlanningProfileSchema,
  sourceUnits: z.array(z.strictObject({
    sourceId: CanonicalDigestSchema, sourceLocator: V3DecomposeLocatorSchema, contentDigest: CanonicalDigestSchema,
  })),
  incomingEdges: z.array(z.strictObject({ edgeId: CanonicalDigestSchema, dependent: origin })),
  outgoingEdges: z.array(z.strictObject({ edgeId: CanonicalDigestSchema, provider })),
});
/** Closed record-bound preflight envelope, without branch or Git-tree pins. */
export const CutMapMachineSchema = facts.extend({ preflightId: CanonicalDigestSchema });
/** Machine facts before their aggregate identity is derived. */
export type CutMapMachineFacts = z.input<typeof facts>;
/** Machine half of a stored cut map. */
export type CutMapMachine = z.infer<typeof CutMapMachineSchema>;
