import { canonicalDigest, sortByCanonicalBytes } from "../../src/lib/canonical/canonical-json.js";
import {
  v3CandidatePublication,
  v3PlanId,
  v3PreparationId,
  type V3DecomposePreparation,
} from "../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  v3DestinationDigest,
  v3TransitionPatchDigest,
  type V3DecomposeReceipt,
} from "../../src/lib/work-unit/decompose-v3-receipt.js";
import {
  v3AllowedPathsDigest,
  v3CutMapDigest,
  v3IncomingEdgeId,
  v3IncomingEdgeInventoryDigest,
  v3OutgoingEdgeInventoryDigest,
  v3PreflightId,
  v3ReceiptId,
  v3SourceId,
  v3SourceInventoryDigest,
  type V3DecomposeCutMap,
} from "../../src/lib/work-unit/decompose-v3-schema.js";

export function v3DecompositionEvidenceFixture(): {
  preparation: V3DecomposePreparation;
  receipt: V3DecomposeReceipt;
} {
  const sourceLocator = { artifact: "draft-origin.md", kind: "preamble" as const };
  const sourceUnit = {
    sourceId: v3SourceId({ sourcePath: ".arc/active/draft-origin.md", sourceLocator }),
    sourcePath: ".arc/active/draft-origin.md",
    sourceLocator,
    contentDigest: canonicalDigest("source unit"),
  };
  const incomingEdge = {
    dependent: "consumer",
    currentTargets: ["origin"],
    edgeId: v3IncomingEdgeId({ dependent: "consumer", currentTargets: ["origin"] }),
  };
  const machineFacts = {
    source: {
      origin: "origin",
      kind: "started-planning" as const,
      logicalBranch: "plan/origin",
      ref: "refs/heads/plan/origin",
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: { kind: "draft" as const, sourceDesign: ["draft-origin.md"] },
    sourceUnits: [sourceUnit],
    incomingEdges: [incomingEdge],
    outgoingEdges: [],
  };
  const machine = { preflightId: v3PreflightId(machineFacts), ...machineFacts };
  const completedMap: V3DecomposeCutMap = {
    schemaVersion: 3,
    machine,
    authoring: {
      shape: "symmetric",
      placement: { kind: "cohort", cohort: "origin" },
      destinations: [
        { kind: "new-member", destinationId: "member-a", slug: "member-a", workClass: "Light" },
        { kind: "new-member", destinationId: "member-b", slug: "member-b", workClass: "Light" },
      ],
      internalEdges: [],
      sourceAllocations: [{
        sourceId: sourceUnit.sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member-a",
          targetLocator: { artifact: "draft-member-a.md", kind: "preamble" },
        },
      }],
      incomingDispositions: [{
        edgeId: incomingEdge.edgeId,
        disposition: { kind: "replace", replacementTargets: ["member-a"] },
      }],
      outgoingDispositions: [],
    },
  };
  const receiptId = v3ReceiptId(machine);
  const resultPaths = [
    ".arc/backlog/planned/origin/member-a/meta-member-a.md",
    ".arc/backlog/planned/origin/member-b/meta-member-b.md",
  ];
  const recordPath = `.arc/system/.internal/retirement-receipts/${receiptId.replace(":", "-")}.json`;
  const allowedPaths = sortByCanonicalBytes([...resultPaths, recordPath]);
  const allowedPathsDigest = v3AllowedPathsDigest(allowedPaths);
  if (allowedPathsDigest === null) throw new Error("fixture paths must be canonical");
  const candidatePublication = v3CandidatePublication(
    completedMap,
    { kind: "cohort", cohort: "origin" },
  );
  const topology = { facts: [{ kind: "none" as const }], digest: canonicalDigest([{ kind: "none" }]) };
  const cutMapDigest = v3CutMapDigest(completedMap);
  const planId = v3PlanId({
    preflightId: machine.preflightId,
    cutMapDigest,
    allowedPathsDigest,
    candidatePublication,
    topologyDigest: topology.digest,
  });
  const absent = { kind: "absent" as const };
  const file = (label: string) => ({
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: canonicalDigest(label),
  });
  const prospectiveProjection = {
    overlay: { origin: "origin", sourceBranch: "plan/origin", planId },
    roadmap: {
      path: ".arc/backlog/ROADMAP.md",
      before: file("roadmap before"),
      after: file("roadmap after"),
    },
  };
  const facts = {
    preflightId: machine.preflightId,
    completedMap,
    cutMapDigest,
    sourceArtifactDigest: canonicalDigest("source artifacts"),
    sourceInventoryDigest: v3SourceInventoryDigest(machine),
    incomingEdgeInventoryDigest: v3IncomingEdgeInventoryDigest(machine),
    outgoingEdgeInventoryDigest: v3OutgoingEdgeInventoryDigest(machine),
    allowedPaths,
    allowedPathsDigest,
    candidateOwnership: { kind: "not-applicable" as const, protection: "partial" as const },
    candidatePublication,
    topology,
    prospectiveProjection,
  };
  const preparationId = v3PreparationId({
    receiptId,
    planId,
    resultBaseHead: machine.resultBase.head,
    sourceArtifactDigest: facts.sourceArtifactDigest,
    sourceInventoryDigest: facts.sourceInventoryDigest,
    incomingEdgeInventoryDigest: facts.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: facts.outgoingEdgeInventoryDigest,
    cutMapDigest,
    allowedPathsDigest,
    candidateOwnership: facts.candidateOwnership,
    candidatePublication,
    topologyDigest: topology.digest,
    prospectiveProjection,
  });
  const preparation: V3DecomposePreparation = {
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId,
    preparationId,
    facts,
  };
  const managedPathResults = resultPaths.map((path, index) => ({
    path,
    before: absent,
    after: file(`result ${index}`),
  }));
  const transitionPatch = [...managedPathResults];
  const outputsA = [{ path: resultPaths[0]!, after: managedPathResults[0]!.after }];
  const outputsB = [{ path: resultPaths[1]!, after: managedPathResults[1]!.after }];
  const digestA = v3DestinationDigest("member-a", outputsA);
  const digestB = v3DestinationDigest("member-b", outputsB);
  if (digestA === null || digestB === null) throw new Error("fixture outputs must be canonical");
  const receipt: V3DecomposeReceipt = {
    kind: "decompose-receipt",
    schemaVersion: 3,
    receiptId,
    preparationId,
    prepared: facts,
    finalized: {
      destinationDigests: [
        { destinationId: "member-a", digest: digestA },
        { destinationId: "member-b", digest: digestB },
      ],
      managedPathResults,
      transitionPatch,
      transitionPatchDigest: v3TransitionPatchDigest(transitionPatch),
      publication: {
        ...candidatePublication,
        initialContinuation: { kind: "selected", slugs: ["member-a"] },
      },
    },
  };
  return { preparation, receipt };
}
