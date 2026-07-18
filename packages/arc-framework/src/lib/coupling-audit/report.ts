/**
 * Deterministic Markdown projection for the coupling-blast-radius audit.
 *
 * @module
 */

import { CouplingAuditValidationError } from "./contracts.js";
import type {
  CouplingScanResult,
  RoutingLedger,
  SurfaceKind,
} from "./types.js";

const SURFACES: readonly SurfaceKind[] = [
  "test",
  "code",
  "workflow",
  "template",
  "prose",
  "config",
];

function tableText(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function codeList(values: readonly string[]): string {
  return values.length === 0
    ? "—"
    : values.map((value) => `\`${tableText(value)}\``).join(", ");
}

function requireSettled(
  result: CouplingScanResult,
  ledger: RoutingLedger,
): void {
  if (result.candidates.unresolved.length !== 0) {
    throw new CouplingAuditValidationError(
      "report",
      "unresolved candidate residue blocks projection",
    );
  }
  if (
    result.classes.some(
      (entry) => entry.volatility === "unresolved" || entry.verdict === null,
    )
  ) {
    throw new CouplingAuditValidationError(
      "report",
      "unresolved class volatility blocks projection",
    );
  }
  if (
    ledger.packets.some(
      (packet) => packet.state !== "captured-awaiting-housekeep",
    )
  ) {
    throw new CouplingAuditValidationError(
      "report",
      "every routing packet must be captured before projection",
    );
  }
  if (result.reportInputs.rankedInventory.length !== result.classes.length) {
    throw new CouplingAuditValidationError(
      "report",
      "ranked inventory must contain one row per class",
    );
  }
  const routedClassIds = new Set(
    ledger.packets.flatMap((packet) => packet.classIds),
  );
  if (
    routedClassIds.size !== result.classes.length ||
    result.classes.some((entry) => !routedClassIds.has(entry.classId))
  ) {
    throw new CouplingAuditValidationError(
      "report",
      "routing ledger must cover every class",
    );
  }
}

/**
 * Render the settled scan result and routing ledger as one stable Markdown report.
 *
 * @param result - Validated canonical scan result.
 * @param ledger - Validated routing ledger bound to the result bytes.
 * @returns Deterministic Markdown with one trailing newline.
 */
export function renderCouplingReport(
  result: CouplingScanResult,
  ledger: RoutingLedger,
): string {
  requireSettled(result, ledger);
  const inventory = result.reportInputs.rankedInventory;
  const residue = inventory[0]?.residueSummary;
  const thresholds = inventory[0]?.thresholdMethod.thresholds;
  if (residue === undefined || thresholds === undefined) {
    throw new CouplingAuditValidationError(
      "report",
      "ranked inventory cannot be empty",
    );
  }

  const lines: string[] = [
    "# Coupling Blast-Radius Audit",
    "",
    "A deterministic projection of the settled coupling inventory and reconciled finding ledger.",
    "",
    "## Provenance and method",
    "",
    `- Manifest digest: \`${result.manifestDigest}\``,
    `- Result digest: \`${ledger.resultDigest}\``,
    `- Corpus: ${result.corpus.fileCount} tracked files; files digest \`${result.corpus.filesDigest}\``,
    `- Classified candidates: ${result.candidates.classified.length}`,
    `- Dismissed candidates: ${result.candidates.dismissed.length}`,
    `- Unresolved candidates: ${result.candidates.unresolved.length}`,
    `- Dispositions: ${residue.exactDispositions} exact; ${residue.bulkDispositions} bulk`,
    "",
    "A class is high fan-out when any surface count reaches its cutoff. Test, code, workflow, template, and config",
    "cutoffs use the observed upper quartile; prose uses the 87.5th percentile. Mixed surfaces rank by maximum",
    "count-to-cutoff ratio, then quadrant verdict, total fan-out, and stable class ID.",
    "",
    `Cutoffs: ${SURFACES.map((surface) => `${surface} ${thresholds[surface]}`).join("; ")}.`,
    "",
    "## Ranked inventory",
    "",
    "Canonical file membership remains in",
    "`packages/arc-framework/audits/coupling-blast-radius/scan-result.json → classes[classId].files`.",
    "",
    "| Class | Rank | Verdict | Fan-out | Hits | Test | Code | Workflow | Template | Prose | Config | Volatility evidence |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const row of inventory) {
    const counts = SURFACES.map((surface) =>
      String(row.surfaceCounts[surface]),
    );
    const evidence = `${row.volatilityEvidence.workUnit}: ${row.volatilityEvidence.source}`;
    lines.push(
      `| <a id="class-${row.classId}"></a>\`${row.classId}\` | ${row.rank} | \`${row.verdict}\` | ${row.fanOut} | ${row.hitCount} | ${counts.join(" | ")} | ${tableText(evidence)} |`,
    );
  }

  lines.push(
    "",
    "## Substrate abstraction input",
    "",
    "| Class | Inventory | Idioms | Evidence records |",
    "| --- | --- | --- | ---: |",
  );
  for (const entry of result.reportInputs.substrateAbstractions) {
    lines.push(
      `| \`${entry.classId}\` | [ranked row](#${entry.inventoryAnchor}) | ${codeList(entry.idioms)} | ${entry.evidenceDigests.length} |`,
    );
  }

  lines.push(
    "",
    "## Placement readers",
    "",
    `Classes: ${codeList(result.reportInputs.placementReaders.classIds)}.`,
    "",
    `Reader idioms: ${codeList(result.reportInputs.placementReaders.idioms)}.`,
    "",
    "| Reader/parser path | Classes | Evidence records |",
    "| --- | --- | ---: |",
  );
  for (const reader of result.reportInputs.placementReaders.readers) {
    lines.push(
      `| \`${reader.path}\` | ${codeList(reader.classIds)} | ${reader.evidenceDigests.length} |`,
    );
  }

  lines.push(
    "",
    "## Routed findings",
    "",
    "| Packet | Target | Concern | Classes | State | Design implication | Grooming recommendation |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const packet of ledger.packets) {
    lines.push(
      `| \`${packet.id}\` | \`${packet.targetSlug}\` | \`${packet.concernId}\` | ${codeList(packet.classIds)} | \`${packet.state}\` | ${tableText(packet.designImplication)} | ${tableText(packet.recommendation)} |`,
    );
  }

  lines.push("", "---", "");
  return lines.join("\n");
}
