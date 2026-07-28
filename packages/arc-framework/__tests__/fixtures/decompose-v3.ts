import { canonicalDigest, sortByCanonicalBytes } from "../../src/lib/canonical/canonical-json.js";
import {
  v3CandidatePublication,
  v3DecomposeReceiptPath,
  v3PlanId,
  v3PreparationId,
  v3TopologyDigest,
  type V3DecomposePreparation,
} from "../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  createV3DecomposeReceipt,
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
  v3SourceArtifactDigest,
  v3SourceId,
  v3SourceInventoryDigest,
  type V3DecomposeCutMap,
} from "../../src/lib/work-unit/decompose-v3-schema.js";

export function v3DecompositionEvidenceFixture(options: {
  origin?: string;
  sourceHead?: string;
  resultBaseHead?: string;
  digestLabel?: (label: string) => ReturnType<typeof canonicalDigest>;
} = {}): {
  preparation: V3DecomposePreparation;
  receipt: V3DecomposeReceipt;
} {
  const origin = options.origin ?? "origin";
  const sourceBranch = `plan/${origin}`;
  const digestLabel = options.digestLabel ?? canonicalDigest;
  const sourceLocator = { artifact: `draft-${origin}.md`, kind: "preamble" as const };
  const sourceUnit = {
    sourceId: v3SourceId({ sourcePath: `.arc/active/draft-${origin}.md`, sourceLocator }),
    sourcePath: `.arc/active/draft-${origin}.md`,
    sourceLocator,
    contentDigest: digestLabel("source unit"),
  };
  const incomingEdge = {
    dependent: "consumer",
    currentTargets: [origin],
    edgeId: v3IncomingEdgeId({ dependent: "consumer", currentTargets: [origin] }),
  };
  const machineFacts = {
    source: {
      origin,
      kind: "started-planning" as const,
      logicalBranch: sourceBranch,
      ref: `refs/heads/${sourceBranch}`,
      head: options.sourceHead ?? "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: options.resultBaseHead ?? "b".repeat(40) },
    planningProfile: { kind: "draft" as const, sourceDesign: [`draft-${origin}.md`] },
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
      placement: { kind: "cohort", cohort: origin },
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
    `.arc/backlog/planned/${origin}/member-a/meta-member-a.md`,
    `.arc/backlog/planned/${origin}/member-b/meta-member-b.md`,
  ];
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  const topologyPath = `.arc/backlog/planned/${origin}/cohort-${origin}.md`;
  const recordPath = v3DecomposeReceiptPath(receiptId);
  const allowedPaths = sortByCanonicalBytes([
    ...resultPaths,
    roadmapPath,
    topologyPath,
    recordPath,
  ]);
  const allowedPathsDigest = v3AllowedPathsDigest(allowedPaths);
  if (allowedPathsDigest === null) throw new Error("fixture paths must be canonical");
  const candidatePublication = v3CandidatePublication(
    completedMap,
    { kind: "cohort", cohort: origin },
  );
  const topologyFacts = [{
    kind: "create" as const,
    path: topologyPath,
    before: { kind: "absent" as const },
    after: {
      kind: "file" as const,
      mode: "100644" as const,
      contentDigest: digestLabel("cohort topology"),
    },
  }];
  const topology = { facts: topologyFacts, digest: v3TopologyDigest(topologyFacts) };
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
    contentDigest: digestLabel(label),
  });
  const prospectiveProjection = {
    overlay: { origin, sourceBranch, planId },
    roadmap: {
      path: roadmapPath,
      before: file("roadmap before"),
      after: file("roadmap after"),
    },
  };
  const destinationOutputPaths = [
    { destinationId: "member-a", paths: [resultPaths[0]!] },
    { destinationId: "member-b", paths: [resultPaths[1]!] },
  ];
  const sourceArtifactDigest = v3SourceArtifactDigest([{
    path: sourceUnit.sourcePath,
    objectKind: "blob",
    mode: "100644",
    contentDigest: sourceUnit.contentDigest,
  }]);
  if (sourceArtifactDigest === null) throw new Error("fixture source artifacts must be canonical");
  const facts = {
    preflightId: machine.preflightId,
    completedMap,
    cutMapDigest,
    sourceArtifactDigest,
    sourceInventoryDigest: v3SourceInventoryDigest(machine),
    incomingEdgeInventoryDigest: v3IncomingEdgeInventoryDigest(machine),
    outgoingEdgeInventoryDigest: v3OutgoingEdgeInventoryDigest(machine),
    allowedPaths,
    allowedPathsDigest,
    candidateOwnership: { kind: "not-applicable" as const, protection: "partial" as const },
    candidatePublication,
    topology,
    destinationOutputPaths,
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
    destinationOutputPaths,
    prospectiveProjection,
  });
  const preparation: V3DecomposePreparation = {
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId,
    preparationId,
    facts,
  };
  const managedPathResults = [
    {
      path: roadmapPath,
      before: prospectiveProjection.roadmap.before,
      after: prospectiveProjection.roadmap.after,
    },
    {
      path: topologyPath,
      before: absent,
      after: topologyFacts[0]!.after,
    },
    ...resultPaths.map((path, index) => ({
      path,
      before: absent,
      after: file(`result ${index}`),
    })),
  ];
  const outputsA = [{
    path: resultPaths[0]!,
    after: managedPathResults.find(({ path }) => path === resultPaths[0])!.after,
  }];
  const outputsB = [{
    path: resultPaths[1]!,
    after: managedPathResults.find(({ path }) => path === resultPaths[1])!.after,
  }];
  const receipt = createV3DecomposeReceipt(
    preparation,
    managedPathResults,
    [
      { destinationId: "member-a", outputs: outputsA },
      { destinationId: "member-b", outputs: outputsB },
    ],
    { kind: "selected", slugs: ["member-a"] },
  );
  if (receipt === null) throw new Error("fixture receipt must be canonical");
  return { preparation, receipt };
}
