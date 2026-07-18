/**
 * Pure deterministic scan engine for coupling-audit manifests and corpus files.
 *
 * @module
 */

import { sortByCanonicalBytes } from "../canonical/canonical-json.js";
import {
  canonicalizeManifest,
  canonicalizeScanResult,
  digestCandidateEvidence,
  digestCanonicalJson,
  digestMemberSet,
} from "./canonical.js";
import {
  CouplingAuditScanError,
  CouplingAuditStaleDispositionError,
  parseCouplingScanResult,
} from "./contracts.js";
import type { CorpusFile } from "./corpus.js";
import { findPatternSetMatches, type PatternMatch } from "./matcher.js";
import type {
  BulkPredicate,
  CandidateEvidence,
  ClassifiedHit,
  CorpusLocus,
  CouplingIdiom,
  CouplingManifest,
  CouplingScanResult,
  QuadrantVerdict,
  SurfaceKind,
} from "./types.js";

const SURFACE_KINDS: readonly SurfaceKind[] = ["test", "workflow", "template", "code", "prose", "config"];

interface LocatedMatch extends PatternMatch {
  path: string;
  surfaceKind: SurfaceKind;
  locus: CorpusLocus;
}

interface LocatedClassMatch extends LocatedMatch {
  classId: string;
  idiom: CouplingIdiom;
}

interface LocatedCandidate {
  evidence: CandidateEvidence;
  start: number;
  end: number;
}

function surfaceCounts(): Record<SurfaceKind, number> {
  return { test: 0, workflow: 0, template: 0, code: 0, prose: 0, config: 0 };
}

function verdict(volatility: "high" | "stable", highFanOut: boolean): QuadrantVerdict {
  if (volatility === "high") return highFanOut ? "abstract" : "change-with-mover";
  return highFanOut ? "leave-alone" : "retain-local";
}

function evidenceFrom(match: LocatedMatch, idiom: CouplingIdiom, vectorId: string): CandidateEvidence {
  const digestInput = {
    path: match.path,
    line: match.line,
    column: match.column,
    endLine: match.endLine,
    endColumn: match.endColumn,
    token: match.token,
    excerpt: match.excerpt,
    surfaceKind: match.surfaceKind,
    locus: match.locus,
    idiom,
    vectorId,
  };
  const evidenceDigest = digestCandidateEvidence(digestInput);
  return { id: `candidate-${evidenceDigest}`, ...digestInput, evidenceDigest };
}

function classHitFrom(match: LocatedClassMatch): ClassifiedHit {
  const candidate = evidenceFrom(match, match.idiom, `class-${match.classId}`);
  return {
    ...candidate,
    id: `hit-${candidate.evidenceDigest}`,
    classId: match.classId,
    patternId: match.patternId,
  };
}

function predicateMatches(candidate: CandidateEvidence, predicate: BulkPredicate): boolean {
  const value = candidate[predicate.field];
  if (predicate.operator === "equals") return value === predicate.values[0];
  if (predicate.operator === "in") return predicate.values.includes(value);
  return predicate.values.some((prefix) => value.startsWith(prefix));
}

function deduplicateClassMatches(matches: LocatedClassMatch[]): LocatedClassMatch[] {
  const deduplicated = new Map<string, LocatedClassMatch>();
  matches
    .sort((left, right) =>
      left.path.localeCompare(right.path) ||
      left.start - right.start ||
      left.end - right.end ||
      left.classId.localeCompare(right.classId) ||
      left.idiom.localeCompare(right.idiom) ||
      left.patternId.localeCompare(right.patternId),
    )
    .forEach((match) => {
      const key = `${match.classId}\0${match.path}\0${match.start}\0${match.end}\0${match.idiom}`;
      if (!deduplicated.has(key)) deduplicated.set(key, match);
    });
  return [...deduplicated.values()];
}

function collectClassMatches(
  manifest: CouplingManifest,
  files: readonly CorpusFile[],
  candidates: readonly LocatedCandidate[],
): LocatedClassMatch[] {
  const matches: LocatedClassMatch[] = [];
  const candidatesByPath = new Map<string, LocatedCandidate[]>();
  for (const candidate of candidates) {
    const pathCandidates = candidatesByPath.get(candidate.evidence.path) ?? [];
    pathCandidates.push(candidate);
    candidatesByPath.set(candidate.evidence.path, pathCandidates);
  }
  for (const file of files) {
    for (const assumption of manifest.classes) {
      for (const match of findPatternSetMatches(file.content, assumption.patterns)) {
        const coveringCandidates = (candidatesByPath.get(file.path) ?? []).filter(
          (candidate) =>
            candidate.evidence.path === file.path &&
            assumption.idioms.includes(candidate.evidence.idiom) &&
            candidate.start <= match.start &&
            candidate.end >= match.end,
        );
        if (coveringCandidates.length === 0) {
          const idiom = assumption.idioms[0];
          if (idiom === undefined) throw new CouplingAuditScanError(`Class ${assumption.id} has no declared idiom`);
          matches.push({
            ...match,
            path: file.path,
            surfaceKind: file.surfaceKind,
            locus: file.locus,
            classId: assumption.id,
            idiom,
          });
          continue;
        }
        for (const candidate of coveringCandidates) {
          matches.push({
            patternId: match.patternId,
            start: candidate.start,
            end: candidate.end,
            line: candidate.evidence.line,
            column: candidate.evidence.column,
            endLine: candidate.evidence.endLine,
            endColumn: candidate.evidence.endColumn,
            token: candidate.evidence.token,
            excerpt: candidate.evidence.excerpt,
            path: file.path,
            surfaceKind: file.surfaceKind,
            locus: file.locus,
            classId: assumption.id,
            idiom: candidate.evidence.idiom,
          });
        }
      }
    }
  }
  return deduplicateClassMatches(matches);
}

function collectCandidates(manifest: CouplingManifest, files: readonly CorpusFile[]): LocatedCandidate[] {
  const candidates = new Map<string, LocatedCandidate>();
  for (const file of files) {
    for (const vector of manifest.catchAllVectors) {
      if (!vector.surfaceKinds.includes(file.surfaceKind)) continue;
      for (const match of findPatternSetMatches(file.content, vector.patterns)) {
        const located = { ...match, path: file.path, surfaceKind: file.surfaceKind, locus: file.locus };
        const evidence = evidenceFrom(located, vector.idiom, vector.id);
        const key = `${vector.id}\0${file.path}\0${match.start}\0${match.end}\0${vector.idiom}`;
        if (!candidates.has(key)) candidates.set(key, { evidence, start: match.start, end: match.end });
      }
    }
  }
  return [...candidates.values()];
}

function partitionCandidates(
  manifest: CouplingManifest,
  candidates: ReturnType<typeof collectCandidates>,
  classMatches: readonly LocatedClassMatch[],
): CouplingScanResult["candidates"] {
  const classified: CouplingScanResult["candidates"]["classified"] = [];
  const unclassified: CandidateEvidence[] = [];
  for (const candidate of candidates) {
    const classIds = sortByCanonicalBytes([
      ...new Set(
        classMatches
          .filter(
            (match) =>
              match.path === candidate.evidence.path &&
              match.idiom === candidate.evidence.idiom &&
              match.start === candidate.start &&
              match.end === candidate.end,
          )
          .map((match) => match.classId),
      ),
    ]);
    if (classIds.length > 0) classified.push({ ...candidate.evidence, classIds });
    else unclassified.push(candidate.evidence);
  }

  const dismissed: CouplingScanResult["candidates"]["dismissed"] = [];
  const remaining = new Map(unclassified.map((candidate) => [candidate.evidenceDigest, candidate]));
  for (const disposition of manifest.dispositions.exact) {
    const candidate = remaining.get(disposition.candidateDigest);
    if (candidate === undefined) throw new CouplingAuditStaleDispositionError(disposition.id);
    dismissed.push({ ...candidate, dispositionId: disposition.id });
    remaining.delete(disposition.candidateDigest);
  }
  for (const disposition of manifest.dispositions.bulk) {
    const members = [...remaining.values()].filter((candidate) => predicateMatches(candidate, disposition.predicate));
    if (members.length === 0 || digestMemberSet(members.map((candidate) => candidate.evidenceDigest)) !== disposition.memberSetDigest) {
      throw new CouplingAuditStaleDispositionError(disposition.id);
    }
    for (const candidate of members) {
      dismissed.push({ ...candidate, dispositionId: disposition.id });
      remaining.delete(candidate.evidenceDigest);
    }
  }
  return { classified, dismissed, unresolved: [...remaining.values()] };
}

/**
 * Scan a validated manifest across an already collected authoritative corpus.
 *
 * @param manifest - Validated executable audit manifest.
 * @param files - Decoded and mechanically classified corpus files.
 * @returns Validated canonical scan result without volatile execution metadata.
 */
export function scanCorpus(manifest: CouplingManifest, files: readonly CorpusFile[]): CouplingScanResult {
  if (files.length === 0) throw new CouplingAuditScanError("The authoritative corpus is empty");
  const canonicalManifest = canonicalizeManifest(manifest);
  const orderedFiles = [...files].sort((left, right) => left.path.localeCompare(right.path));
  for (let index = 1; index < orderedFiles.length; index += 1) {
    if (orderedFiles[index]?.path === orderedFiles[index - 1]?.path) {
      throw new CouplingAuditScanError(`Duplicate corpus path: ${orderedFiles[index]?.path ?? "unknown"}`);
    }
  }
  const surfaceByPath = new Map(orderedFiles.map((file) => [file.path, file.surfaceKind]));

  const candidates = collectCandidates(canonicalManifest, orderedFiles);
  const classMatches = collectClassMatches(canonicalManifest, orderedFiles, candidates);
  const classes = canonicalManifest.classes.map((assumption) => {
    const hits = classMatches.filter((match) => match.classId === assumption.id).map(classHitFrom);
    const filesForClass = sortByCanonicalBytes([...new Set(hits.map((hit) => hit.path))]);
    const counts = surfaceCounts();
    for (const path of filesForClass) {
      const kind = surfaceByPath.get(path);
      if (kind === undefined) throw new CouplingAuditScanError(`Class hit references unknown corpus path: ${path}`);
      counts[kind] += 1;
    }
    const highFanOut = SURFACE_KINDS.some((kind) => counts[kind] >= canonicalManifest.thresholds[kind]);
    const resolvedVerdict = assumption.volatility.rating === "unresolved"
      ? null
      : verdict(assumption.volatility.rating, highFanOut);
    return {
      classId: assumption.id,
      volatility: assumption.volatility.rating,
      fanOut: filesForClass.length,
      hitCount: hits.length,
      files: filesForClass,
      surfaceCounts: counts,
      highFanOut,
      verdict: resolvedVerdict,
      rankKey: resolvedVerdict === null ? null : `${resolvedVerdict}:${filesForClass.length}:${assumption.id}`,
      hits,
    };
  });
  const result = canonicalizeScanResult({
    version: 1,
    manifestDigest: digestCanonicalJson(canonicalManifest),
    corpus: {
      fileCount: orderedFiles.length,
      filesDigest: digestCanonicalJson(
        orderedFiles.map(({ path, surfaceKind, locus }) => ({ path, surfaceKind, locus })),
      ),
    },
    classes,
    candidates: partitionCandidates(canonicalManifest, candidates, classMatches),
    diagnostics: [],
  });
  return parseCouplingScanResult(result);
}
