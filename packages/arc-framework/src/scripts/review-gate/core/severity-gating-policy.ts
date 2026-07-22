/** Project policy and pure classification for review-finding severity gating. */

import { z } from "zod";

import type { KernelRegistry } from "../../../lib/kernel/index.js";
import { FindingClassificationSchema } from "./review-primitives.js";

const FindingClassificationInputSchema = FindingClassificationSchema.loose();

export const MinorGatingSchema = z.enum(["blocking", "record-only"]);
export type MinorGating = z.infer<typeof MinorGatingSchema>;

export const SeverityGatingPolicySchema = z.strictObject({
  minorGating: MinorGatingSchema,
});
export type SeverityGatingPolicy = z.infer<typeof SeverityGatingPolicySchema>;

/** Framework default; projects may bind ordinary minors more strictly. */
export const PACKAGE_DEFAULT_SEVERITY_GATING_POLICY: SeverityGatingPolicy = {
  minorGating: "record-only",
};

/** Resolve gating from classification and policy without observing disposition or channel. */
export function resolveFindingGating(
  classificationInput: unknown,
  policyInput: unknown = PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
): MinorGating {
  const classification = FindingClassificationInputSchema.parse(classificationInput);
  const policy = SeverityGatingPolicySchema.parse(policyInput);
  if (classification.severity !== "minor") return "blocking";
  return classification.nit === true ? "record-only" : policy.minorGating;
}

/** Register the project-policy severity-gating axis. */
export function registerSeverityGatingPolicySchema(registry: KernelRegistry): KernelRegistry {
  registry.register(SeverityGatingPolicySchema, {
    id: "severity-gating-policy",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
