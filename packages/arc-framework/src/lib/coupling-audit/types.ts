/**
 * Shared machine-readable types for the repository coupling audit.
 *
 * @module
 */

/** Closed file-surface taxonomy used for counts and ranking thresholds. */
export type SurfaceKind = "test" | "workflow" | "template" | "code" | "prose" | "config";

/** Orthogonal origin tag for a file in the bounded audit corpus. */
export type CorpusLocus = "package" | "installed-delta" | "repo-root-delta";

/** Closed coupling mechanisms covered by name classes and catch-all vectors. */
export type CouplingIdiom =
  | "path-literal"
  | "directory-state"
  | "git-tracked-path"
  | "filename-prefix"
  | "branch-pattern"
  | "config-key"
  | "doc-name";

/** Recorded class volatility; unresolved ratings block report projection. */
export type Volatility = "unresolved" | "high" | "stable";

/** Ranked 2x2 disposition derived from fan-out and volatility. */
export type QuadrantVerdict = "abstract" | "change-with-mover" | "leave-alone" | "retain-local";

/** Literal or regular-expression pattern stored in the audit manifest. */
export interface AuditPattern {
  id: string;
  form: "literal" | "regex";
  value: string;
  caseSensitive?: boolean;
  flags?: string;
}

/** Source record grounding a name-keyed assumption class. */
export interface SourceCitation {
  path: string;
  anchor: string;
  workUnit: string;
}

/** One volatile-name or standalone-idiom assumption class. */
export interface AssumptionClass {
  id: string;
  key: { kind: "name" | "idiom"; value: string };
  patterns: AuditPattern[];
  citations: SourceCitation[];
  idioms: CouplingIdiom[];
  volatility: {
    rating: Volatility;
    evidence: { workUnit: string; source: string } | null;
  };
}

/** Catch-all capture vector proving coverage of one coupling mechanism. */
export interface CatchAllVector {
  id: string;
  idiom: CouplingIdiom;
  patterns: AuditPattern[];
  surfaceKinds: SurfaceKind[];
}

/** Closed declarative predicate for a recorded bulk residue disposition. */
export interface BulkPredicate {
  field: "path" | "token" | "surfaceKind" | "locus" | "idiom" | "vectorId";
  operator: "equals" | "in" | "prefix";
  values: string[];
}

/** Versioned executable manifest for the coupling audit. */
export interface CouplingManifest {
  version: 1;
  corpus: {
    packageRoot: string;
    installedDelta: string[];
    repoRootDelta: string[];
    excluded: Array<{ path: string; reason: string }>;
  };
  classes: AssumptionClass[];
  catchAllVectors: CatchAllVector[];
  dispositions: {
    exact: Array<{ id: string; candidateDigest: string; reason: string }>;
    bulk: Array<{
      id: string;
      predicate: BulkPredicate;
      memberSetDigest: string;
      reason: string;
    }>;
  };
  thresholds: Record<SurfaceKind, number>;
  sampleCaps: { codePerClass: number; residueTotal: number };
}

/** Normalized source span emitted by a catch-all vector or class pattern. */
export interface CandidateEvidence {
  id: string;
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  token: string;
  excerpt: string;
  surfaceKind: SurfaceKind;
  locus: CorpusLocus;
  idiom: CouplingIdiom;
  vectorId: string;
  evidenceDigest: string;
}

/** One normalized class hit; class coverage must overlap the candidate token/span. */
export interface ClassifiedHit extends CandidateEvidence {
  classId: string;
  patternId: string;
}

/** Canonical mechanical scan result retained as report input and evidence. */
export interface CouplingScanResult {
  version: 1;
  manifestDigest: string;
  corpus: { fileCount: number; filesDigest: string };
  classes: Array<{
    classId: string;
    volatility: Volatility;
    fanOut: number;
    hitCount: number;
    files: string[];
    surfaceCounts: Record<SurfaceKind, number>;
    highFanOut: boolean;
    verdict: QuadrantVerdict | null;
    rankKey: string | null;
    hits: ClassifiedHit[];
  }>;
  candidates: {
    classified: Array<CandidateEvidence & { classIds: string[] }>;
    dismissed: Array<CandidateEvidence & { dispositionId: string }>;
    unresolved: CandidateEvidence[];
  };
  diagnostics: Array<{ code: string; path: string; message: string }>;
}

/** Canonical cross-WU finding ledger bound to one exact scan result. */
export interface RoutingLedger {
  version: 1;
  resultDigest: string;
  packets: Array<{
    id: string;
    targetSlug: string;
    classIds: string[];
    evidenceAnchors: string[];
    reportAnchors: string[];
    contentDigest: string;
    state: "captured-awaiting-housekeep";
  }>;
}
