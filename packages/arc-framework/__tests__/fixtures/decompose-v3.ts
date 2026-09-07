import { canonicalDigest, sortByCanonicalBytes } from "../../src/lib/canonical/canonical-json.js";
import {
  v3PlanId,
  v3TopologyDigest,
} from "../../src/lib/work-unit/decompose-v3-plan.js";
import {
  v3AllowedPathsDigest,
  v3CutMapDigest,
  v3IncomingEdgeId,
  v3PreflightId,
  v3SourceId,
  type V3DecomposeCutMap,
} from "../../src/lib/work-unit/decompose-v3-schema.js";

/** Canonical completed-map and plan facts shared by receipt-free decomposition tests. */
export function v3DecompositionEvidenceFixture(): {
  preparation: {
    facts: {
      completedMap: V3DecomposeCutMap;
      cutMapDigest: ReturnType<typeof canonicalDigest>;
      allowedPaths: string[];
      allowedPathsDigest: ReturnType<typeof canonicalDigest>;
      topology: {
        facts: Array<{
          kind: "create";
          path: string;
          before: { kind: "absent" };
          after: { kind: "file"; mode: "100644"; contentDigest: ReturnType<typeof canonicalDigest> };
        }>;
        digest: ReturnType<typeof canonicalDigest>;
      };
      destinationOutputPaths: Array<{ destinationId: string; paths: string[] }>;
      prospectiveProjection: {
        overlay: { origin: string; sourceBranch: string; planId: ReturnType<typeof canonicalDigest> };
        roadmap: {
          path: string;
          before: { kind: "file"; mode: "100644"; contentDigest: ReturnType<typeof canonicalDigest> };
          after: { kind: "file"; mode: "100644"; contentDigest: ReturnType<typeof canonicalDigest> };
        };
      };
    };
  };
} {
  const origin = "origin";
  const sourceBranch = `plan/${origin}`;
  const sourceLocator = { artifact: `draft-${origin}.md`, kind: "preamble" as const };
  const sourceUnit = {
    sourceId: v3SourceId({ sourcePath: `.arc/active/draft-${origin}.md`, sourceLocator }),
    sourcePath: `.arc/active/draft-${origin}.md`,
    sourceLocator,
    contentDigest: canonicalDigest("source unit"),
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
      head: "a".repeat(40),
    },
    resultBase: { ref: "refs/heads/main", head: "b".repeat(40) },
    planningProfile: { kind: "draft" as const, sourceDesign: [`draft-${origin}.md`] },
    sourceUnits: [sourceUnit],
    incomingEdges: [incomingEdge],
    outgoingEdges: [],
  };
  const completedMap: V3DecomposeCutMap = {
    schemaVersion: 3,
    machine: { preflightId: v3PreflightId(machineFacts), ...machineFacts },
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
  const destinationRoot = `.arc/backlog/planned/${origin}`;
  const resultPaths = [
    `${destinationRoot}/member-a/meta-member-a.md`,
    `${destinationRoot}/member-b/meta-member-b.md`,
  ];
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  const topologyPath = `${destinationRoot}/cohort-${origin}.md`;
  const allowedPaths = sortByCanonicalBytes([...resultPaths, roadmapPath, topologyPath]);
  const allowedPathsDigest = v3AllowedPathsDigest(allowedPaths);
  if (allowedPathsDigest === null) throw new Error("fixture paths must be canonical");
  const topologyFacts = [{
    kind: "create" as const,
    path: topologyPath,
    before: { kind: "absent" as const },
    after: {
      kind: "file" as const,
      mode: "100644" as const,
      contentDigest: canonicalDigest("cohort topology"),
    },
  }];
  const topology = { facts: topologyFacts, digest: v3TopologyDigest(topologyFacts) };
  const cutMapDigest = v3CutMapDigest(completedMap);
  const planId = v3PlanId({
    preflightId: completedMap.machine.preflightId,
    cutMapDigest,
    allowedPathsDigest,
    topologyDigest: topology.digest,
  });
  const file = (label: string) => ({
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: canonicalDigest(label),
  });
  return {
    preparation: {
      facts: {
        completedMap,
        cutMapDigest,
        allowedPaths,
        allowedPathsDigest,
        topology,
        destinationOutputPaths: [
          { destinationId: "member-a", paths: [resultPaths[0]!] },
          { destinationId: "member-b", paths: [resultPaths[1]!] },
        ],
        prospectiveProjection: {
          overlay: { origin, sourceBranch, planId },
          roadmap: { path: roadmapPath, before: file("roadmap before"), after: file("roadmap after") },
        },
      },
    },
  };
}
