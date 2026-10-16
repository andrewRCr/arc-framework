/** Full standalone and enriched user session status wire contracts. */
import { z } from "zod";
import { StoreSessionInitUserValueSchema } from "../../lib/session-init/store-user-pull.js";

const freshness = z.strictObject({
  state: z.enum(["missing", "current-head", "ancestor", "outside-head-ancestry"]),
  commit: z.string().nullable(), commitShort: z.string().nullable(), ancestorDistance: z.number(),
  reachableFromHead: z.boolean().optional(), currentBranch: z.string().nullable().optional(),
  wuScoped: z.boolean().optional(), seedPresent: z.boolean().optional(),
});
const drift = z.strictObject({
  direction: z.enum(["edits", "missing", "modified", "mixed", "behind"]),
  missingFiles: z.array(z.string()), extraFiles: z.array(z.string()), modifiedFiles: z.array(z.string()),
});
/** Complete notes and disk status emitted by the standalone session probe. */
export const UserSessionInitStatusResultSchema = z.strictObject({
  identity: z.string(), state: z.enum(["disabled", "clean", "remote-ahead", "conflict", "remote-unavailable"]),
  refState: z.enum(["same", "local-ahead", "remote-ahead", "diverged", "remote-unavailable"]).optional(),
  contentRelation: z.enum(["remote-subset", "local-subset", "equal", "mixed-uncontested", "conflicting"]).optional(),
  coherenceState: z.enum(["partial-push", "partial-push-unverified"]).optional(),
  summary: z.string(), detailLines: z.array(z.string()), actionHint: z.string().nullable(), shouldPromptToPull: z.boolean(),
  localNoteFreshness: freshness.optional(), qualifier: z.literal("clean-at-current-head").optional(),
  loadNeeded: z.boolean().optional(), notesDrift: drift.optional(),
});
/** Shared session enrichment after notes/disk drift has been classified. */
export const SessionUserValueSchema = UserSessionInitStatusResultSchema.extend({
  notesDriftSurface: z.strictObject({ direction: z.enum(["edits", "missing", "modified", "mixed"]),
    register: z.enum(["expected", "caution"]) }).optional(),
});
/** Session-init enrichment with the independently composed recommendation. */
export const NotesSessionInitUserValueSchema = SessionUserValueSchema.extend({
  recommendedAction: z.enum(["pull", "prompt", "surface", "skip"]), recommendedPromptText: z.string(),
});

/** User slot admits the legacy notes producer and the off-branch store pull producer. */
export const SessionInitUserValueSchema = z.union([NotesSessionInitUserValueSchema, StoreSessionInitUserValueSchema]).nullable();
