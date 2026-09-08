/** The decomposition command boundary exposes one strict refusal contract. */

import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  renderV3DecomposeExecuteCommand,
  v3DecomposeExecuteArgv,
} from "../../../src/lib/work-unit/decompose-command-renderer.js";
import {
  V3DecomposeCoreRefusalSchema,
  V3DecomposeRefusalEvidenceSchema,
  isV3DecomposeMappedReason,
  v3DecomposeAbsentEvidence,
  v3DecomposeByteEvidence,
  v3DecomposeRemedy,
  v3DecomposeSetEvidence,
} from "../../../src/lib/work-unit/decompose-v3-refusal.js";
import {
  GitV3DecomposeCommandRefusalSchema,
  GitV3ExtractionCommandRefusalSchema,
} from "../../../src/lib/work-unit/git-decompose-v3-operation.js";
import { SpineRemedySchema } from "../../../src/scripts/integration/spine-refusal.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";

describe("v3 decomposition refusals", () => {
  it("quotes display text without changing opaque argv operands", () => {
    const origin = "origin's work";
    const cutMapPath = "maps/cut map.json";

    expect(v3DecomposeExecuteArgv(origin, cutMapPath)).toEqual([
      "arc",
      "decompose",
      origin,
      "--execute",
      cutMapPath,
    ]);
    expect(renderV3DecomposeExecuteCommand(origin, cutMapPath))
      .toBe("arc decompose 'origin'\"'\"'s work' --execute 'maps/cut map.json'");
  });

  it("validates mode-specific operation envelopes with typed reports and recovery", () => {
    const remedy = spineRemedy(
      "The operation must preserve its authenticated repository plan.",
      "Retry the selected mode",
      ["arc", "decompose", "origin", "--execute", "map.json"],
    );
    const report = {
      status: "refused" as const,
      paths: [],
      topology: [{ kind: "topology" as const, action: "none" as const, disposition: "no-write" as const }],
      destinations: [],
    };
    const retirement = {
      status: "refused" as const,
      stage: "transition-record" as const,
      reason: "transition-record-write-failed",
      locus: "index write failed",
      report,
      recovery: {
        kind: "full-candidate" as const,
        path: "/repo/.git/arc/worktrees/candidate",
        candidateBranch: "chore/decompose-origin",
        expectedHead: "base-head",
      },
      remedy,
    };
    const extraction = {
      ...retirement,
      stage: "materialization" as const,
      reason: "final-blob-mismatch",
      evidence: { expected: "planned-digest", actual: "observed-digest" },
      recovery: {
        kind: "partial-restoration" as const,
        status: "restored" as const,
        restoredPaths: [".arc/active/meta-origin.md"],
      },
    };

    expect(GitV3DecomposeCommandRefusalSchema.parse(retirement)).toEqual(retirement);
    expect(GitV3ExtractionCommandRefusalSchema.parse(extraction)).toEqual(extraction);
    expect(GitV3ExtractionCommandRefusalSchema.safeParse(retirement).success).toBe(false);
    expect(GitV3DecomposeCommandRefusalSchema.safeParse({ ...retirement, extra: true }).success)
      .toBe(false);
    expect(GitV3ExtractionCommandRefusalSchema.safeParse({
      ...extraction,
      recovery: { ...extraction.recovery, extra: true },
    }).success).toBe(false);
  });

  it("keeps unexpected runtime failures on the core-only command arm", () => {
    const refusal = {
      status: "refused" as const,
      reason: "unexpected-error" as const,
      locus: "cut-map read failed",
      remedy: spineRemedy(
        "The selected decomposition mode must complete without an unexpected runtime failure.",
        "Retry the selected mode",
        ["arc", "decompose", "origin", "--extract", "map.json"],
      ),
    };

    expect(GitV3ExtractionCommandRefusalSchema.parse(refusal)).toEqual(refusal);
    for (const extra of [
      { stage: "repository-plan" },
      { recovery: { kind: "none" } },
      { report: { status: "refused", paths: [], topology: [], destinations: [] } },
    ]) {
      expect(GitV3ExtractionCommandRefusalSchema.safeParse({ ...refusal, ...extra }).success)
        .toBe(false);
    }
  });

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

  it("maps source publication to an exact Git push", () => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason: "source-unpublished",
      locus: "plan/origin",
    });

    expect(remedy.argv).toEqual(["git", "push", "origin", "plan/origin"]);
    expect(remedy.text).toMatch(/publish.*reported source branch/iu);
  });

  it.each([
    ["execute", ["arc", "decompose", "origin", "--extract", "map.json"]],
    ["extract", ["arc", "decompose", "origin", "--execute", "map.json"]],
    ["advance-base", ["arc", "decompose", "origin", "--extract", "map.json"]],
  ] as const)("maps an authoring-shape refusal from %s to the other mode", (mode, expectedArgv) => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode, origin: "origin", cutMapPath: "map.json" },
      reason: "map:authoring-shape",
      locus: "authoring.shape",
    });

    expect(remedy.argv).toEqual(expectedArgv);
  });

  it.each(["finish-preview", "finish-apply"] as const)(
    "maps an authoring-shape refusal from %s to execute",
    (mode) => {
      const invocation = mode === "finish-preview"
        ? { mode, origin: "origin", cutMapPath: "map.json" }
        : { mode, origin: "origin", cutMapPath: "map.json", applyAuthority: `sha256:${"a".repeat(64)}` };
      const remedy = v3DecomposeRemedy({
        invocation,
        reason: "map:authoring-shape",
        locus: "authoring.shape",
      });

      expect(remedy.argv).toEqual(["arc", "decompose", "origin", "--execute", "map.json"]);
    },
  );

  it.each([
    ["full-protection-required", "advance"],
    ["map:invalid", "advance"],
    ["candidate-topology-unavailable", "advance"],
    ["candidate-registration-mismatch", "cleanup"],
    ["candidate-marker-mismatch", "cleanup"],
    ["binding-unavailable", "advance"],
    ["candidate-dirty", "advance"],
    ["base-not-descendant", "advance"],
    ["base-dependency-snapshot-unavailable", "advance"],
    ["base-acquired-incoming-dependency", "preflight"],
    ["candidate-history-unavailable", "cleanup"],
    ["candidate-initial-transition-invalid", "cleanup"],
    ["candidate-transform-mismatch:path-state", "cleanup"],
    ["candidate-advancement-chain-invalid:path-state", "cleanup"],
    ["candidate-advancement-base-invalid", "cleanup"],
    ["binding-raced", "advance"],
    ["merge-refused", "advance"],
    ["candidate-restore-failed", "cleanup"],
    ["post-merge-validation-refused:changed-paths", "advance"],
    ["post-merge-validation-refused:transition-record", "advance"],
    ["post-merge-validation-refused:blob-unavailable", "advance"],
    ["post-merge-validation-refused:write-failed", "advance"],
  ] as const)("maps advancement refusal %s to its corrective command", (reason, command) => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "advance-base", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus: "/repo/decompose-origin",
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.argv).toEqual(command === "cleanup"
      ? ["arc", "teardown", "--branch", "chore/decompose-origin"]
      : command === "preflight"
        ? ["arc", "decompose", "origin", "--preflight"]
        : ["arc", "decompose", "origin", "--advance-base", "map.json"]);
  });

  it("uses exact candidate teardown when full-protection recovery exists", () => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map with spaces.json" },
      reason: "git:source-ref-moved",
      locus: "refs/heads/plan/origin",
      recovery: {
        kind: "full-candidate",
        path: "/repo/.git/arc/worktrees/candidate",
        candidateBranch: "chore/decompose-origin",
        expectedHead: "base-head",
      },
    });

    expect(remedy.argv).toEqual(["arc", "teardown", "--branch", "chore/decompose-origin"]);
    expect(remedy.text).toContain("arc decompose origin --execute 'map with spaces.json'");
  });

  it.each(["execute", "extract"] as const)(
    "selects the invoked %s retry for operation and restored-partial refusals",
    (mode) => {
      const expectedArgv = ["arc", "decompose", "origin", `--${mode}`, "map.json"];
      const operation = v3DecomposeRemedy({
        invocation: { mode, origin: "origin", cutMapPath: "map.json" },
        reason: "final-blob-mismatch",
        locus: ".arc/active/meta-origin.md",
      });
      const restored = v3DecomposeRemedy({
        invocation: { mode, origin: "origin", cutMapPath: "map.json" },
        reason: "post-stage-revalidation-failed",
        recovery: {
          kind: "partial-restoration",
          status: "restored",
          restoredPaths: [".arc/active/meta-origin.md"],
        },
      });

      expect(operation.argv).toEqual(expectedArgv);
      expect(restored.argv).toEqual(expectedArgv);
    },
  );

  it.each([
    ["conservation:live-conservation:incoming-edge-set-changed", "preflight"],
    ["retirement:predecessor-changed", "preflight"],
    ["topology:missing-parent", "execute"],
    ["composition:invalid-plan-operand", "execute"],
    ["git:repository-plan-failed", "execute"],
  ] as const)("maps repository-plan refusal %s to its corrective command", (reason, command) => {
    const remedy = v3DecomposeRemedy({
      invocation: { mode: "execute", origin: "origin", cutMapPath: "map.json" },
      reason,
      locus: "reported-locus",
    });

    expect(isV3DecomposeMappedReason(reason)).toBe(true);
    expect(remedy.argv).toEqual(command === "preflight"
      ? ["arc", "decompose", "origin", "--preflight"]
      : ["arc", "decompose", "origin", "--execute", "map.json"]);
  });

  it.each([
    [
      "repository-plan:composition:invalid-plan-operand",
      "execute",
      /complete, internally consistent operands/iu,
    ],
    ["map:invalid-structure", "execute", /closed v3 structure/iu],
    ["source-binding:source-head", "preflight", /exact source commit/iu],
    ["source-plan:source-index-preimage", "finish", /source index path/iu],
    ["git-preflight:missing-blob", "preflight", /source blob.*readable/iu],
    [
      "advancement-plan-refused:conservation:incoming-edge-set-changed",
      "preflight",
      /incoming dependencies.*authenticated by preflight/iu,
    ],
    ["candidate-transform-mismatch:path-state", "cleanup", /candidate path.*final state/iu],
    [
      "candidate-advancement-chain-invalid:transition-record",
      "cleanup",
      /exact decomposition transition record/iu,
    ],
    ["post-merge-validation-refused:changed-paths", "advance", /exactly the composed plan paths/iu],
  ] as const)("selects the innermost code for %s", (reason, command, invariant) => {
    const invocation = command === "finish"
      ? { mode: "finish-preview" as const, origin: "origin", cutMapPath: "map.json" }
      : command === "advance" || command === "cleanup"
        ? { mode: "advance-base" as const, origin: "origin", cutMapPath: "map.json" }
        : { mode: "execute" as const, origin: "origin", cutMapPath: "map.json" };
    const remedy = v3DecomposeRemedy({ invocation, reason, locus: "/repo/candidate" });

    expect(remedy.invariant).toMatch(invariant);
    expect(remedy.argv).toEqual(command === "preflight"
      ? ["arc", "decompose", "origin", "--preflight"]
      : command === "finish"
        ? ["arc", "decompose", "origin", "--finish", "map.json"]
        : command === "cleanup"
          ? ["arc", "teardown", "--branch", "chore/decompose-origin"]
          : command === "advance"
            ? ["arc", "decompose", "origin", "--advance-base", "map.json"]
            : ["arc", "decompose", "origin", "--execute", "map.json"]);
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
