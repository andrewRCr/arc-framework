/** Complete runtime contract for entering-work-unit uncaptured commits and close repairs. */
import { z } from "zod";
import { SessionActionsSchema } from "../session-init/actions.js";
import { CommitShaSchema } from "../store/links.js";
import { RemedySchema, StoreRefusalSchema } from "../store/refusal.js";
import type { UnclosedTaskCommits } from "./unclosed-task-commits.js";
const timestamp = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable();
/** Read-only listing evidence, retaining unknown headers and every close refusal's remedy. */
export const UnclosedTaskCommitsSchema: z.ZodType<UnclosedTaskCommits> = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("available"), commits: z.array(z.strictObject({ sha: CommitShaSchema, copyKey: z.string().min(1).optional(), authorTime: timestamp, committerTime: timestamp })),
    actions: SessionActionsSchema, warnings: z.array(z.string()) }),
  z.strictObject({ status: z.literal("refused"), code: z.string().min(1), reason: z.string().min(1), remedy: RemedySchema,
    refusal: StoreRefusalSchema.optional(), actions: SessionActionsSchema }),
]);
