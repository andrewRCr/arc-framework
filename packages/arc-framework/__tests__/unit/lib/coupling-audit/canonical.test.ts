import { describe, expect, it, vi } from "vitest";

import {
  canonicalJson,
  canonicalizeRoutingLedger,
  digestCandidateEvidence,
  digestMemberSet,
  emitCanonicalJson,
  normalizeRepositoryPath,
} from "../../../../src/lib/coupling-audit/canonical.js";
import {
  couplingAuditExitCode,
  CouplingAuditScanError,
  CouplingAuditStaleDispositionError,
  CouplingAuditValidationError,
} from "../../../../src/lib/coupling-audit/contracts.js";
import type { RoutingLedger } from "../../../../src/lib/coupling-audit/types.js";

describe("canonical coupling-audit output", () => {
  it("normalizes repository paths to POSIX form", () => {
    expect(normalizeRepositoryPath(".\\packages\\arc-framework\\src\\cli.ts")).toBe(
      "packages/arc-framework/src/cli.ts",
    );
  });

  it("serializes object keys deterministically without timestamps", () => {
    const left = canonicalJson({ z: 1, nested: { b: 2, a: 1 }, a: ["second", "first"] });
    const right = canonicalJson({ a: ["second", "first"], nested: { a: 1, b: 2 }, z: 1 });
    expect(left).toBe(right);
    expect(left).toBe('{"a":["second","first"],"nested":{"a":1,"b":2},"z":1}\n');
  });

  it("derives the same evidence digest across platform separators", () => {
    const evidence = {
      path: "packages/arc-framework/src/example.ts",
      line: 3,
      column: 2,
      endLine: 3,
      endColumn: 9,
      token: "active/",
      excerpt: "const path = 'active/';",
      surfaceKind: "code" as const,
      locus: "package" as const,
      idiom: "path-literal" as const,
      vectorId: "path-token",
    };
    expect(digestCandidateEvidence(evidence)).toBe(
      digestCandidateEvidence({ ...evidence, path: "packages\\arc-framework\\src\\example.ts" }),
    );
    expect(digestCandidateEvidence({ ...evidence, line: 4 })).not.toBe(digestCandidateEvidence(evidence));
  });

  it("binds bulk dispositions to a sorted unique member set", () => {
    const first = "a".repeat(64);
    const second = "b".repeat(64);
    expect(digestMemberSet([second, first, second])).toBe(digestMemberSet([first, second]));
  });

  it("orders canonical strings by UTF-8 bytes instead of the host locale", () => {
    const ledger = {
      version: 1,
      resultDigest: "a".repeat(64),
      packets: [{
        id: "packet-a",
        targetSlug: "target-a",
        concernId: "concern-a",
        owner: { state: "planned" as const, resolvedAt: "2026-07-18" },
        classIds: ["ä", "z"],
        extractRefs: [],
        evidenceAnchors: [],
        reportAnchors: [],
        classEvidence: [],
        designImplication: "Design implication.",
        recommendation: "Recommendation.",
        contentDigest: "b".repeat(64),
        state: "captured-awaiting-housekeep" as const,
      }],
    } satisfies RoutingLedger;

    expect(canonicalizeRoutingLedger(ledger).packets[0]!.classIds).toEqual(["z", "ä"]);
  });

  it("canonicalizes routing packet, class, and anchor ordering", () => {
    const ledger: RoutingLedger = {
      version: 1,
      resultDigest: "a".repeat(64),
      packets: [
        {
          id: "packet-b",
          targetSlug: "target-b",
          concernId: "concern-b",
          owner: { state: "planned", resolvedAt: "2026-07-18" },
          classIds: ["class-z", "class-a"],
          extractRefs: ["z", "a"],
          evidenceAnchors: ["result#z", "result#a"],
          reportAnchors: ["report#z", "report#a"],
          classEvidence: ["class-z", "class-a"].map((classId, index) => ({
            classId,
            rank: index + 1,
            verdict: "abstract" as const,
            fanOut: 1,
            hitCount: 1,
            surfaceCounts: { test: 0, workflow: 0, template: 0, code: 1, prose: 0, config: 0 },
            maxThresholdRatio: 1,
          })),
          designImplication: "Design implication B.",
          recommendation: "Recommendation B.",
          contentDigest: "b".repeat(64),
          state: "captured-awaiting-housekeep",
        },
        {
          id: "packet-a",
          targetSlug: "target-a",
          concernId: "concern-a",
          owner: { state: "planned", resolvedAt: "2026-07-18" },
          classIds: ["class-a"],
          extractRefs: [],
          evidenceAnchors: ["result#a"],
          reportAnchors: ["report#a"],
          classEvidence: [
            {
              classId: "class-a",
              rank: 1,
              verdict: "abstract",
              fanOut: 1,
              hitCount: 1,
              surfaceCounts: { test: 0, workflow: 0, template: 0, code: 1, prose: 0, config: 0 },
              maxThresholdRatio: 1,
            },
          ],
          designImplication: "Design implication A.",
          recommendation: "Recommendation A.",
          contentDigest: "c".repeat(64),
          state: "captured-awaiting-housekeep",
        },
      ],
    };
    const canonical = canonicalizeRoutingLedger(ledger);
    expect(canonical.packets.map((packet) => packet.id)).toEqual(["packet-a", "packet-b"]);
    expect(canonical.packets[1]!.classIds).toEqual(["class-a", "class-z"]);
    expect(canonical.packets[1]!.evidenceAnchors).toEqual(["result#a", "result#z"]);
    expect(ledger.packets[0]!.classIds).toEqual(["class-z", "class-a"]);
  });

  it("writes canonical JSON to a requested path or stdout", async () => {
    const writeFile = vi.fn<(path: string, content: string) => Promise<void>>().mockResolvedValue(undefined);
    const writeStdout = vi.fn<(content: string) => void>();
    await emitCanonicalJson({ b: 2, a: 1 }, "result.json", { writeFile, writeStdout });
    await emitCanonicalJson({ b: 2, a: 1 }, "-", { writeFile, writeStdout });
    expect(writeFile).toHaveBeenCalledWith("result.json", '{"a":1,"b":2}\n');
    expect(writeStdout).toHaveBeenCalledWith('{"a":1,"b":2}\n');
  });
});

describe("coupling-audit failure classes", () => {
  it("distinguishes malformed input, stale dispositions, and scan failures", () => {
    expect(couplingAuditExitCode(new CouplingAuditValidationError("manifest", "bad"))).toBe(2);
    expect(couplingAuditExitCode(new CouplingAuditStaleDispositionError("bulk-a"))).toBe(3);
    expect(couplingAuditExitCode(new CouplingAuditScanError("read failed"))).toBe(4);
  });
});
