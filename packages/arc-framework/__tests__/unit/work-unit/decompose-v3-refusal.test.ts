/** The decomposition command boundary exposes one strict refusal contract. */

import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  V3DecomposeCoreRefusalSchema,
  V3DecomposeRefusalEvidenceSchema,
  isV3DecomposeMappedReason,
  v3DecomposeAbsentEvidence,
  v3DecomposeByteEvidence,
  v3DecomposeRemedy,
  v3DecomposeSetEvidence,
} from "../../../src/lib/work-unit/decompose-v3-refusal.js";
import { SpineRemedySchema } from "../../../src/scripts/integration/spine-refusal.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";

describe("v3 decomposition refusals", () => {
  it("accepts only the strict core refusal fields", () => {
    const refusal = {
      status: "refused",
      reason: "uncovered-retirement-content",
      remedy: spineRemedy(
        "Retirement preserves every nonempty companion.",
        "Re-run preflight",
        ["arc", "decompose", "origin", "--preflight"],
      ),
    };

    expect(V3DecomposeCoreRefusalSchema.parse(refusal)).toEqual(refusal);
    for (const extra of [
      { stage: "repository-plan" },
      { recovery: { kind: "none" } },
      { report: {} },
      { extra: true },
    ]) {
      expect(V3DecomposeCoreRefusalSchema.safeParse({ ...refusal, ...extra }).success).toBe(false);
    }
    expect(V3DecomposeCoreRefusalSchema.safeParse({ ...refusal, reason: "" }).success).toBe(false);
    expect(V3DecomposeCoreRefusalSchema.safeParse({ ...refusal, remedy: undefined }).success).toBe(false);
  });

  it("accepts exactly two JSON evidence operands", () => {
    expect(V3DecomposeRefusalEvidenceSchema.parse({
      expected: { kind: "absent" },
      actual: ["a", 1, true, null],
    })).toEqual({
      expected: { kind: "absent" },
      actual: ["a", 1, true, null],
    });

    for (const evidence of [
      { expected: "value" },
      { actual: "value" },
      { expected: "value", actual: "value", extra: true },
      { expected: undefined, actual: "value" },
      { expected: "value", actual: new Uint8Array([1]) },
      { expected: "value", actual: new Error("failure") },
      { expected: "value", actual: new Map([["key", "value"]]) },
      { expected: "value", actual: new Set(["value"]) },
      { expected: "value", actual: { nested: undefined } },
    ]) {
      expect(V3DecomposeRefusalEvidenceSchema.safeParse(evidence).success).toBe(false);
    }
  });

  it("projects bytes, absence, and unordered sets into canonical JSON facts", () => {
    const bytes = new TextEncoder().encode("companion content\n");
    expect(v3DecomposeByteEvidence(bytes)).toEqual({
      contentDigest: digestBytes(bytes),
      byteLength: bytes.byteLength,
    });
    expect(v3DecomposeAbsentEvidence()).toEqual({ kind: "absent" });

    const left = v3DecomposeSetEvidence(new Set([
      { path: "z.md", mode: "100644" },
      { path: "a.md", mode: "100755" },
    ]));
    const right = v3DecomposeSetEvidence(new Set([
      { path: "a.md", mode: "100755" },
      { path: "z.md", mode: "100644" },
    ]));
    expect(left).toEqual(right);
    expect(V3DecomposeRefusalEvidenceSchema.safeParse({ expected: left, actual: right }).success).toBe(true);
  });

  it("maps uncovered retirement content to its invariant and exact preflight remedy", () => {
    const origin = "origin's work";
    const locus = ".arc/active/notes-origin.md";
    const remedy = SpineRemedySchema.parse(v3DecomposeRemedy({
      invocation: { mode: "preflight", origin },
      reason: "repository-plan:conservation:uncovered-retirement-content",
      locus,
    }));

    expect(remedy.invariant).toMatch(/Retirement.*nonempty companion.*conservation proof\.$/u);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/move.*scanned artifact.*delete.*file.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", origin, "--preflight"]);
  });

  it("maps a source scan refusal to UTF-8 conversion and the exact preflight argv", () => {
    const origin = "origin's work";
    const locus = ".arc/active/spec-origin.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "preflight", origin },
      reason: "source-scan",
      locus,
    });

    expect(remedy.invariant).toMatch(/scanned Markdown.*UTF-8/iu);
    expect(remedy.text).toMatch(/convert.*spec-origin\.md.*UTF-8.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", origin, "--preflight"]);
  });

  it.each([
    ["git-preflight:missing-base", /restore.*local base.*re-run preflight/iu],
    ["source-head", /source commit.*changed.*re-run preflight/iu],
  ] as const)("maps %s to its specific correction and preflight argv", (reason, correction) => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "preflight", origin: "origin" },
      reason,
      locus: "reported-locus",
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toMatch(correction);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps an incomplete scaffold source meta to field correction and preflight", () => {
    const locus = "member:.arc/active/meta-origin.md";
    const reason = "content:scaffold-source-meta-incomplete";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/owner.*priority.*origin.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps a missing scaffold source to restoration and preflight", () => {
    const reason = "content:scaffold-source-missing";
    const locus = "member:.arc/active/tasks-origin.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/restore.*scaffold source.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps invalid scaffold encoding to conversion and preflight", () => {
    const reason = "content:scaffold-source-invalid-encoding";
    const locus = "member:.arc/active/tasks-origin.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "extract", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/convert.*UTF-8.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps a missing scaffold title to title repair and preflight", () => {
    const reason = "content:scaffold-title-missing";
    const locus = "member:.arc/active/tasks-origin.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/add.*title.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps an unresolvable existing home to restoration and preflight", () => {
    const reason = "content:existing-home-unresolvable";
    const locus = "existing:.arc/reference/shared.txt";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/restore.*regular-file existing home.*re-run preflight/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--preflight"]);
  });

  it("maps an absent target artifact to map correction and the invoked retry", () => {
    const reason = "content:target-artifact-absent";
    const locus = "member:.arc/backlog/planned/member/notes-member.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/target artifact.*projected.*correct.*map.*retry/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--execute", "map.json"]);
  });

  it("maps an unresolved target locator to locator correction and the invoked retry", () => {
    const reason = "content:target-locator-unresolved";
    const locus = "member:.arc/backlog/planned/member/draft-member.md";
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "extract", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus,
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.text).toContain(locus);
    expect(remedy.text).toMatch(/correct.*target locator.*retry/iu);
    expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--extract", "map.json"]);
  });

  it.each([
    [{ mode: "preflight", origin: "origin" }, ["arc", "decompose", "origin", "--preflight"]],
    [
      { mode: "execute", origin: "origin", cutMapPath: "map with spaces.json" },
      ["arc", "decompose", "origin", "--execute", "map with spaces.json"],
    ],
    [
      { mode: "extract", origin: "origin", cutMapPath: "map.json" },
      ["arc", "decompose", "origin", "--extract", "map.json"],
    ],
    [
      { mode: "finish-preview", origin: "origin", cutMapPath: "map.json" },
      ["arc", "decompose", "origin", "--finish", "map.json"],
    ],
    [
      {
        mode: "finish-apply",
        origin: "origin",
        cutMapPath: "map.json",
        applyAuthority: `sha256:${"a".repeat(64)}`,
      },
      ["arc", "decompose", "origin", "--finish", "map.json", "--apply", `sha256:${"a".repeat(64)}`],
    ],
    [
      { mode: "advance-base", origin: "origin", cutMapPath: "map.json" },
      ["arc", "decompose", "origin", "--advance-base", "map.json"],
    ],
  ] as const)("maps an unexpected %s failure to the exact invoked mode", (invocation, expectedArgv) => {
    const remedy = v3DecomposeRemedy({ invocation, reason: "unexpected-error", locus: "read failed" });
    const refusal = V3DecomposeCoreRefusalSchema.parse({
      status: "refused",
      reason: "unexpected-error",
      locus: "read failed",
      remedy,
    });

    expect(refusal.remedy.argv).toEqual(expectedArgv);
    expect(refusal.remedy.text).toMatch(/retry.*selected.*mode/iu);
    for (const extra of [{ stage: "operation" }, { recovery: { kind: "none" } }, { report: {} }]) {
      expect(V3DecomposeCoreRefusalSchema.safeParse({ ...refusal, ...extra }).success).toBe(false);
    }
  });

  it("does not route an unregistered stable code through the generic retry", () => {
    expect(() => v3DecomposeRemedy({
      invocation: { mode: "preflight", origin: "origin" },
      reason: "new-stable-refusal",
    })).toThrow(/No decomposition remedy is registered/u);
  });
});
