import { describe, expect, it } from "vitest";

import { digestMemberSet } from "../../../../src/lib/coupling-audit/canonical.js";
import { CouplingAuditStaleDispositionError } from "../../../../src/lib/coupling-audit/contracts.js";
import { scanCorpus } from "../../../../src/lib/coupling-audit/scan.js";
import type {
  CatchAllVector,
  CouplingIdiom,
  CouplingManifest,
} from "../../../../src/lib/coupling-audit/types.js";

const vectorTokens: Record<CouplingIdiom, string> = {
  "path-literal": "mystery/path",
  "directory-state": "scan-directory",
  "git-tracked-path": "git-add-mystery",
  "filename-prefix": "mystery-prefix-",
  "branch-pattern": "mystery/branch",
  "config-key": "mystery.setting",
  "doc-name": "MYSTERY.md",
};

function vectors(): CatchAllVector[] {
  return Object.entries(vectorTokens).map(([idiom, token]) => ({
    id: `${idiom}-vector`,
    idiom: idiom as CouplingIdiom,
    patterns: [{ id: `${idiom}-pattern`, form: "literal", value: token, caseSensitive: true }],
    surfaceKinds: ["test", "workflow", "template", "code", "prose", "config"],
  }));
}

function manifest(): CouplingManifest {
  return {
    version: 1,
    corpus: { packageRoot: "pkg", installedDelta: [], repoRootDelta: [], excluded: [] },
    classes: [
      {
        id: "known-path",
        key: { kind: "name", value: "known/path" },
        patterns: [{ id: "known-pattern", form: "literal", value: "known/path", caseSensitive: true }],
        citations: [{ path: "direction.md", anchor: "Known", workUnit: "path-owner" }],
        idioms: ["path-literal"],
        volatility: { rating: "unresolved", evidence: null },
      },
    ],
    catchAllVectors: vectors(),
    dispositions: { exact: [], bulk: [] },
    thresholds: { test: 2, workflow: 2, template: 2, code: 2, prose: 2, config: 2 },
    sampleCaps: { codePerClass: 1, residueTotal: 1 },
  };
}

describe("coupling-audit scan", () => {
  it("aggregates distinct-file fan-out and retains overlapping class attribution", () => {
    const input = manifest();
    input.classes.push({
      ...structuredClone(input.classes[0]!),
      id: "known-path-alias",
      patterns: [{ id: "known-alias-pattern", form: "literal", value: "known/path", caseSensitive: true }],
    });
    input.catchAllVectors[0]!.patterns[0]!.value = "known/path";
    const result = scanCorpus(input, [
      { path: "pkg/src/a.ts", content: "known/path known/path", surfaceKind: "code", locus: "package" },
      { path: "pkg/README.md", content: "known/path", surfaceKind: "prose", locus: "package" },
    ]);

    expect(result.classes.map(({ classId, fanOut, hitCount }) => ({ classId, fanOut, hitCount }))).toEqual([
      { classId: "known-path", fanOut: 2, hitCount: 3 },
      { classId: "known-path-alias", fanOut: 2, hitCount: 3 },
    ]);
    expect(result.classes[0]!.surfaceCounts).toEqual({
      test: 0,
      workflow: 0,
      template: 0,
      code: 1,
      prose: 1,
      config: 0,
    });
    expect(result.candidates.classified).toHaveLength(3);
    expect(result.candidates.classified[0]!.classIds).toEqual(["known-path", "known-path-alias"]);
  });

  it("does not let an unrelated class match elsewhere suppress residue", () => {
    const result = scanCorpus(manifest(), [
      {
        path: "pkg/src/a.ts",
        content: "known/path then mystery/path",
        surfaceKind: "code",
        locus: "package",
      },
    ]);
    expect(result.candidates.classified).toEqual([]);
    expect(result.candidates.unresolved.map((candidate) => candidate.token)).toEqual(["mystery/path"]);
  });

  it("routes an unseen token from every declared idiom vector to residue", () => {
    const result = scanCorpus(manifest(), [
      {
        path: "pkg/src/a.ts",
        content: Object.values(vectorTokens).join("\n"),
        surfaceKind: "code",
        locus: "package",
      },
    ]);
    expect(new Set(result.candidates.unresolved.map((candidate) => candidate.idiom))).toEqual(
      new Set(Object.keys(vectorTokens)),
    );
  });

  it("applies exact and member-bound bulk dispositions and rejects expansion", () => {
    const input = manifest();
    input.catchAllVectors[0]!.patterns[0]!.value = "mystery/";
    const files = [
      {
        path: "pkg/src/a.ts",
        content: "mystery/one mystery/two",
        surfaceKind: "code" as const,
        locus: "package" as const,
      },
    ];
    const initial = scanCorpus(input, files);
    const [exact, bulk] = initial.candidates.unresolved;
    input.dispositions.exact.push({
      id: "known-fixture",
      candidateDigest: exact!.evidenceDigest,
      reason: "Known fixture evidence.",
    });
    input.dispositions.bulk.push({
      id: "remaining-paths",
      predicate: { field: "token", operator: "equals", values: [bulk!.token] },
      memberSetDigest: digestMemberSet([bulk!.evidenceDigest]),
      reason: "Remaining fixture family.",
    });

    const settled = scanCorpus(input, files);
    expect(settled.candidates.dismissed.map((candidate) => candidate.dispositionId)).toEqual([
      "known-fixture",
      "remaining-paths",
    ]);
    expect(settled.candidates.unresolved).toEqual([]);

    expect(() =>
      scanCorpus(input, [{ ...files[0]!, content: "mystery/one mystery/two mystery/two" }]),
    ).toThrow(CouplingAuditStaleDispositionError);
  });
});
