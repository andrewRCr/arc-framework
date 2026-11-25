/** Validated design-inventory binding and coverage for delivery plans. */

import { z } from "zod";

import {
  assertCanonicalDigest,
  SlugSchema,
  type CanonicalDigest,
  type KernelRegistry,
} from "../kernel/index.js";
import {
  DeliveryArtifactBasenameSchema,
  DeliveryCanonicalDigestSchema,
  DeliveryOpaqueIdSchema,
} from "./schema.js";

const DesignInventoryArtifactInputSchema = z.strictObject({
  artifactId: DeliveryArtifactBasenameSchema,
  revisionDigest: DeliveryCanonicalDigestSchema,
  form: SlugSchema,
  elements: z.array(z.strictObject({
    elementId: DeliveryOpaqueIdSchema,
    semanticDigest: DeliveryCanonicalDigestSchema,
  })),
});

/** Strict caller-supplied design inventory for one or two form-owned artifacts. */
export const DesignInventoryInputSchema = z.strictObject({
  artifacts: z.array(DesignInventoryArtifactInputSchema).min(1).max(2),
}).superRefine((input, context) => {
  const artifactIds = new Set<string>();
  const forms = new Set<string>();
  const qualifiedElementIds = new Set<string>();
  for (const [artifactIndex, artifact] of input.artifacts.entries()) {
    if (artifactIds.has(artifact.artifactId)) {
      context.addIssue({
        code: "custom",
        message: "artifact ids must be distinct",
        path: ["artifacts", artifactIndex, "artifactId"],
      });
    }
    artifactIds.add(artifact.artifactId);
    if (forms.has(artifact.form)) {
      context.addIssue({
        code: "custom",
        message: "artifact forms must be distinct",
        path: ["artifacts", artifactIndex, "form"],
      });
    }
    forms.add(artifact.form);
    for (const [elementIndex, element] of artifact.elements.entries()) {
      const qualified = qualifyDesignElementId(artifact.form, element.elementId);
      if (qualifiedElementIds.has(qualified)) {
        context.addIssue({
          code: "custom",
          message: "design element ids must be distinct within a form",
          path: ["artifacts", artifactIndex, "elements", elementIndex, "elementId"],
        });
      }
      qualifiedElementIds.add(qualified);
    }
  }
});
export type DesignInventoryInput = z.infer<typeof DesignInventoryInputSchema>;

export const DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID = "delivery-design-inventory-input";
export const DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_VERSION = 1;

/** Compose delivery authoring-input schemas beside the canonical delivery domain. */
export function registerDeliveryAuthoringSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(DesignInventoryInputSchema, {
    id: DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_ID,
    version: DELIVERY_DESIGN_INVENTORY_INPUT_SCHEMA_VERSION,
    migrationPosture: "strict-current", authored: "request",
  });
  return registry;
}

/** One source artifact bound to its exact authored revision. */
export interface BoundDesignArtifact {
  readonly artifactId: string;
  readonly revisionDigest: CanonicalDigest;
}

/** One form-qualified design element and its semantic digest. */
export interface BoundDesignElement {
  readonly elementId: string;
  readonly semanticDigest: CanonicalDigest;
}

/** Canonical design inventory consumed by a delivery plan. */
export interface BoundDesignInventory {
  readonly artifacts: readonly BoundDesignArtifact[];
  readonly elements: readonly BoundDesignElement[];
}

/** Typed design-inventory binding result. */
export type BindDesignInventoryResult =
  | { readonly status: "bound"; readonly inventory: BoundDesignInventory }
  | { readonly status: "refused"; readonly reason: "invalid-design-inventory" };

/** Inputs required to revalidate member and seam design coverage. */
export interface DesignElementCoverageInput {
  readonly inventory: BoundDesignInventory;
  readonly memberDesignElementIds: readonly (readonly string[])[];
  readonly seamDesignElementIds: readonly (readonly string[])[];
}

/** One blocking design-coverage defect. */
export type DesignElementCoverageIssue =
  | { readonly kind: "unknown-design-element-reference"; readonly elementId: string }
  | { readonly kind: "uncovered-design-element"; readonly elementId: string };

/** Result of revalidating member and seam design coverage. */
export type DesignElementCoverageResult =
  | { readonly status: "valid" }
  | { readonly status: "refused"; readonly issues: readonly DesignElementCoverageIssue[] };

/**
 * Validate and bind a caller-supplied design inventory.
 *
 * @param value - Candidate inventory supplied by the design-form authority
 * @returns A canonical binding or a structural refusal
 */
export function bindDesignInventory(value: unknown): BindDesignInventoryResult {
  const parsed = DesignInventoryInputSchema.safeParse(value);
  if (!parsed.success) {
    return { status: "refused", reason: "invalid-design-inventory" };
  }
  return {
    status: "bound",
    inventory: {
      artifacts: parsed.data.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        revisionDigest: canonicalDigestFromSchema(artifact.revisionDigest),
      })),
      elements: parsed.data.artifacts.flatMap((artifact) => artifact.elements.map((element) => ({
        elementId: qualifyDesignElementId(artifact.form, element.elementId),
        semanticDigest: canonicalDigestFromSchema(element.semanticDigest),
      }))),
    },
  };
}

/**
 * Validate member and seam references against the complete bound design inventory.
 *
 * @param input - Bound inventory and all member and seam element references
 * @returns A valid result or typed unknown and uncovered element issues
 */
export function validateDesignElementCoverage(
  input: DesignElementCoverageInput,
): DesignElementCoverageResult {
  const declared = new Set(input.inventory.elements.map((element) => element.elementId));
  const referenced = new Set([
    ...input.memberDesignElementIds.flat(),
    ...input.seamDesignElementIds.flat(),
  ]);
  const unknown = [...referenced].filter((elementId) => !declared.has(elementId));
  const uncovered = [...declared].filter((elementId) => !referenced.has(elementId));
  const issues: DesignElementCoverageIssue[] = [
    ...unknown.map((elementId) => ({
      kind: "unknown-design-element-reference" as const,
      elementId,
    })),
    ...uncovered.map((elementId) => ({
      kind: "uncovered-design-element" as const,
      elementId,
    })),
  ];
  if (issues.length > 0) {
    return {
      status: "refused",
      issues,
    };
  }
  return { status: "valid" };
}

function qualifyDesignElementId(form: string, elementId: string): string {
  return `${form}:${elementId}`;
}

function canonicalDigestFromSchema(value: string): CanonicalDigest {
  assertCanonicalDigest(value);
  return value;
}
