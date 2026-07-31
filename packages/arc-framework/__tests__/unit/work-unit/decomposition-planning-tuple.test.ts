import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationAnchor,
} from "../../../src/lib/work-unit/decomposition-integration-anchor.js";
import {
  validateDecompositionPlanningTuple,
  type DecompositionPlanningArtifact,
  type DecompositionPlanningTupleInput,
} from "../../../src/lib/work-unit/decomposition-planning-tuple.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const PREPARED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_TREE = "d".repeat(40);
const MEMBER = "member-a";
const ROOT = `.arc/backlog/planned/origin/${MEMBER}`;

function fileState(label: string): DecompositionPlanningArtifact["state"] {
  return {
    kind: "file",
    mode: "100644",
    contentDigest: digestBytes(new TextEncoder().encode(label)),
  };
}

function resolvedAnchor(): DecompositionIntegrationAnchor {
  const { receipt } = v3DecompositionEvidenceFixture();
  const result = produceDecompositionIntegrationAnchor({
    receipts: [receipt],
    preparedBaseHead: PREPARED_BASE,
    candidateCommit: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    receiptTransitionTree: CANDIDATE_TREE,
    currentBaseHead: CANDIDATE_HEAD,
    baseDescent: { kind: "exact" },
    landingRelation: { kind: "exact" },
    landing: {
      kind: "fast-forward",
      beforeHead: PREPARED_BASE,
      resultHead: CANDIDATE_HEAD,
      resultTree: CANDIDATE_TREE,
    },
  });
  if (result.status !== "resolved") throw new Error("fixture anchor did not resolve");
  return result.anchor;
}

function markedInput(
  profile: "draft" | "single-spec" | "paired-spec",
  options: {
    design?: string[];
    workflow?: string | null;
    taskList?: string | null;
    seed?: string | null;
  } = {},
): DecompositionPlanningTupleInput {
  const anchor = resolvedAnchor();
  const design = options.design ?? (
    profile === "draft"
      ? [`draft-${MEMBER}.md`]
      : profile === "single-spec"
        ? [`spec-${MEMBER}.md`]
        : [`spec-${MEMBER}-prd.md`, `spec-${MEMBER}-rfc.md`]
  );
  const expectedWorkflow = profile === "draft" ? "draft-design" : "generate-tasks";
  const content = renderMetaFile(MEMBER, {
    state: "Planning",
    owner: "andrew",
    design,
    taskList: options.taskList ?? null,
    currentWorkflow: options.workflow === undefined ? expectedWorkflow : options.workflow,
    decompositionReceipt: anchor.receiptId,
  });
  const artifacts: DecompositionPlanningArtifact[] = [
    { path: `${ROOT}/meta-${MEMBER}.md`, state: fileState("meta") },
    ...design.map((basename) => ({ path: `${ROOT}/${basename}`, state: fileState(basename) })),
  ];
  if (options.seed !== null) {
    artifacts.push({
      path: `${ROOT}/${options.seed ?? `tasks-${MEMBER}.md`}`,
      state: fileState(options.seed ?? "tasks"),
    });
  }
  anchor.receipt.prepared.completedMap.machine.planningProfile = profile === "draft"
    ? { kind: "draft", sourceDesign: ["draft-origin.md"] }
    : profile === "single-spec"
      ? { kind: "single-spec", sourceDesign: ["spec-origin.md"] }
      : { kind: "paired-spec", sourceDesign: ["spec-origin-prd.md", "spec-origin-rfc.md"] };
  anchor.receipt.finalized.publication.entries = [{ kind: "new-leaf", slug: MEMBER }];
  anchor.receipt.finalized.managedPathResults = artifacts.map(({ path, state }) => ({
    path,
    before: { kind: "absent" },
    after: state.kind === "file" ? state : { kind: "absent" },
  }));
  return {
    expectedSlug: MEMBER,
    metaPath: `${ROOT}/meta-${MEMBER}.md`,
    metaContent: content,
    meta: parseMetaRecord(content),
    artifacts,
    anchor,
  };
}

describe("validateDecompositionPlanningTuple", () => {
  it.each(["draft", "single-spec", "paired-spec"] as const)(
    "accepts the exact receipt-bound %s tuple",
    (profile) => {
      const result = validateDecompositionPlanningTuple(markedInput(profile, { seed: null }));
      expect(result).toMatchObject({ status: "valid", provenance: "decomposition" });
      if (result.status === "valid") expect(result.profile.kind).toBe(profile);
    },
  );

  it("accepts one exact provisional task seed without granting task authority", () => {
    expect(validateDecompositionPlanningTuple(markedInput("single-spec"))).toMatchObject({
      status: "valid",
      provenance: "decomposition",
      taskAuthority: "provisional-seed",
    });
  });

  it("accepts an unset recorded workflow for later exact derivation", () => {
    expect(validateDecompositionPlanningTuple(markedInput("paired-spec", {
      workflow: null,
      seed: null,
    }))).toMatchObject({
      status: "valid",
      provenance: "decomposition",
      recordedWorkflow: null,
      expectedWorkflow: "generate-tasks",
    });
  });

  it("keeps ordinary create-spec valid when the optional marker is absent", () => {
    const content = renderMetaFile(MEMBER, {
      state: "Planning",
      owner: "andrew",
      design: [`draft-${MEMBER}.md`],
      currentWorkflow: "create-spec",
    });
    expect(validateDecompositionPlanningTuple({
      expectedSlug: MEMBER,
      metaPath: `${ROOT}/meta-${MEMBER}.md`,
      metaContent: content,
      meta: parseMetaRecord(content),
      artifacts: [
        { path: `${ROOT}/meta-${MEMBER}.md`, state: fileState("meta") },
        { path: `${ROOT}/draft-${MEMBER}.md`, state: fileState("draft") },
      ],
      anchor: null,
    })).toMatchObject({
      status: "valid",
      provenance: "ordinary",
      profile: { kind: "draft" },
    });
  });

  it("refuses wrong design identity, artifact family, task authority, and workflow at exact loci", () => {
    expect(validateDecompositionPlanningTuple(markedInput("draft", {
      design: ["draft-other.md"],
      seed: null,
    }))).toMatchObject({ status: "refused", reason: "design-mismatch", locus: "meta-member-a.md#Design" });

    const missingArtifact = markedInput("single-spec", { seed: null });
    missingArtifact.artifacts.splice(1, 1);
    expect(validateDecompositionPlanningTuple(missingArtifact)).toMatchObject({
      status: "refused",
      reason: "artifact-mismatch",
      locus: `spec-${MEMBER}.md`,
    });

    expect(validateDecompositionPlanningTuple(markedInput("single-spec", {
      taskList: `tasks-${MEMBER}.md`,
    }))).toMatchObject({
      status: "refused",
      reason: "task-authority",
      locus: "meta-member-a.md#Task List",
    });

    expect(validateDecompositionPlanningTuple(markedInput("draft", {
      workflow: "create-spec",
      seed: null,
    }))).toMatchObject({
      status: "refused",
      reason: "workflow-mismatch",
      locus: "meta-member-a.md#Current Workflow",
    });

    expect(validateDecompositionPlanningTuple(markedInput("draft", {
      workflow: "unknown-workflow",
      seed: null,
    }))).toMatchObject({
      status: "refused",
      reason: "workflow-mismatch",
      locus: "meta-member-a.md#Current Workflow",
    });

    expect(validateDecompositionPlanningTuple(markedInput("paired-spec", {
      design: [`spec-${MEMBER}-rfc.md`, `spec-${MEMBER}-prd.md`],
      seed: null,
    }))).toMatchObject({
      status: "refused",
      reason: "design-mismatch",
      locus: "meta-member-a.md#Design",
    });

    expect(validateDecompositionPlanningTuple(markedInput("single-spec", {
      seed: "tasks-other.md",
    }))).toMatchObject({
      status: "refused",
      reason: "task-authority",
      locus: "tasks-other.md",
    });

    const duplicateTask = markedInput("single-spec");
    duplicateTask.artifacts.push({
      path: `${ROOT}/tasks-other.md`,
      state: fileState("other tasks"),
    });
    expect(validateDecompositionPlanningTuple(duplicateTask)).toMatchObject({
      status: "refused",
      reason: "task-authority",
    });

    const changedState = markedInput("single-spec", { seed: null });
    changedState.artifacts[1]!.state = fileState("changed spec");
    expect(validateDecompositionPlanningTuple(changedState)).toMatchObject({
      status: "refused",
      reason: "artifact-mismatch",
      locus: `spec-${MEMBER}.md`,
    });

    const missingTask = markedInput("single-spec", {
      taskList: `tasks-${MEMBER}.md`,
      seed: null,
    });
    expect(validateDecompositionPlanningTuple(missingTask)).toMatchObject({
      status: "refused",
      reason: "task-authority",
      locus: "meta-member-a.md#Task List",
    });
  });

  it("refuses malformed or unanchored markers and a publication mismatch before tuple authority", () => {
    const malformed = markedInput("draft", { seed: null });
    malformed.metaContent = malformed.metaContent.replace(malformed.anchor!.receiptId, "sha256:nope");
    malformed.meta = parseMetaRecord(malformed.metaContent);
    expect(validateDecompositionPlanningTuple(malformed)).toMatchObject({
      status: "refused",
      reason: "marker-malformed",
      locus: "meta-member-a.md#Decomposition Receipt",
    });

    const unanchored = markedInput("draft", { seed: null });
    unanchored.anchor = null;
    expect(validateDecompositionPlanningTuple(unanchored)).toMatchObject({
      status: "refused",
      reason: "anchor-missing",
      locus: "meta-member-a.md#Decomposition Receipt",
    });

    const wrongEntry = markedInput("draft", { seed: null });
    wrongEntry.anchor!.receipt.finalized.publication.entries = [{ kind: "new-leaf", slug: "other" }];
    expect(validateDecompositionPlanningTuple(wrongEntry)).toMatchObject({
      status: "refused",
      reason: "publication-mismatch",
      locus: "receipt.finalized.publication.entries",
    });

    const wrongReceipt = markedInput("draft", { seed: null });
    wrongReceipt.anchor!.receiptId = `sha256:${"f".repeat(64)}`;
    expect(validateDecompositionPlanningTuple(wrongReceipt)).toMatchObject({
      status: "refused",
      reason: "receipt-mismatch",
      locus: "meta-member-a.md#Decomposition Receipt",
    });

    const duplicateMarker = markedInput("draft", { seed: null });
    const marker = `- **Decomposition Receipt:** \`${duplicateMarker.anchor!.receiptId}\``;
    duplicateMarker.metaContent = duplicateMarker.metaContent.replace(marker, `${marker}\n${marker}`);
    expect(validateDecompositionPlanningTuple(duplicateMarker)).toMatchObject({
      status: "refused",
      reason: "marker-duplicate",
      locus: "meta-member-a.md#Decomposition Receipt",
    });
  });
});
