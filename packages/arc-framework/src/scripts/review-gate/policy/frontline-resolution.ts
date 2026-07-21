/** Pure frontline invocation precedence over method activation and router action. */

import { z } from "zod";

import {
  CoreRoutingReasonSchema,
  FrontlineActionSchema,
  type CoreRoutingReason,
  type FrontlineAction,
} from "./routing-schema.js";

const SourceIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const FrontlineInvocationOverrideSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("inherit"), sourceId: SourceIdSchema.optional() }),
  z.strictObject({ mode: z.literal("force"), sourceId: SourceIdSchema.optional() }),
  z.strictObject({ mode: z.literal("skip") }),
]);
export type FrontlineInvocationOverride = z.infer<typeof FrontlineInvocationOverrideSchema>;

export interface FrontlineInvocationResolution {
  action: FrontlineAction;
  effectiveActive: boolean;
  invocationSourceId: string | null;
  reasons: CoreRoutingReason[];
}

function policyReason(action: FrontlineAction): CoreRoutingReason {
  return CoreRoutingReasonSchema.parse(`frontline-policy-${action}`);
}

/** Apply one-run override precedence without persisting activation or touching a carrier. */
export function applyFrontlineInvocationOverride(input: {
  methodActive: boolean;
  routerAction: FrontlineAction;
  invocation?: unknown;
}): FrontlineInvocationResolution {
  const routerAction = FrontlineActionSchema.parse(input.routerAction);
  const invocation = FrontlineInvocationOverrideSchema.parse(input.invocation ?? { mode: "inherit" });
  const reasons: CoreRoutingReason[] = [policyReason(routerAction)];

  if (invocation.mode === "skip") {
    return {
      action: "skip",
      effectiveActive: false,
      invocationSourceId: null,
      reasons: [...reasons, "invocation-skip"],
    };
  }
  if (invocation.mode === "force") {
    return {
      action: "attempt",
      effectiveActive: true,
      invocationSourceId: invocation.sourceId ?? null,
      reasons: [...reasons, "invocation-force"],
    };
  }
  if (!input.methodActive) {
    return {
      action: "skip",
      effectiveActive: false,
      invocationSourceId: null,
      reasons: [...reasons, "frontline-inactive"],
    };
  }
  return {
    action: routerAction,
    effectiveActive: true,
    invocationSourceId: routerAction === "skip" ? null : invocation.sourceId ?? null,
    reasons,
  };
}
