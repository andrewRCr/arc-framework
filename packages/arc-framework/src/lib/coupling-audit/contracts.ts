/**
 * Strict unknown-input parsers for coupling-audit machine artifacts.
 *
 * @module
 */

import type {
  CouplingIdiom,
  CouplingManifest,
  CouplingScanResult,
  QuadrantVerdict,
  RoutingLedger,
  Volatility,
} from "./types.js";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const SURFACE_KINDS = ["test", "workflow", "template", "code", "prose", "config"] as const;
const COUPLING_IDIOMS = [
  "path-literal",
  "directory-state",
  "git-tracked-path",
  "filename-prefix",
  "branch-pattern",
  "config-key",
  "doc-name",
] as const;
const VOLATILITY = ["unresolved", "high", "stable"] as const;
const CORPUS_LOCI = ["package", "installed-delta", "repo-root-delta"] as const;
const QUADRANT_VERDICTS = ["abstract", "change-with-mover", "leave-alone", "retain-local"] as const;

/** Validation error carrying an actionable artifact-field path. */
export class CouplingAuditValidationError extends Error {
  /**
   * Create a contract validation error.
   *
   * @param path - Dot/index path to the invalid field.
   * @param detail - Expected shape or violated invariant.
   */
  constructor(path: string, detail: string) {
    super(`Invalid coupling-audit artifact at ${path}: ${detail}`);
    this.name = "CouplingAuditValidationError";
  }
}

/** A recorded bulk disposition no longer matches its bound member set. */
export class CouplingAuditStaleDispositionError extends Error {
  /** @param dispositionId - Stable manifest disposition identifier. */
  constructor(dispositionId: string) {
    super(`Stale coupling-audit bulk disposition: ${dispositionId}`);
    this.name = "CouplingAuditStaleDispositionError";
  }
}

/** Repository enumeration failed after its inputs passed validation. */
export class CouplingAuditScanError extends Error {
  /** @param detail - Underlying read, decode, or scan failure. */
  constructor(detail: string) {
    super(`Coupling-audit scan failed: ${detail}`);
    this.name = "CouplingAuditScanError";
  }
}

/**
 * Map known failure classes to the repository-audit process contract.
 * Residue-bearing successful results still return zero.
 *
 * @param error - Failure raised at the executable boundary.
 * @returns Stable process exit code.
 */
export function couplingAuditExitCode(error: unknown): 2 | 3 | 4 {
  if (error instanceof CouplingAuditValidationError) return 2;
  if (error instanceof CouplingAuditStaleDispositionError) return 3;
  return 4;
}

function fail(path: string, detail: string): never {
  throw new CouplingAuditValidationError(path, detail);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(path, "expected an object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "expected an array");
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") return fail(path, "expected a non-empty string");
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) return fail(path, "expected a positive integer");
  return value as number;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) return fail(path, "expected a non-negative integer");
  return value as number;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return fail(path, `expected one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function uniqueIds(values: readonly Record<string, unknown>[], path: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const id = nonEmptyString(value.id, `${path}[${index}].id`);
    if (!ID_PATTERN.test(id)) fail(`${path}[${index}].id`, "expected a lowercase kebab-case ID");
    if (seen.has(id)) fail(`${path}[${index}].id`, `duplicate ID: ${id}`);
    seen.add(id);
  });
}

function stringArray(value: unknown, path: string, allowEmpty = false): string[] {
  const values = array(value, path).map((entry, index) => nonEmptyString(entry, `${path}[${index}]`));
  if (!allowEmpty && values.length === 0) fail(path, "expected at least one value");
  if (new Set(values).size !== values.length) fail(path, "duplicate values are not canonical");
  return values;
}

function validatePattern(value: unknown, path: string): void {
  const pattern = record(value, path);
  const id = nonEmptyString(pattern.id, `${path}.id`);
  if (!ID_PATTERN.test(id)) fail(`${path}.id`, "expected a lowercase kebab-case ID");
  const form = enumValue(pattern.form, ["literal", "regex"] as const, `${path}.form`);
  const source = nonEmptyString(pattern.value, `${path}.value`);
  if (pattern.caseSensitive !== undefined && typeof pattern.caseSensitive !== "boolean") {
    fail(`${path}.caseSensitive`, "expected a boolean");
  }
  if (pattern.flags !== undefined && typeof pattern.flags !== "string") fail(`${path}.flags`, "expected a string");
  if (form === "literal") {
    if (pattern.flags !== undefined) fail(`${path}.flags`, "literal patterns cannot declare regex flags");
    return;
  }
  if (typeof pattern.flags === "string" && /[gyd]/.test(pattern.flags)) {
    fail(`${path}.flags`, "global, sticky, and indices iteration are engine-owned");
  }
  let regex: RegExp;
  try {
    regex = new RegExp(source, typeof pattern.flags === "string" ? pattern.flags : undefined);
  } catch (error) {
    fail(path, `invalid regular expression: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (regex.test("")) fail(`${path}.value`, "regular expressions must not match the empty string");
}

function validatePatternList(value: unknown, path: string): void {
  const patterns = array(value, path).map((entry, index) => record(entry, `${path}[${index}]`));
  if (patterns.length === 0) fail(path, "expected at least one pattern");
  uniqueIds(patterns, path);
  patterns.forEach((pattern, index) => {
    validatePattern(pattern, `${path}[${index}]`);
  });
}

function validateCorpus(value: unknown): void {
  const corpus = record(value, "manifest.corpus");
  nonEmptyString(corpus.packageRoot, "manifest.corpus.packageRoot");
  stringArray(corpus.installedDelta, "manifest.corpus.installedDelta", true);
  stringArray(corpus.repoRootDelta, "manifest.corpus.repoRootDelta", true);
  array(corpus.excluded, "manifest.corpus.excluded").forEach((entry, index) => {
    const exclusion = record(entry, `manifest.corpus.excluded[${index}]`);
    nonEmptyString(exclusion.path, `manifest.corpus.excluded[${index}].path`);
    nonEmptyString(exclusion.reason, `manifest.corpus.excluded[${index}].reason`);
  });
}

function validateClass(value: unknown, index: number): void {
  const path = `manifest.classes[${index}]`;
  const assumption = record(value, path);
  const key = record(assumption.key, `${path}.key`);
  const kind = enumValue(key.kind, ["name", "idiom"] as const, `${path}.key.kind`);
  nonEmptyString(key.value, `${path}.key.value`);
  validatePatternList(assumption.patterns, `${path}.patterns`);
  const citations = array(assumption.citations, `${path}.citations`);
  citations.forEach((entry, citationIndex) => {
    const citation = record(entry, `${path}.citations[${citationIndex}]`);
    nonEmptyString(citation.path, `${path}.citations[${citationIndex}].path`);
    nonEmptyString(citation.anchor, `${path}.citations[${citationIndex}].anchor`);
    nonEmptyString(citation.workUnit, `${path}.citations[${citationIndex}].workUnit`);
  });
  if (kind === "name" && citations.length === 0) fail(`${path}.citations`, "name-keyed classes require a citation");
  const idioms = stringArray(assumption.idioms, `${path}.idioms`);
  idioms.forEach((idiom, idiomIndex) =>
    enumValue(idiom, COUPLING_IDIOMS, `${path}.idioms[${idiomIndex}]`),
  );
  const volatility = record(assumption.volatility, `${path}.volatility`);
  const rating = enumValue(volatility.rating, VOLATILITY, `${path}.volatility.rating`);
  if (rating === "unresolved") {
    if (volatility.evidence !== null) fail(`${path}.volatility.evidence`, "unresolved ratings require null evidence");
  } else {
    const evidence = record(volatility.evidence, `${path}.volatility.evidence`);
    nonEmptyString(evidence.workUnit, `${path}.volatility.evidence.workUnit`);
    nonEmptyString(evidence.source, `${path}.volatility.evidence.source`);
  }
}

function validateCatchAllVectors(value: unknown): void {
  const vectors = array(value, "manifest.catchAllVectors").map((entry, index) =>
    record(entry, `manifest.catchAllVectors[${index}]`),
  );
  uniqueIds(vectors, "manifest.catchAllVectors");
  const covered = new Set<CouplingIdiom>();
  vectors.forEach((vector, index) => {
    const path = `manifest.catchAllVectors[${index}]`;
    const idiom = enumValue(vector.idiom, COUPLING_IDIOMS, `${path}.idiom`);
    covered.add(idiom);
    validatePatternList(vector.patterns, `${path}.patterns`);
    const kinds = stringArray(vector.surfaceKinds, `${path}.surfaceKinds`);
    kinds.forEach((kind, kindIndex) => enumValue(kind, SURFACE_KINDS, `${path}.surfaceKinds[${kindIndex}]`));
  });
  const missing = COUPLING_IDIOMS.filter((idiom) => !covered.has(idiom));
  if (missing.length > 0) fail("manifest.catchAllVectors", `missing idiom coverage: ${missing.join(", ")}`);
}

function validateDigest(value: unknown, path: string): void {
  const digest = nonEmptyString(value, path);
  if (!SHA256_PATTERN.test(digest)) fail(path, "expected a lowercase SHA-256 digest");
}

function validateDispositions(value: unknown): void {
  const dispositions = record(value, "manifest.dispositions");
  const exact = array(dispositions.exact, "manifest.dispositions.exact").map((entry, index) =>
    record(entry, `manifest.dispositions.exact[${index}]`),
  );
  const bulk = array(dispositions.bulk, "manifest.dispositions.bulk").map((entry, index) =>
    record(entry, `manifest.dispositions.bulk[${index}]`),
  );
  uniqueIds([...exact, ...bulk], "manifest.dispositions");
  exact.forEach((entry, index) => {
    validateDigest(entry.candidateDigest, `manifest.dispositions.exact[${index}].candidateDigest`);
    nonEmptyString(entry.reason, `manifest.dispositions.exact[${index}].reason`);
  });
  bulk.forEach((entry, index) => {
    const path = `manifest.dispositions.bulk[${index}]`;
    const predicate = record(entry.predicate, `${path}.predicate`);
    enumValue(
      predicate.field,
      ["path", "token", "surfaceKind", "locus", "idiom", "vectorId"] as const,
      `${path}.predicate.field`,
    );
    const operator = enumValue(predicate.operator, ["equals", "in", "prefix"] as const, `${path}.predicate.operator`);
    const values = stringArray(predicate.values, `${path}.predicate.values`);
    if (operator === "equals" && values.length !== 1) fail(`${path}.predicate.values`, "equals requires one value");
    validateDigest(entry.memberSetDigest, `${path}.memberSetDigest`);
    nonEmptyString(entry.reason, `${path}.reason`);
  });
}

function validateThresholds(value: unknown): void {
  const thresholds = record(value, "manifest.thresholds");
  SURFACE_KINDS.forEach((kind) => positiveInteger(thresholds[kind], `manifest.thresholds.${kind}`));
}

/**
 * Parse and validate a coupling-audit manifest from an external JSON boundary.
 *
 * @param value - Unknown parsed JSON value.
 * @returns The validated manifest without dropping fields.
 * @throws {@link CouplingAuditValidationError} on the first actionable defect.
 */
export function parseCouplingManifest(value: unknown): CouplingManifest {
  const manifest = record(value, "manifest");
  if (manifest.version !== 1) fail("manifest.version", "expected version 1");
  validateCorpus(manifest.corpus);
  const classes = array(manifest.classes, "manifest.classes").map((entry, index) =>
    record(entry, `manifest.classes[${index}]`),
  );
  if (classes.length === 0) fail("manifest.classes", "expected at least one assumption class");
  uniqueIds(classes, "manifest.classes");
  classes.forEach((entry, index) => {
    validateClass(entry, index);
  });
  validateCatchAllVectors(manifest.catchAllVectors);
  validateDispositions(manifest.dispositions);
  validateThresholds(manifest.thresholds);
  const caps = record(manifest.sampleCaps, "manifest.sampleCaps");
  positiveInteger(caps.codePerClass, "manifest.sampleCaps.codePerClass");
  positiveInteger(caps.residueTotal, "manifest.sampleCaps.residueTotal");
  return value as CouplingManifest;
}

function validateCandidate(value: unknown, path: string): Record<string, unknown> {
  const candidate = record(value, path);
  const id = nonEmptyString(candidate.id, `${path}.id`);
  if (!ID_PATTERN.test(id)) fail(`${path}.id`, "expected a lowercase kebab-case ID");
  nonEmptyString(candidate.path, `${path}.path`);
  positiveInteger(candidate.line, `${path}.line`);
  positiveInteger(candidate.column, `${path}.column`);
  const endLine = positiveInteger(candidate.endLine, `${path}.endLine`);
  if (endLine < (candidate.line as number)) fail(`${path}.endLine`, "must not precede line");
  const endColumn = positiveInteger(candidate.endColumn, `${path}.endColumn`);
  if (endLine === candidate.line && endColumn <= (candidate.column as number)) {
    fail(`${path}.endColumn`, "must be greater than column on the same line");
  }
  nonEmptyString(candidate.token, `${path}.token`);
  nonEmptyString(candidate.excerpt, `${path}.excerpt`);
  enumValue(candidate.surfaceKind, SURFACE_KINDS, `${path}.surfaceKind`);
  enumValue(candidate.locus, CORPUS_LOCI, `${path}.locus`);
  enumValue(candidate.idiom, COUPLING_IDIOMS, `${path}.idiom`);
  nonEmptyString(candidate.vectorId, `${path}.vectorId`);
  validateDigest(candidate.evidenceDigest, `${path}.evidenceDigest`);
  return candidate;
}

function expectedVerdict(volatility: Volatility, highFanOut: boolean): QuadrantVerdict | null {
  if (volatility === "unresolved") return null;
  if (volatility === "high") return highFanOut ? "abstract" : "change-with-mover";
  return highFanOut ? "leave-alone" : "retain-local";
}

function validateSurfaceCounts(value: unknown, path: string): number {
  const counts = record(value, path);
  return SURFACE_KINDS.reduce(
    (total, kind) => total + nonNegativeInteger(counts[kind], `${path}.${kind}`),
    0,
  );
}

function validateResultClass(value: unknown, index: number): void {
  const path = `result.classes[${index}]`;
  const resultClass = record(value, path);
  nonEmptyString(resultClass.classId, `${path}.classId`);
  const volatility = enumValue(resultClass.volatility, VOLATILITY, `${path}.volatility`);
  const fanOut = nonNegativeInteger(resultClass.fanOut, `${path}.fanOut`);
  const hitCount = nonNegativeInteger(resultClass.hitCount, `${path}.hitCount`);
  const files = stringArray(resultClass.files, `${path}.files`, true);
  if (files.length !== fanOut) fail(`${path}.files`, "file count must equal fanOut");
  const surfaceTotal = validateSurfaceCounts(resultClass.surfaceCounts, `${path}.surfaceCounts`);
  if (surfaceTotal !== fanOut) fail(`${path}.surfaceCounts`, "surface counts must sum to fanOut");
  if (typeof resultClass.highFanOut !== "boolean") fail(`${path}.highFanOut`, "expected a boolean");
  const expected = expectedVerdict(volatility, resultClass.highFanOut);
  if (expected === null) {
    if (resultClass.verdict !== null || resultClass.rankKey !== null) {
      fail(`${path}.verdict`, "unresolved volatility requires null verdict and rankKey");
    }
  } else {
    const verdict = enumValue(resultClass.verdict, QUADRANT_VERDICTS, `${path}.verdict`);
    if (verdict !== expected) fail(`${path}.verdict`, `expected ${expected} for this quadrant`);
    nonEmptyString(resultClass.rankKey, `${path}.rankKey`);
  }
  const hits = array(resultClass.hits, `${path}.hits`).map((entry, hitIndex) =>
    validateCandidate(entry, `${path}.hits[${hitIndex}]`),
  );
  if (hits.length !== hitCount) fail(`${path}.hitCount`, "must equal the retained hit count");
  hits.forEach((hit, hitIndex) => {
    if (hit.classId !== resultClass.classId) fail(`${path}.hits[${hitIndex}].classId`, "must match parent classId");
    nonEmptyString(hit.patternId, `${path}.hits[${hitIndex}].patternId`);
  });
}

function validateCandidatePartitions(value: unknown): void {
  const candidates = record(value, "result.candidates");
  const partitions = ["classified", "dismissed", "unresolved"] as const;
  const all: Record<string, unknown>[] = [];
  partitions.forEach((partition) => {
    array(candidates[partition], `result.candidates.${partition}`).forEach((entry, index) => {
      const path = `result.candidates.${partition}[${index}]`;
      const candidate = validateCandidate(entry, path);
      all.push(candidate);
      if (partition === "classified") stringArray(candidate.classIds, `${path}.classIds`);
      if (partition === "dismissed") nonEmptyString(candidate.dispositionId, `${path}.dispositionId`);
    });
  });
  uniqueIds(all, "result.candidates");
}

/**
 * Parse and validate a canonical coupling-audit scan result.
 *
 * @param value - Unknown parsed JSON value.
 * @returns The validated result without dropping fields.
 */
export function parseCouplingScanResult(value: unknown): CouplingScanResult {
  const result = record(value, "result");
  if (result.version !== 1) fail("result.version", "expected version 1");
  validateDigest(result.manifestDigest, "result.manifestDigest");
  const corpus = record(result.corpus, "result.corpus");
  positiveInteger(corpus.fileCount, "result.corpus.fileCount");
  validateDigest(corpus.filesDigest, "result.corpus.filesDigest");
  const classes = array(result.classes, "result.classes").map((entry, index) =>
    record(entry, `result.classes[${index}]`),
  );
  uniqueIds(
    classes.map((entry) => ({ id: entry.classId })),
    "result.classes",
  );
  classes.forEach((entry, index) => {
    validateResultClass(entry, index);
  });
  validateCandidatePartitions(result.candidates);
  array(result.diagnostics, "result.diagnostics").forEach((entry, index) => {
    const diagnostic = record(entry, `result.diagnostics[${index}]`);
    nonEmptyString(diagnostic.code, `result.diagnostics[${index}].code`);
    nonEmptyString(diagnostic.path, `result.diagnostics[${index}].path`);
    nonEmptyString(diagnostic.message, `result.diagnostics[${index}].message`);
  });
  return value as CouplingScanResult;
}

/**
 * Parse a routing ledger and verify that every packet binds to the requested
 * canonical scan result.
 *
 * @param value - Unknown parsed JSON value.
 * @param expectedResultDigest - SHA-256 digest of the canonical result input.
 * @returns The validated routing ledger.
 */
export function parseRoutingLedger(value: unknown, expectedResultDigest: string): RoutingLedger {
  validateDigest(expectedResultDigest, "expectedResultDigest");
  const ledger = record(value, "ledger");
  if (ledger.version !== 1) fail("ledger.version", "expected version 1");
  validateDigest(ledger.resultDigest, "ledger.resultDigest");
  if (ledger.resultDigest !== expectedResultDigest) fail("ledger.resultDigest", "does not match the scan result");
  const packets = array(ledger.packets, "ledger.packets").map((entry, index) =>
    record(entry, `ledger.packets[${index}]`),
  );
  uniqueIds(packets, "ledger.packets");
  packets.forEach((packet, index) => {
    const path = `ledger.packets[${index}]`;
    nonEmptyString(packet.targetSlug, `${path}.targetSlug`);
    const classIds = stringArray(packet.classIds, `${path}.classIds`);
    const sorted = [...classIds].sort((left, right) => left.localeCompare(right));
    if (classIds.some((id, idIndex) => id !== sorted[idIndex])) {
      fail(`${path}.classIds`, "expected unique lexicographic ordering");
    }
    stringArray(packet.evidenceAnchors, `${path}.evidenceAnchors`);
    stringArray(packet.reportAnchors, `${path}.reportAnchors`);
    validateDigest(packet.contentDigest, `${path}.contentDigest`);
    if (packet.state !== "captured-awaiting-housekeep") {
      fail(`${path}.state`, "expected captured-awaiting-housekeep");
    }
  });
  return value as RoutingLedger;
}
