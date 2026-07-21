/** Complete, provider-neutral frontline review semantic resolution. */

import { z } from "zod";

import {
  applyFrontlineInvocationOverride,
  type FrontlineInvocationOverride,
} from "./frontline-resolution.js";
import {
  FrontlineSourceDescriptorSchema,
  resolveFrontlineSource,
  type FrontlineSourceDiagnostic,
  type FrontlineSourcePreferenceReader,
  type FrontlineSourceRegistry,
  type FrontlineSourceTier,
} from "./frontline-source.js";
import {
  CoreRoutingReasonSchema,
  FrontlineActionSchema,
  type CoreRoutingReason,
  type FrontlineAction,
} from "./routing-schema.js";

export const FRONTLINE_REVIEW_PROMPT =
  "Review the aggregate candidate change set from a context distinct from the author.";
export const FRONTLINE_BINDING_REMEDY =
  "Bind a frontline review source with arc.frontlineSource, review.frontline_source, or an invocation sourceId.";

const FrontlinePassAllowanceSchema = z.union([z.literal(1), z.literal(2)]);
const FrontlineSemanticRecordSchemaBase = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("frontline-review/v1"),
  action: FrontlineActionSchema,
  reasons: z.array(CoreRoutingReasonSchema).min(1),
  source: FrontlineSourceDescriptorSchema.nullable(),
  maxPasses: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  promptText: z.string().min(1).nullable(),
});

export const FrontlineSemanticRecordSchema = FrontlineSemanticRecordSchemaBase.superRefine((record, context) => {
  if (record.action === "skip") {
    if (record.source !== null || record.maxPasses !== 0 || record.promptText !== null) {
      context.addIssue({
        code: "custom",
        message: "skip requires null source, zero passes, and null prompt",
      });
    }
    return;
  }
  if (record.maxPasses === 0 || record.promptText === null) {
    context.addIssue({
      code: "custom",
      message: "offer and attempt require a pass allowance and prompt",
    });
  }
  if (record.action === "attempt" && record.source === null) {
    context.addIssue({ code: "custom", message: "attempt requires a selected source" });
  }
});
export type FrontlineSemanticRecord = z.infer<typeof FrontlineSemanticRecordSchema>;

export interface FrontlineSemanticResolution {
  frontlineReview: FrontlineSemanticRecord;
  diagnostics: FrontlineSourceDiagnostic[];
}

function sourceReason(tier: FrontlineSourceTier): CoreRoutingReason {
  return CoreRoutingReasonSchema.parse(`source-${tier}`);
}

function promptFor(action: Exclude<FrontlineAction, "skip">, sourceBound: boolean): string {
  return action === "offer" && !sourceBound ? FRONTLINE_BINDING_REMEDY : FRONTLINE_REVIEW_PROMPT;
}

/**
 * Resolve activation, invocation precedence, and source fallback without probing or execution.
 *
 * @param input - Static activation, router action, invocation, source ports, and optional V1 pass allowance.
 * @returns The validated semantic record plus non-authoritative source diagnostics.
 */
export async function resolveFrontlineReview(input: {
  methodActive: boolean;
  routerAction: FrontlineAction;
  invocation?: FrontlineInvocationOverride;
  preferences: FrontlineSourcePreferenceReader;
  registry: FrontlineSourceRegistry;
  maxPasses?: unknown;
}): Promise<FrontlineSemanticResolution> {
  const passAllowance = FrontlinePassAllowanceSchema.parse(input.maxPasses ?? 2);
  const invocation = applyFrontlineInvocationOverride({
    methodActive: input.methodActive,
    routerAction: input.routerAction,
    invocation: input.invocation,
  });

  if (invocation.action === "skip") {
    return {
      frontlineReview: FrontlineSemanticRecordSchema.parse({
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        action: "skip",
        reasons: invocation.reasons,
        source: null,
        maxPasses: 0,
        promptText: null,
      }),
      diagnostics: [],
    };
  }

  const source = await resolveFrontlineSource({
    invocationSourceId: invocation.invocationSourceId ?? undefined,
    preferences: input.preferences,
    registry: input.registry,
  });
  const action = invocation.action === "attempt" && source.source === null
    ? "offer"
    : invocation.action;
  const reasons = [...invocation.reasons, sourceReason(source.sourceTier)];

  return {
    frontlineReview: FrontlineSemanticRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action,
      reasons,
      source: source.source,
      maxPasses: passAllowance,
      promptText: promptFor(action, source.source !== null),
    }),
    diagnostics: source.diagnostics,
  };
}
