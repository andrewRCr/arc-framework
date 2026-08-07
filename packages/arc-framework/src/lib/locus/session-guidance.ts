/** CLI-precomposed locus narration shared by session envelopes. */

import { z } from "zod";

import type { DerivedCheckoutRow } from "./derived-roster.js";
import type { DerivedLocusFrame } from "./derived-reader.js";

const ready = z.strictObject({
  kind: z.literal("ready"),
  currentFrame: z.string().optional(),
  primaryAvailability: z.string().optional(),
  recovery: z.string().optional(),
  reconciliation: z.string().optional(),
  entering: z.string().optional(),
  identityDiscovery: z.string().optional(),
  identities: z.array(z.string()),
  cleanup: z.array(z.string()),
  diagnostics: z.array(z.string()),
});

export const LocusSessionGuidanceSchema = z.discriminatedUnion("kind", [
  ready,
  z.strictObject({ kind: z.literal("unavailable"), message: z.string() }),
]);

export type LocusSessionGuidance = z.infer<typeof LocusSessionGuidanceSchema>;

type DerivedLocusProbe =
  | { ok: true; value: DerivedLocusFrame }
  | { ok: false; error: { kind: string; message: string } };

/** Precompose session-init narration from the entering checkout and row-local facts. */
export function deriveDerivedLocusSessionGuidance(
  probe: DerivedLocusProbe,
): LocusSessionGuidance {
  if (!probe.ok) {
    return {
      kind: "unavailable",
      message: `Derived session locus is unavailable (${probe.error.kind}): ${probe.error.message}`,
    };
  }
  const frame = probe.value;
  if (frame.entering.kind === "unresolved") {
    return {
      kind: "unavailable",
      message: renderEnteringFailure(frame.entering.checkoutPath, frame.entering.diagnostics),
    };
  }
  const row = frame.entering.row;
  if (row.kind === "unresolved-checkout") {
    return {
      kind: "unavailable",
      message: renderEnteringFailure(row.checkout.path, row.diagnostics),
    };
  }
  const primaryAvailability = frame.primaryAvailability.kind === "unsafe"
    ? `Primary checkout ${frame.primaryAvailability.checkoutPath ?? "is unavailable"} is unsafe `
      + `(${frame.primaryAvailability.reasons.join(", ")}); reconcile before allocation.`
    : undefined;
  const identityDiscovery = frame.identityDiscovery.kind === "error"
    ? `Transient identity discovery is unavailable at ${frame.identityDiscovery.stage}: `
      + frame.identityDiscovery.message
    : undefined;
  return LocusSessionGuidanceSchema.parse({
    kind: "ready",
    entering: `${row.kind} at ${row.checkout.path}`,
    ...(primaryAvailability === undefined ? {} : { primaryAvailability }),
    ...(identityDiscovery === undefined ? {} : { identityDiscovery }),
    identities: [],
    cleanup: frame.roster.flatMap(renderDerivedCleanup),
    diagnostics: frame.roster.flatMap((item) => item.diagnostics.map((diagnostic) =>
      `${diagnostic.code} at checkout '${item.checkout.path}': ${diagnostic.message}`)),
  });
}

/** Precompose recovery narration, including non-blocking stale-parent fallback. */
export function deriveRecoveryLocusSessionGuidance(
  probe: DerivedLocusProbe,
): LocusSessionGuidance {
  const guidance = deriveDerivedLocusSessionGuidance(probe);
  if (!probe.ok || guidance.kind !== "ready" || probe.value.entering.kind !== "selected") {
    return guidance;
  }
  const entering = probe.value.entering.row;
  if (entering.kind !== "transient" || entering.parentCheckoutPath === null) return guidance;
  const parentMatches = probe.value.roster.filter((row) =>
    row.checkout.path === entering.parentCheckoutPath
    && row.kind === "work-unit"
    && row.subject.kind === "work-unit"
    && row.context !== null
    && row.context.workflow !== null
    && row.diagnostics.length === 0);
  if (parentMatches.length === 1) return guidance;
  const basePath = probe.value.primaryAvailability.checkoutPath ?? "the configured base checkout";
  return LocusSessionGuidanceSchema.parse({
    ...guidance,
    recovery: `Parent checkout ${entering.parentCheckoutPath} was not found; return to base ${basePath}.`,
  });
}

function renderEnteringFailure(
  checkoutPath: string,
  diagnostics: readonly { readonly code: string; readonly message: string }[],
): string {
  const detail = diagnostics.length === 0
    ? "required checkout facts are unavailable"
    : diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("; ");
  return `Entering checkout ${checkoutPath} is unresolved (${detail}).`;
}

function renderDerivedCleanup(row: DerivedCheckoutRow): string[] {
  if (row.kind === "retired") {
    return [`Cleanup is available for retired checkout ${row.checkout.path}.`];
  }
  if (row.kind === "unresolved-checkout") {
    return [`Inspect checkout ${row.checkout.path} before cleanup.`];
  }
  return [];
}
