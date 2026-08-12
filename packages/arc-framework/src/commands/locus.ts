/** Validation and rendering for the derived, read-only `arc locus` surface. */

import { z } from "zod";

import { DerivedLocusFrameValueViewSchema } from "./status/schema.js";
import type { DerivedCheckoutRow } from "../lib/locus/derived-roster.js";
import type { DerivedLocusFrame } from "../lib/locus/derived-reader.js";

const LocusEnvelopeSchema = z.discriminatedUnion("ok", [
  DerivedLocusFrameValueViewSchema.extend({ mode: z.literal("locus"), ok: z.literal(true) }),
  z.strictObject({
    mode: z.literal("locus"),
    ok: z.literal(false),
    error: z.strictObject({ code: z.string().min(1), message: z.string().min(1) }),
  }),
]);

export type LocusEnvelope = ({ readonly mode: "locus"; readonly ok: true } & DerivedLocusFrame)
  | { readonly mode: "locus"; readonly ok: false; readonly error: { readonly code: string; readonly message: string } };

/** Validate one producer result before it reaches stdout. */
export function validateLocusEnvelope(value: unknown): LocusEnvelope {
  return LocusEnvelopeSchema.parse(value) as LocusEnvelope;
}

/** Render the worktree-derived roster without retired occupancy vocabulary. */
export function formatLocusEnvelope(envelope: Extract<LocusEnvelope, { ok: true }>): string {
  const rows = envelope.roster.flatMap((row, index) => index === 0 ? formatRow(row) : ["", ...formatRow(row)]);
  return [...rows, ""].join("\n");
}

function formatRow(row: DerivedCheckoutRow): string[] {
  const subject = row.subject === null
    ? "-"
    : `${row.subject.kind}:${row.subject.key}`;
  return [
    `Checkout: ${row.checkout.path}`,
    `Role: ${row.kind}`,
    `Subject: ${subject}`,
    `Parent checkout: ${row.parentCheckoutPath ?? "-"}`,
    ...row.diagnostics.map((diagnostic) => `Diagnostic: ${diagnostic.code} ${diagnostic.message}`),
  ];
}
