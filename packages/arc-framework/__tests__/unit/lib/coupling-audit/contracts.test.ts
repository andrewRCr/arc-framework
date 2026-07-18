import { describe, expect, it } from "vitest";

import {
  parseCouplingManifest,
  parseCouplingScanResult,
  parseRoutingLedger,
} from "../../../../src/lib/coupling-audit/contracts.js";

const DIGEST = "a".repeat(64);

function validManifest(): Record<string, unknown> {
  return {
    version: 1,
    corpus: {
      packageRoot: "packages/arc-framework",
      installedDelta: [".arc/system/arc-config.yml"],
      repoRootDelta: ["scripts/check-package-sync.sh"],
      excluded: [{ path: "README.md", reason: "Outside the self-hosting tooling boundary." }],
    },
    classes: [
      {
        id: "active-placement",
        key: { kind: "name", value: "active/ placement" },
        patterns: [{ id: "active-path", form: "literal", value: "active/", caseSensitive: true }],
        citations: [{ path: "draft-arc-backend.md", anchor: "Placement", workUnit: "arc-backend" }],
        idioms: ["path-literal", "directory-state"],
        volatility: {
          rating: "high",
          evidence: { workUnit: "arc-backend", source: "draft-arc-backend.md#placement" },
        },
      },
      {
        id: "tracked-path-git",
        key: { kind: "idiom", value: "git invocations on tracked paths" },
        patterns: [{ id: "git-path", form: "regex", value: "git.+\\.arc/", flags: "u" }],
        citations: [],
        idioms: ["git-tracked-path"],
        volatility: { rating: "unresolved", evidence: null },
      },
    ],
    catchAllVectors: [
      {
        id: "path-token",
        idiom: "path-literal",
        patterns: [{ id: "path-token-regex", form: "regex", value: "(?:\\.arc/|/)", flags: "u" }],
        surfaceKinds: ["test", "workflow", "template", "code", "prose", "config"],
      },
      {
        id: "directory-call",
        idiom: "directory-state",
        patterns: [{ id: "directory-call-regex", form: "regex", value: "(?:readdir|exists)", flags: "u" }],
        surfaceKinds: ["code"],
      },
      {
        id: "git-call",
        idiom: "git-tracked-path",
        patterns: [{ id: "git-call-regex", form: "regex", value: "git", flags: "u" }],
        surfaceKinds: ["code", "test"],
      },
      {
        id: "prefix-fragment",
        idiom: "filename-prefix",
        patterns: [{ id: "prefix-regex", form: "regex", value: "[a-z]+-", flags: "u" }],
        surfaceKinds: ["code", "test", "prose"],
      },
      {
        id: "branch-match",
        idiom: "branch-pattern",
        patterns: [{ id: "branch-regex", form: "regex", value: "(?:feat|fix|chore)/", flags: "u" }],
        surfaceKinds: ["code", "test", "workflow", "prose"],
      },
      {
        id: "config-token",
        idiom: "config-key",
        patterns: [{ id: "config-regex", form: "regex", value: "[a-z]+\\.[a-z_]+", flags: "u" }],
        surfaceKinds: ["code", "test", "workflow", "prose", "config"],
      },
      {
        id: "doc-token",
        idiom: "doc-name",
        patterns: [{ id: "doc-regex", form: "regex", value: "[A-Z][A-Z.-]+\\.md", flags: "u" }],
        surfaceKinds: ["workflow", "template", "prose"],
      },
    ],
    dispositions: {
      exact: [{ id: "generated-token", candidateDigest: DIGEST, reason: "Generated fixture token." }],
      bulk: [
        {
          id: "test-fixtures",
          predicate: { field: "path", operator: "prefix", values: ["packages/arc-framework/__tests__/fixtures/"] },
          memberSetDigest: "b".repeat(64),
          reason: "Fixture paths model input rather than repository coupling.",
        },
      ],
    },
    thresholds: { test: 5, workflow: 3, template: 3, code: 5, prose: 8, config: 2 },
    sampleCaps: { codePerClass: 5, residueTotal: 40 },
  };
}

describe("parseCouplingManifest", () => {
  it("accepts a complete versioned manifest without information loss", () => {
    const input = validManifest();
    expect(parseCouplingManifest(input)).toEqual(input);
  });

  it.each([
    ["version", (manifest: Record<string, unknown>) => (manifest.version = 2)],
    [
      "duplicate class IDs",
      (manifest: Record<string, unknown>) => {
        const classes = manifest.classes as Record<string, unknown>[];
        classes.push(structuredClone(classes[0]!));
      },
    ],
    [
      "empty-string regex",
      (manifest: Record<string, unknown>) => {
        const classes = manifest.classes as Record<string, unknown>[];
        const patterns = classes[1]!.patterns as Record<string, unknown>[];
        patterns[0]!.value = ".*";
      },
    ],
    [
      "missing name citation",
      (manifest: Record<string, unknown>) => {
        const classes = manifest.classes as Record<string, unknown>[];
        classes[0]!.citations = [];
      },
    ],
    [
      "incomplete name citation",
      (manifest: Record<string, unknown>) => {
        const classes = manifest.classes as Record<string, unknown>[];
        const citations = classes[0]!.citations as Record<string, unknown>[];
        delete citations[0]!.workUnit;
      },
    ],
    [
      "missing idiom vector",
      (manifest: Record<string, unknown>) => {
        const vectors = manifest.catchAllVectors as Record<string, unknown>[];
        manifest.catchAllVectors = vectors.filter((vector) => vector.idiom !== "doc-name");
      },
    ],
    [
      "malformed disposition digest",
      (manifest: Record<string, unknown>) => {
        const dispositions = manifest.dispositions as Record<string, unknown>;
        const exact = dispositions.exact as Record<string, unknown>[];
        exact[0]!.candidateDigest = "not-a-digest";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const input = validManifest();
    mutate(input);
    expect(() => parseCouplingManifest(input)).toThrow();
  });
});

function candidateEvidence(id: string): Record<string, unknown> {
  return {
    id,
    path: "packages/arc-framework/src/example.ts",
    line: 12,
    column: 4,
    endColumn: 11,
    token: "active/",
    surfaceKind: "code",
    locus: "package",
    idiom: "path-literal",
    vectorId: "path-token",
    evidenceDigest: DIGEST,
  };
}

function validScanResult(): Record<string, unknown> {
  return {
    version: 1,
    manifestDigest: DIGEST,
    corpus: { fileCount: 1, filesDigest: "b".repeat(64) },
    classes: [
      {
        classId: "active-placement",
        volatility: "high",
        fanOut: 1,
        files: ["packages/arc-framework/src/example.ts"],
        surfaceCounts: { test: 0, workflow: 0, template: 0, code: 1, prose: 0, config: 0 },
        highFanOut: false,
        verdict: "change-with-mover",
        rankKey: "1:1:active-placement",
        hits: [
          {
            ...candidateEvidence("hit-active-placement"),
            classId: "active-placement",
            patternId: "active-path",
          },
        ],
      },
    ],
    candidates: {
      classified: [{ ...candidateEvidence("candidate-classified"), classIds: ["active-placement"] }],
      dismissed: [{ ...candidateEvidence("candidate-dismissed"), dispositionId: "generated-token" }],
      unresolved: [candidateEvidence("candidate-unresolved")],
    },
    diagnostics: [{ code: "bulk-disposition-stale", path: "manifest.dispositions.bulk[0]", message: "Changed set." }],
  };
}

describe("parseCouplingScanResult", () => {
  it("accepts a complete versioned result without information loss", () => {
    const input = validScanResult();
    expect(parseCouplingScanResult(input)).toEqual(input);
  });

  it("rejects malformed candidate digests", () => {
    const input = validScanResult();
    const candidates = (input.candidates as Record<string, unknown>).unresolved as Record<string, unknown>[];
    candidates[0]!.evidenceDigest = "bad";
    expect(() => parseCouplingScanResult(input)).toThrow("evidenceDigest");
  });

  it("rejects inconsistent quadrant verdicts", () => {
    const input = validScanResult();
    const classes = input.classes as Record<string, unknown>[];
    classes[0]!.verdict = "abstract";
    expect(() => parseCouplingScanResult(input)).toThrow("verdict");
  });
});

function validLedger(): Record<string, unknown> {
  return {
    version: 1,
    resultDigest: DIGEST,
    packets: [
      {
        id: "cli-substrate-input",
        targetSlug: "cli-substrate-adoption",
        classIds: ["active-placement", "tracked-path-git"],
        evidenceAnchors: ["scan-result.json#active-placement"],
        reportAnchors: ["report-coupling-blast-radius-audit.md#active-placement"],
        contentDigest: "b".repeat(64),
        state: "captured-awaiting-housekeep",
      },
    ],
  };
}

describe("parseRoutingLedger", () => {
  it("accepts canonical packets bound to the expected result", () => {
    const input = validLedger();
    expect(parseRoutingLedger(input, DIGEST)).toEqual(input);
  });

  it("rejects noncanonical class ordering", () => {
    const input = validLedger();
    const packets = input.packets as Record<string, unknown>[];
    packets[0]!.classIds = ["tracked-path-git", "active-placement"];
    expect(() => parseRoutingLedger(input, DIGEST)).toThrow("classIds");
  });

  it("rejects a result-digest mismatch", () => {
    expect(() => parseRoutingLedger(validLedger(), "c".repeat(64))).toThrow("resultDigest");
  });
});
