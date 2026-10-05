/** Logical lifecycle placement independent of any projected directory. */

import { z } from "zod";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../kernel/index.js";

const active = z.strictObject({ kind: z.literal("active") });
const backlog = z.strictObject({ kind: z.literal("backlog"), commitment: z.enum(["planned", "provisional"]) });
const completed = z.strictObject({ kind: z.literal("completed"), quarter: ArchiveQuarterSchema });
/** Caller-selected placement never supplies an archive sequence or cohort. */
export const WritePlacementSchema = z.union([active, backlog, completed]);
/** Placement of a work unit includes its assigned archive sequence on reads. */
export const WorkUnitReadPlacementSchema = z.union([
  active, backlog, completed.extend({ sequence: ArchiveSequenceSchema }),
]);
/** An Errand cannot enter backlog and is archived without a sequence. */
export const ErrandReadPlacementSchema = z.union([active, completed]);
/** Every logical placement a read can return. */
export const ReadPlacementSchema = z.union([WorkUnitReadPlacementSchema, ErrandReadPlacementSchema]);
/** A caller's placement request. */
export type WritePlacement = z.infer<typeof WritePlacementSchema>;
/** Backend-assigned lifecycle placement. */
export type ReadPlacement = z.infer<typeof ReadPlacementSchema>;
/** Lifecycle locations accepted by listing filters. */
export const LocationSchema = z.enum(["active", "planned", "provisional", "completed"]);
