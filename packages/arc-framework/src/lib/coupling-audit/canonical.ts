/**
 * Canonical path, serialization, and digest helpers for coupling-audit artifacts.
 *
 * @module
 */

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import { toForwardSlash } from "../fs.js";
import { CouplingAuditValidationError } from "./contracts.js";
import type {
  CandidateEvidence,
  CouplingManifest,
  CouplingScanResult,
  RoutingLedger,
} from "./types.js";

type CandidateDigestInput = Omit<CandidateEvidence, "id" | "evidenceDigest">;

/** Output seams for deterministic JSON emission. */
export interface CanonicalJsonOutput {
  /** Write a complete UTF-8 payload to a requested repository path. */
  writeFile(path: string, content: string): Promise<void>;
  /** Write a complete payload to stdout when the destination is `-`. */
  writeStdout(content: string): void;
}

/**
 * Normalize a repository-relative path without resolving it against the host.
 *
 * @param inputPath - Repository path using either platform separator.
 * @returns POSIX-form relative path without a leading `./`.
 */
export function normalizeRepositoryPath(inputPath: string): string {
  return toForwardSlash(inputPath).replace(/^\.\//, "");
}

/**
 * Serialize JSON-compatible input with recursively sorted object keys and one
 * trailing newline. Array ordering remains an artifact-level contract.
 *
 * @param value - JSON-compatible artifact value.
 * @returns Stable pretty-printed UTF-8 text.
 */
export function canonicalJson(value: unknown): string {
  return `${canonicalize(value)}\n`;
}

/**
 * Hash a canonical JSON value with SHA-256.
 *
 * @param value - JSON-compatible artifact value.
 * @returns Lowercase hexadecimal digest.
 */
export function digestCanonicalJson(value: unknown): string {
  return digestBytes(Buffer.from(canonicalize(value), "utf8")).slice("sha256:".length);
}

/**
 * Derive the canonical evidence digest for one catch-all candidate span.
 * Candidate IDs and stored digests are excluded to avoid a recursive identity.
 *
 * @param evidence - Candidate evidence fields.
 * @returns Lowercase SHA-256 digest.
 */
export function digestCandidateEvidence(evidence: CandidateDigestInput): string {
  return digestCanonicalJson({ ...evidence, path: normalizeRepositoryPath(evidence.path) });
}

/**
 * Bind a bulk disposition to the exact sorted set of candidate digests.
 *
 * @param candidateDigests - Candidate evidence digests, in any order.
 * @returns Lowercase SHA-256 digest for the unique member set.
 */
export function digestMemberSet(candidateDigests: readonly string[]): string {
  const unique = [...new Set(candidateDigests)];
  for (const digest of unique) {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new CouplingAuditValidationError("memberSet", `invalid candidate digest: ${digest}`);
    }
  }
  unique.sort((left, right) => left.localeCompare(right));
  return digestCanonicalJson(unique);
}

function lexical(left: string, right: string): number {
  return left.localeCompare(right);
}

function canonicalCandidate<T extends CandidateEvidence>(candidate: T): T {
  return { ...candidate, path: normalizeRepositoryPath(candidate.path) };
}

function compareCandidate(left: CandidateEvidence, right: CandidateEvidence): number {
  return (
    lexical(left.path, right.path) ||
    left.line - right.line ||
    left.column - right.column ||
    left.endLine - right.endLine ||
    left.endColumn - right.endColumn ||
    lexical(left.token, right.token) ||
    lexical(left.id, right.id)
  );
}

/**
 * Normalize all path-bearing fields and ordered collections in a manifest.
 *
 * @param manifest - Validated coupling manifest.
 * @returns Detached canonical representation.
 */
export function canonicalizeManifest(manifest: CouplingManifest): CouplingManifest {
  const output = structuredClone(manifest);
  output.corpus.packageRoot = normalizeRepositoryPath(output.corpus.packageRoot);
  output.corpus.installedDelta = output.corpus.installedDelta.map(normalizeRepositoryPath).sort(lexical);
  output.corpus.repoRootDelta = output.corpus.repoRootDelta.map(normalizeRepositoryPath).sort(lexical);
  output.corpus.excluded = output.corpus.excluded
    .map((entry) => ({ ...entry, path: normalizeRepositoryPath(entry.path) }))
    .sort((left, right) => lexical(left.path, right.path));
  output.classes.sort((left, right) => lexical(left.id, right.id));
  output.classes.forEach((entry) => {
    entry.patterns.sort((left, right) => lexical(left.id, right.id));
    entry.citations = entry.citations
      .map((citation) => ({ ...citation, path: normalizeRepositoryPath(citation.path) }))
      .sort((left, right) => lexical(`${left.path}#${left.anchor}`, `${right.path}#${right.anchor}`));
    entry.idioms.sort(lexical);
  });
  output.catchAllVectors.sort((left, right) => lexical(left.id, right.id));
  output.catchAllVectors.forEach((entry) => {
    entry.patterns.sort((left, right) => lexical(left.id, right.id));
    entry.surfaceKinds.sort(lexical);
  });
  output.dispositions.exact.sort((left, right) => lexical(left.id, right.id));
  output.dispositions.bulk.sort((left, right) => lexical(left.id, right.id));
  output.dispositions.bulk.forEach((entry) => entry.predicate.values.sort(lexical));
  return output;
}

/**
 * Normalize all path-bearing fields and ordered evidence collections in a scan result.
 *
 * @param result - Validated scan result.
 * @returns Detached canonical representation.
 */
export function canonicalizeScanResult(result: CouplingScanResult): CouplingScanResult {
  const output = structuredClone(result);
  output.classes.sort((left, right) => lexical(left.classId, right.classId));
  output.classes.forEach((entry) => {
    entry.files = entry.files.map(normalizeRepositoryPath).sort(lexical);
    entry.hits = entry.hits.map(canonicalCandidate).sort(compareCandidate);
  });
  output.candidates.classified = output.candidates.classified.map(canonicalCandidate).sort(compareCandidate);
  output.candidates.classified.forEach((entry) => entry.classIds.sort(lexical));
  output.candidates.dismissed = output.candidates.dismissed.map(canonicalCandidate).sort(compareCandidate);
  output.candidates.unresolved = output.candidates.unresolved.map(canonicalCandidate).sort(compareCandidate);
  output.diagnostics.sort((left, right) =>
    lexical(`${left.code}:${left.path}:${left.message}`, `${right.code}:${right.path}:${right.message}`),
  );
  return output;
}

/**
 * Normalize packet and anchor order before ledger validation and persistence.
 *
 * @param ledger - Routing ledger to canonicalize.
 * @returns Detached canonical representation.
 */
export function canonicalizeRoutingLedger(ledger: RoutingLedger): RoutingLedger {
  const output = structuredClone(ledger);
  output.packets.sort((left, right) => lexical(left.id, right.id));
  output.packets.forEach((packet) => {
    packet.classIds.sort(lexical);
    packet.evidenceAnchors.sort(lexical);
    packet.reportAnchors.sort(lexical);
  });
  return output;
}

/**
 * Emit one canonical JSON payload to an explicit file or stdout destination.
 *
 * @param value - JSON-compatible artifact value.
 * @param destination - Requested path, or `-` for stdout.
 * @param output - Injected file/stdout seams.
 */
export async function emitCanonicalJson(
  value: unknown,
  destination: string,
  output: CanonicalJsonOutput,
): Promise<void> {
  const content = canonicalJson(value);
  if (destination === "-") {
    output.writeStdout(content);
    return;
  }
  if (destination.trim() === "") throw new CouplingAuditValidationError("destination", "expected a path or '-'");
  await output.writeFile(normalizeRepositoryPath(destination), content);
}
