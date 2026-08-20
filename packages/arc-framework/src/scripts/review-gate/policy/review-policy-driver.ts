/** Pure lane, source, pass, and scope resolution for configured review policy. */

import { z } from "zod";

import { GitObjectIdSchema } from "../core/gate-contract-v2-schema.js";
import { CompletedReviewPassCountSchema, ReviewPassSchema } from "../core/review-pass.js";
import {
  OwnerAcceptedReviewTerminusJudgmentSchema,
  OwnerAcceptedReviewTerminusSchema,
} from "./review-terminus.js";
import { StandardReviewObligationProjectionSchema } from "./standard-review-projection-schema.js";

const ReviewSourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
const ReviewPolicyTargetShape = {
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.int().positive().nullable(),
  headSha: GitObjectIdSchema,
};
const ReviewPolicyTargetSchema = z.strictObject(ReviewPolicyTargetShape).readonly();
const ReviewScopeModeSchema = z.enum(["whole-target", "chunked"]);
const FrontlinePolicyInvocationSchema = z.strictObject({
  mode: z.literal("skip"),
}).readonly();
const ReviewAttemptOutcomeSchema = z.enum([
  "clean",
  "findings",
  "settled-findings",
  "rate-limited",
  "transient-unavailable",
  "partial",
  "ambiguous-delivery",
  "malformed",
  "timed-out",
  "stale-target",
  "capability-unsupported",
  "source-unbound",
  "terminal-failure",
]);
const ReviewAttemptSchema = z.strictObject({
  sourceId: ReviewSourceIdSchema,
  outcome: ReviewAttemptOutcomeSchema,
  chunkSeriesComplete: z.boolean().optional(),
}).readonly();
type ReviewAttempt = z.infer<typeof ReviewAttemptSchema>;
const ReviewCeilingOverrideSchema = z.strictObject({
  target: ReviewPolicyTargetSchema,
  lane: z.enum(["frontline", "standard"]),
  exhaustedPassCount: CompletedReviewPassCountSchema,
  nextPass: ReviewPassSchema,
}).readonly();
const InvalidOverrideReasonSchema = z.enum([
  "target-mismatch",
  "lane-mismatch",
  "pass-count-mismatch",
  "next-pass-mismatch",
  "ceiling-not-exhausted",
]);
type InvalidOverrideReason = z.infer<typeof InvalidOverrideReasonSchema>;

const ReviewPolicyRequestBaseShape = {
  schemaVersion: z.literal(1),
  target: ReviewPolicyTargetSchema,
  lane: z.enum(["frontline", "standard"]),
  frontlineActive: z.boolean().default(false),
  standardReview: StandardReviewObligationProjectionSchema,
  completedPasses: CompletedReviewPassCountSchema,
  attempts: z.array(ReviewAttemptSchema).readonly(),
  scopeSelection: z.strictObject({
    mode: ReviewScopeModeSchema,
    target: ReviewPolicyTargetSchema,
  }).readonly().optional(),
  invocation: FrontlinePolicyInvocationSchema.optional(),
  ceilingOverride: ReviewCeilingOverrideSchema.optional(),
  terminus: OwnerAcceptedReviewTerminusSchema.optional(),
};

export const ReviewPolicyCommandRequestSchema = z.strictObject({
  ...ReviewPolicyRequestBaseShape,
}).superRefine((request, context) => {
  if (request.lane === "standard" && request.invocation !== undefined) {
    context.addIssue({
      code: "custom",
      message: "frontline invocation override cannot be applied to the standard lane",
      path: ["invocation"],
    });
  }
  if (request.lane !== "standard" && request.terminus !== undefined) {
    context.addIssue({
      code: "custom",
      message: "owner-accepted terminus can be applied only to the standard lane",
      path: ["terminus"],
    });
  }
}).readonly();
export type ReviewPolicyCommandRequest = z.infer<typeof ReviewPolicyCommandRequestSchema>;

/**
 * The per-lane inputs above that are judgment rather than repository state.
 *
 * `scopeSelection` and `ceilingOverride` each carry a target, and `ceilingOverride` a lane, which a
 * caller composing against a resolved target should not restate — the mismatch refusals exist for
 * callers that assemble the whole request. This is the judgment half alone, for a caller that holds
 * the bounded scope decision or the exhausted-ceiling approval but not the target.
 */
export const ReviewLaneJudgmentSchema = z.strictObject({
  scopeMode: ReviewScopeModeSchema.optional(),
  invocation: FrontlinePolicyInvocationSchema.optional(),
  ceilingOverride: z.strictObject({
    exhaustedPassCount: CompletedReviewPassCountSchema,
    nextPass: ReviewPassSchema,
  }).readonly().optional(),
  terminus: OwnerAcceptedReviewTerminusJudgmentSchema.optional(),
}).readonly();
export type ReviewLaneJudgment = z.infer<typeof ReviewLaneJudgmentSchema>;

export const ReviewPolicyRequestSchema = z.strictObject({
  ...ReviewPolicyRequestBaseShape,
  sources: z.array(ReviewSourceIdSchema).readonly(),
  maxPasses: ReviewPassSchema,
}).superRefine((request, context) => {
  if (request.lane === "standard" && request.invocation !== undefined) {
    context.addIssue({
      code: "custom",
      message: "frontline invocation override cannot be applied to the standard lane",
      path: ["invocation"],
    });
  }
  if (request.lane !== "standard" && request.terminus !== undefined) {
    context.addIssue({
      code: "custom",
      message: "owner-accepted terminus can be applied only to the standard lane",
      path: ["terminus"],
    });
  }
  let previousSourceIndex = -1;
  const scope = request.scopeSelection?.mode ?? "whole-target";
  for (const [attemptIndex, attempt] of request.attempts.entries()) {
    const sourceIndex = request.sources.indexOf(attempt.sourceId);
    if (sourceIndex <= previousSourceIndex) {
      context.addIssue({
        code: "custom",
        message: "attempts must be an ordered unique subsequence of configured sources",
        path: ["attempts", attemptIndex, "sourceId"],
      });
    }
    if (!isSafeUnavailable(attempt.outcome) && attemptIndex !== request.attempts.length - 1) {
      context.addIssue({
        code: "custom",
        message: "no source may be attempted after a non-fall-through outcome",
        path: ["attempts", attemptIndex, "outcome"],
      });
    }
    if (sourceDiagnostic(attempt.sourceId, request.lane, scope, request.target.pullRequest) !== null) {
      context.addIssue({
        code: "custom",
        message: "attempt source is ineligible for the selected lane, scope, or target",
        path: ["attempts", attemptIndex, "sourceId"],
      });
    }
    previousSourceIndex = sourceIndex;
  }
}).readonly();
export type ReviewPolicyRequest = z.infer<typeof ReviewPolicyRequestSchema>;

const ReviewResolveHeaderShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-resolve"),
  diagnostics: z.array(z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
  })),
};

export const ReviewResolveEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("select-scope"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      consumedPass: z.literal(false),
      selectedTarget: ReviewPolicyTargetSchema,
      currentTarget: ReviewPolicyTargetSchema,
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("owner-accepted"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      lane: z.literal("standard"),
      scope: ReviewScopeModeSchema,
      completedPasses: CompletedReviewPassCountSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      terminus: OwnerAcceptedReviewTerminusSchema,
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("skipped"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      lane: z.literal("frontline"),
      scope: ReviewScopeModeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      reason: z.enum(["inactive", "no-source", "invocation-skip"]),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("no-op"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      lane: z.literal("standard"),
      scope: ReviewScopeModeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("invalid-override"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      reason: InvalidOverrideReasonSchema,
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("approval-required"),
    nextAction: z.literal("obtain-ceiling-override"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      consequence: z.strictObject({
        target: ReviewPolicyTargetSchema,
        lane: z.enum(["frontline", "standard"]),
        exhaustedPassCount: CompletedReviewPassCountSchema,
        nextPass: ReviewPassSchema,
      }).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("chunk-pending"),
    nextAction: z.literal("continue-chunks"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: z.literal("chunked"),
      sourceId: ReviewSourceIdSchema,
      pass: ReviewPassSchema,
      completedPasses: CompletedReviewPassCountSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("pass-complete"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      sourceId: ReviewSourceIdSchema,
      pass: ReviewPassSchema,
      completedPasses: CompletedReviewPassCountSchema,
      consumedPass: z.literal(true),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("findings"),
    nextAction: z.literal("respond"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      sourceId: ReviewSourceIdSchema,
      pass: ReviewPassSchema,
      completedPasses: CompletedReviewPassCountSchema,
      consumedPass: z.literal(true),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      consequence: z.literal("disposition-required"),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      sourceId: ReviewSourceIdSchema,
      outcome: ReviewAttemptOutcomeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("unavailable"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      ineligibleSources: z.array(ReviewSourceIdSchema).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("awaiting-change-request"),
    nextAction: z.literal("open-change-request"),
    payload: z.strictObject({
      lane: z.literal("standard"),
      scope: z.literal("whole-target"),
      consumedPass: z.literal(false),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      waitingSources: z.array(ReviewSourceIdSchema).min(1).readonly(),
    }),
  }),
  z.strictObject({
    ...ReviewResolveHeaderShape,
    state: z.literal("ready"),
    nextAction: z.enum(["run-frontline", "local-prepare", "hosted-request"]),
    payload: z.strictObject({
      lane: z.enum(["frontline", "standard"]),
      scope: ReviewScopeModeSchema,
      sourceId: ReviewSourceIdSchema,
      pass: ReviewPassSchema,
      maxPasses: ReviewPassSchema,
      consumedPass: z.literal(false),
      ceilingOverrideApplied: z.boolean(),
      attemptedSources: z.array(ReviewAttemptSchema).readonly(),
      ineligibleSources: z.array(ReviewSourceIdSchema).readonly(),
    }),
  }),
]);
export type ReviewResolveEnvelope = z.infer<typeof ReviewResolveEnvelopeSchema>;

type ReviewDiagnostic = ReviewResolveEnvelope["diagnostics"][number];
type ReviewNextAction = Extract<ReviewResolveEnvelope, { state: "ready" }>["nextAction"];

interface ReviewSourceCapability {
  lanes: readonly ReviewPolicyRequest["lane"][];
  scopes: readonly z.infer<typeof ReviewScopeModeSchema>[];
  requiresPullRequest: boolean;
  nextAction: ReviewNextAction;
}

const REVIEW_SOURCE_CAPABILITIES: Readonly<Record<string, ReviewSourceCapability>> = {
  "coderabbit-cli": {
    lanes: ["frontline"],
    scopes: ["whole-target", "chunked"],
    requiresPullRequest: false,
    nextAction: "run-frontline",
  },
  "coderabbit-pr": {
    lanes: ["standard"],
    scopes: ["whole-target"],
    requiresPullRequest: true,
    nextAction: "hosted-request",
  },
  "codex-pr": {
    lanes: ["standard"],
    scopes: ["whole-target"],
    requiresPullRequest: true,
    nextAction: "hosted-request",
  },
  "delegated-agent": {
    lanes: ["standard"],
    scopes: ["whole-target", "chunked"],
    requiresPullRequest: false,
    nextAction: "local-prepare",
  },
};

function resolveEnvelope(
  body: Omit<ReviewResolveEnvelope, "schemaVersion" | "mode" | "diagnostics">,
  diagnostics: readonly ReviewDiagnostic[] = [],
): ReviewResolveEnvelope {
  return ReviewResolveEnvelopeSchema.parse({
    schemaVersion: 1,
    mode: "review-resolve",
    diagnostics,
    ...body,
  });
}

function sourceDiagnostic(
  sourceId: string,
  lane: ReviewPolicyRequest["lane"],
  scope: z.infer<typeof ReviewScopeModeSchema>,
  pullRequest: number | null,
): ReviewDiagnostic | null {
  const capability = REVIEW_SOURCE_CAPABILITIES[sourceId];
  if (capability === undefined) {
    return { code: "unknown-source", message: `Review source '${sourceId}' has no registered capability.` };
  }
  if (!capability.lanes.includes(lane)) {
    return { code: "source-lane-ineligible", message: `Review source '${sourceId}' cannot satisfy the ${lane} lane.` };
  }
  if (!capability.scopes.includes(scope)) {
    return { code: "source-scope-ineligible", message: `Review source '${sourceId}' cannot satisfy ${scope} scope.` };
  }
  if (capability.requiresPullRequest && pullRequest === null) {
    return { code: "source-awaits-change-request", message: `Review source '${sourceId}' requires a pull request.` };
  }
  return null;
}

/**
 * Resolve the next allowed action for one review lane without executing a source or persisting state.
 *
 * @param input - Exact target, selected lane, configured sources, and caller-owned progress.
 * @returns A strict transition envelope naming the next allowed action.
 */
export function resolveReviewPolicy(input: unknown): ReviewResolveEnvelope {
  const request = ReviewPolicyRequestSchema.parse(input);
  const scope = request.scopeSelection?.mode ?? "whole-target";
  if (request.scopeSelection !== undefined
    && !sameTarget(request.scopeSelection.target, request.target)) {
    return resolveEnvelope({
      state: "stale-target",
      nextAction: "select-scope",
      payload: {
        lane: request.lane,
        consumedPass: false,
        selectedTarget: request.scopeSelection.target,
        currentTarget: request.target,
      },
    }, [{
      code: "stale-scope-target",
      message: "The selected review scope does not belong to the current target.",
    }]);
  }
  if (request.lane === "frontline" && request.invocation?.mode === "skip") {
    return resolveEnvelope({
      state: "skipped",
      nextAction: "none",
      payload: {
        lane: "frontline",
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        reason: "invocation-skip",
      },
    });
  }
  if (request.lane === "frontline"
    && (!request.frontlineActive || request.sources.length === 0)) {
    return resolveEnvelope({
      state: "skipped",
      nextAction: "none",
      payload: {
        lane: "frontline",
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        reason: request.frontlineActive ? "no-source" : "inactive",
      },
    });
  }
  if (request.lane === "standard"
    && (request.sources.length === 0 || request.standardReview.obligation === "exempt")) {
    return resolveEnvelope({
      state: "no-op",
      nextAction: "none",
      payload: {
        lane: "standard",
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
      },
    });
  }
  const invalidOverrideReason = resolveInvalidOverrideReason(request);
  if (invalidOverrideReason !== null) {
    return resolveEnvelope({
      state: "invalid-override",
      nextAction: "stop",
      payload: {
        lane: request.lane,
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        reason: invalidOverrideReason,
      },
    }, [{
      code: `ceiling-override-${invalidOverrideReason}`,
      message: `The review ceiling override is invalid: ${invalidOverrideReason}.`,
    }]);
  }
  const ceilingOverrideApplied = request.ceilingOverride !== undefined;
  const lastAttempt = request.attempts.at(-1);
  if (lastAttempt !== undefined
    && !isSafeUnavailable(lastAttempt.outcome)
    && lastAttempt.outcome !== "clean"
    && lastAttempt.outcome !== "findings"
    && lastAttempt.outcome !== "settled-findings") {
    return resolveEnvelope({
      state: "blocked",
      nextAction: "stop",
      payload: {
        lane: request.lane,
        scope,
        sourceId: lastAttempt.sourceId,
        outcome: lastAttempt.outcome,
        consumedPass: false,
        attemptedSources: request.attempts,
      },
    }, [{
      code: `source-outcome-${lastAttempt.outcome}`,
      message: `Review source '${lastAttempt.sourceId}' returned ${lastAttempt.outcome}.`,
    }]);
  }
  if (lastAttempt !== undefined
    && ["clean", "findings", "settled-findings"].includes(lastAttempt.outcome)) {
    const pass = scope === "chunked" && lastAttempt.chunkSeriesComplete !== true
      ? request.completedPasses + 1
      : request.completedPasses;
    if (scope === "chunked" && lastAttempt.chunkSeriesComplete !== true) {
      return resolveEnvelope({
        state: "chunk-pending",
        nextAction: "continue-chunks",
        payload: {
          lane: request.lane,
          scope,
          sourceId: lastAttempt.sourceId,
          pass,
          completedPasses: request.completedPasses,
          consumedPass: false,
          attemptedSources: request.attempts,
        },
      });
    }
    if (lastAttempt.outcome === "findings") {
      return resolveEnvelope({
        state: "findings",
        nextAction: "respond",
        payload: {
          lane: request.lane,
          scope,
          sourceId: lastAttempt.sourceId,
          pass,
          completedPasses: request.completedPasses,
          consumedPass: true,
          attemptedSources: request.attempts,
          consequence: "disposition-required",
        },
      });
    }
    return resolveEnvelope({
      state: "pass-complete",
      nextAction: "none",
      payload: {
        lane: request.lane,
        scope,
        sourceId: lastAttempt.sourceId,
        pass,
        completedPasses: request.completedPasses,
        consumedPass: true,
        attemptedSources: request.attempts,
      },
    });
  }
  if (request.terminus !== undefined) {
    return resolveEnvelope({
      state: "owner-accepted",
      nextAction: "none",
      payload: {
        lane: "standard",
        scope,
        completedPasses: request.completedPasses,
        consumedPass: false,
        attemptedSources: request.attempts,
        terminus: request.terminus,
      },
    });
  }
  if (request.completedPasses >= request.maxPasses
    && !ceilingOverrideApplied) {
    return resolveEnvelope({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      payload: {
        lane: request.lane,
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        consequence: {
          target: request.target,
          lane: request.lane,
          exhaustedPassCount: request.completedPasses,
          nextPass: request.completedPasses + 1,
        },
      },
    }, [{
      code: "review-pass-ceiling-exhausted",
      message: `The ${request.lane} lane has exhausted its configured pass ceiling.`,
    }]);
  }
  const sourceDiagnostics = new Map(request.sources.map((sourceId) => [
    sourceId,
    sourceDiagnostic(sourceId, request.lane, scope, request.target.pullRequest),
  ]));
  const ineligibleSources = request.sources.filter((sourceId) => sourceDiagnostics.get(sourceId) !== null);
  const diagnostics = [...sourceDiagnostics.values()].filter(
    (diagnostic): diagnostic is ReviewDiagnostic => diagnostic !== null,
  );
  const safelyAttempted = new Set(request.attempts
    .filter((attempt) => isSafeUnavailable(attempt.outcome))
    .map((attempt) => attempt.sourceId));
  const reservedHostedSource = request.lane === "standard"
    && scope === "whole-target"
    && request.target.pullRequest === null
    ? request.sources.find((sourceId) =>
        !safelyAttempted.has(sourceId)
        && REVIEW_SOURCE_CAPABILITIES[sourceId]?.requiresPullRequest === true)
    : undefined;
  const firstAvailableSource = request.sources.find((sourceId) =>
    !safelyAttempted.has(sourceId) && sourceDiagnostics.get(sourceId) === null);
  if (reservedHostedSource !== undefined
    && (firstAvailableSource === undefined
      || request.sources.indexOf(reservedHostedSource) < request.sources.indexOf(firstAvailableSource))) {
    return resolveEnvelope({
      state: "awaiting-change-request",
      nextAction: "open-change-request",
      payload: {
        lane: "standard",
        scope: "whole-target",
        consumedPass: false,
        attemptedSources: request.attempts,
        waitingSources: [reservedHostedSource],
      },
    }, diagnostics);
  }
  if (ineligibleSources.length === request.sources.length) {
    return resolveEnvelope({
      state: "unavailable",
      nextAction: "stop",
      payload: {
        lane: request.lane,
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        ineligibleSources,
      },
    }, [
      ...diagnostics,
      { code: "no-eligible-source", message: "No configured review source can satisfy the selected lane and scope." },
    ]);
  }
  const sourceId = request.sources.find((candidate) =>
    !ineligibleSources.includes(candidate) && !safelyAttempted.has(candidate));
  if (sourceId === undefined) {
    return resolveEnvelope({
      state: "unavailable",
      nextAction: "stop",
      payload: {
        lane: request.lane,
        scope,
        consumedPass: false,
        attemptedSources: request.attempts,
        ineligibleSources,
      },
    }, [
      ...diagnostics,
      { code: "safe-fallback-exhausted", message: "Every eligible review source was safely unavailable." },
    ]);
  }
  const selectedCapability = REVIEW_SOURCE_CAPABILITIES[sourceId];
  if (selectedCapability === undefined) {
    throw new Error(`eligible review source '${sourceId}' has no registered capability`);
  }
  return resolveEnvelope({
    state: "ready",
    nextAction: selectedCapability.nextAction,
    payload: {
      lane: request.lane,
      scope,
      sourceId,
      pass: request.completedPasses + 1,
      maxPasses: request.maxPasses,
      consumedPass: false,
      ceilingOverrideApplied,
      attemptedSources: request.attempts,
      ineligibleSources,
    },
  }, diagnostics);
}

function resolveInvalidOverrideReason(
  request: ReviewPolicyRequest,
): InvalidOverrideReason | null {
  const override = request.ceilingOverride;
  if (override === undefined) return null;
  if (!sameTarget(override.target, request.target)) return "target-mismatch";
  if (override.lane !== request.lane) return "lane-mismatch";
  const lastAttempt = request.attempts.at(-1);
  const scope = request.scopeSelection?.mode ?? "whole-target";
  const terminalPassRecorded = lastAttempt !== undefined
    && ["clean", "findings", "settled-findings"].includes(lastAttempt.outcome)
    && (scope !== "chunked" || lastAttempt.chunkSeriesComplete === true);
  const overrideBasePasses = request.completedPasses - (terminalPassRecorded ? 1 : 0);
  if (override.exhaustedPassCount !== overrideBasePasses) return "pass-count-mismatch";
  if (override.nextPass !== overrideBasePasses + 1) return "next-pass-mismatch";
  if (overrideBasePasses < request.maxPasses) return "ceiling-not-exhausted";
  return null;
}

function isSafeUnavailable(outcome: ReviewAttempt["outcome"]): boolean {
  return outcome === "rate-limited" || outcome === "transient-unavailable";
}

function sameTarget(
  left: z.infer<typeof ReviewPolicyTargetSchema>,
  right: z.infer<typeof ReviewPolicyTargetSchema>,
): boolean {
  return left.repository === right.repository
    && left.pullRequest === right.pullRequest
    && left.headSha === right.headSha;
}
