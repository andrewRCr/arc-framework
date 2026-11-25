/** Shared read-only Errand startup selection and its typed public result. */
import { SlugSchema } from "../lib/kernel/index.js";
import { basename } from "node:path";
import { resolveArcPath } from "../lib/layout/index.js";
import { z } from "zod";
import { openDefaultStore } from "../handlers/lifecycle-shared.js";
import { resolveQueueExecutionOffer, QueueOfferProblemSchema } from "../lib/inbox/offer.js";
import { resolveExecutionStartupOffer, type ExecutionStartupOfferResolution } from "../lib/user-sync/execution-offer.js";
import type { Store } from "../lib/store/contract.js";
import { withLockedUserInbox, type UserIOContext } from "./user.js";

const ErrandNextOfferSchema = z.strictObject({
  kind: z.literal("errand"),
  key: z.string().min(1),
  parentCheckoutPath: z.null(),
});

/** Typed queue-head result consumed by `arc-session --errand --next`. */
export const ErrandNextResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    leftOut: z.array(QueueOfferProblemSchema).optional(),
    skipped: z.array(QueueOfferProblemSchema).optional(),
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("available"),
    nextAction: z.literal("open-errand"),
    nextOffer: ErrandNextOfferSchema,
    recommendedPromptText: z.string().min(1),
  }),
  z.strictObject({
    leftOut: z.array(QueueOfferProblemSchema).optional(),
    skipped: z.array(QueueOfferProblemSchema).optional(),
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("empty"),
    nextAction: z.literal("none"),
    nextOffer: z.null(),
    recommendedPromptText: z.string().min(1),
  }),
  z.strictObject({
    leftOut: z.array(QueueOfferProblemSchema).optional(),
    skipped: z.array(QueueOfferProblemSchema).optional(),
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("refused"),
    nextAction: z.literal("stop"),
    nextOffer: z.null(),
    reason: z.string().min(1),
    remedy: z.string().min(1),
    retryCommand: z.literal("arc errand next --json"),
    recommendedPromptText: z.string().min(1),
  }),
]);
export type ErrandNextResult = z.infer<typeof ErrandNextResultSchema>;

/** Project one queue read into the closed startup-selection contract. */
export function buildErrandNextResult(
  resolution: ExecutionStartupOfferResolution,
  refusalRemedy?: string,
): ErrandNextResult {
  if (resolution.kind === "refused") {
    const inbox = basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: SlugSchema.parse("identity") } }), ".md");
    const remedy = refusalRemedy ?? resolution.remedy ?? `Repair the reported \`${inbox}\` condition.`;
    return ErrandNextResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-next",
      state: "refused",
      nextAction: "stop",
      nextOffer: null,
      reason: resolution.reason,
      remedy,
      retryCommand: "arc errand next --json",
      recommendedPromptText: "The execute-bound Errand queue could not be read safely: "
        + `${resolution.reason} ${remedy} Retry with \`arc errand next --json\`.`,
    });
  }
  if (resolution.nextOffer === null) {
    return ErrandNextResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-next",
      ...(resolution.leftOut === undefined ? {} : { leftOut: resolution.leftOut, skipped: resolution.skipped }),
      state: "empty",
      nextAction: "none",
      nextOffer: null,
      recommendedPromptText: "No execute-bound Errand is queued.",
    });
  }
  return ErrandNextResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-next",
    ...(resolution.leftOut === undefined ? {} : { leftOut: resolution.leftOut, skipped: resolution.skipped }),
    state: "available",
    nextAction: "open-errand",
    nextOffer: { ...resolution.nextOffer, parentCheckoutPath: null },
    recommendedPromptText: `Next execute-bound Errand: ${resolution.nextOffer.key}.`,
  });
}

/** Select the queue head while preserving project, identity, read, and lock refusals. */
export async function resolveErrandNext(options: {
  cwd: string | null; io: UserIOContext; identity: string | null; store?: Store;
}): Promise<ErrandNextResult> {
  const { cwd, identity } = options;
  if (cwd === null || identity === null) return buildErrandNextResult({ kind: "refused", reason: cwd === null
    ? "ARC project root is unavailable." : "No identity resolved — set arc.identity before selecting an Errand.",
  }, cwd === null ? "Run from an ARC project checkout." : "Set `arc.identity` for this checkout.");
  try {
    return buildErrandNextResult(await resolveCurrentExecutionStartupOffer({
      ...options, cwd, identity, parentCheckoutPath: null,
    }));
  } catch (error) {
    return buildErrandNextResult({ kind: "refused", reason: error instanceof Error ? error.message : String(error) },
      "Resolve the reported identity, inbox read, or lock failure.");
  }
}

async function resolveCurrentExecutionStartupOffer(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  parentCheckoutPath: string | null;
  store?: Store;
}): Promise<ExecutionStartupOfferResolution> {
  const store = options.store ?? openDefaultStore(options.cwd, options.io.exec);
  if (store.capabilities.stateOffBranch) {
    const offer = await resolveQueueExecutionOffer({ store, identity: options.identity, now: () => new Date() }, options.parentCheckoutPath);
    return offer.status === "refused" ? { kind: "refused", reason: offer.refusal.condition, remedy: offer.refusal.remedy.text } : { kind: "resolved", ...offer.result };
  }
  const { postImage } = await withLockedUserInbox(
    { cwd: options.cwd, io: options.io, identity: options.identity, store: options.store },
    () => ({ result: null }),
  );
  if (postImage.state === "missing") {
    return { kind: "resolved", nextOffer: null };
  }
  return resolveExecutionStartupOffer({
    content: postImage.content,
    parentCheckoutPath: options.parentCheckoutPath,
  });
}
