/** Pure validation and rendering for the `arc locus` read surface. */

import {
  LocusEnvelopeV1Schema,
  type LocusEnvelopeV1,
  type LocusRowV1,
} from "../lib/locus/schema/index.js";

/** Validate one producer result before it reaches stdout. */
export function validateLocusEnvelope(value: unknown): LocusEnvelopeV1 {
  return LocusEnvelopeV1Schema.parse(value);
}

/** Render a successful roster as stable, plain human-readable text. */
export function formatLocusEnvelope(envelope: Extract<LocusEnvelopeV1, { ok: true }>): string {
  const blocks = envelope.rows.map(formatRow);
  const diagnostics = envelope.diagnostics.map(formatDiagnostic);
  return [
    `Primary: ${envelope.primaryPath}`,
    ...blocks.flatMap((block, index) => index === 0 ? block : ["", ...block]),
    ...(diagnostics.length === 0 ? [] : ["", ...diagnostics]),
    "",
  ].join("\n");
}

function formatRow(row: LocusRowV1): string[] {
  const role = row.role !== null
    ? `${row.role.kind} (${row.role.subject.kind}:${row.role.subject.key})`
    : row.identity !== null
      ? `identity-only (${row.identity.kind}:${row.identity.key})`
      : "-";
  return [
    `Checkout: ${row.checkoutPath ?? "-"}`,
    `Role: ${role}`,
    `Lease: ${row.lease?.state ?? "absent"}`,
    `Session home: ${row.lease?.sessionHomePath ?? "-"}`,
    `Active session locus: ${row.frame ?? "-"}`,
    `Workflow/stage: ${row.derived?.workflow ?? "-"} / ${row.derived?.stage ?? "-"}`,
    ...row.diagnostics.map(formatDiagnostic),
  ];
}

function formatDiagnostic(item: LocusRowV1["diagnostics"][number]): string {
  return `Diagnostic: ${item.code} (${item.source.kind}:${item.source.key}) ${item.message}`;
}
