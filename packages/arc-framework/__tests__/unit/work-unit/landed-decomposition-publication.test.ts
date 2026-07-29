import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  digestBytes,
  sortByCanonicalBytes,
} from "../../../src/lib/canonical/canonical-json.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import {
  v3AllowedPathsDigest,
  v3CutMapDigest,
  parseV3DecomposeCutMap,
  type V3DecomposeCutMap,
} from "../../../src/lib/work-unit/decompose-v3-schema.js";
import {
  v3CandidatePublication,
  v3DecomposeReceiptPath,
  v3PlanId,
  v3PreparationId,
  v3TopologyDigest,
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  createV3DecomposeReceipt,
  type V3DecomposeReceipt,
} from "../../../src/lib/work-unit/decompose-v3-receipt.js";
import {
  resolveLandedDecompositionPublication,
  type LandedPublicationTreeFile,
} from "../../../src/lib/work-unit/landed-decomposition-publication.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const cwd = "/repo";
const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

function file(path: string, content: string): LandedPublicationTreeFile {
  return { path, mode: "100644", type: "blob", bytes: bytes(content) };
}

function meta(slug: string, dependsOn: string[] = []): string {
  return renderMetaFile(slug, {
    state: "Planning",
    owner: "andrew",
    branch: null,
    workClass: "Light",
    priority: "P1",
    cohort: "origin",
    dependsOn,
  });
}

function fixture(options: { memberADependencies?: string[] } = {}) {
  const metaAPath = ".arc/backlog/planned/origin/member-a/meta-member-a.md";
  const metaBPath = ".arc/backlog/planned/origin/member-b/meta-member-b.md";
  const cohortPath = ".arc/backlog/planned/origin/cohort-origin.md";
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  const content = {
    "result 0": meta("member-a", options.memberADependencies),
    "result 1": meta("member-b"),
    "cohort topology": "# Cohort: `origin`\n\n**Purpose:** Published members\n",
    "roadmap after": "# Roadmap\n",
  };
  const { receipt } = v3DecompositionEvidenceFixture({
    digestLabel: (label) => digestBytes(bytes(content[label as keyof typeof content] ?? label)),
  });
  const files = [
    file(metaAPath, content["result 0"]),
    file(metaBPath, content["result 1"]),
    file(cohortPath, content["cohort topology"]),
    file(roadmapPath, content["roadmap after"]),
  ];
  return { receipt, files, metaAPath, metaBPath, cohortPath };
}

function existingDestinationsFixture(): {
  receipt: V3DecomposeReceipt;
  files: LandedPublicationTreeFile[];
} {
  const base = v3DecompositionEvidenceFixture();
  const map = structuredClone(base.preparation.facts.completedMap) as V3DecomposeCutMap;
  map.authoring.shape = "heterogeneous";
  const workMeta = ".arc/backlog/planned/origin/home-wu/meta-home-wu.md";
  const draftMeta = ".arc/backlog/planned/origin/draft-home/meta-draft-home.md";
  const workOutput = ".arc/backlog/planned/origin/home-wu/spec-home-wu.md";
  const draftOutput = ".arc/backlog/planned/origin/draft-home/draft-draft-home.md";
  const documentOutput = ".arc/reference/architecture.md";
  const metaAPath = ".arc/backlog/planned/origin/member-a/meta-member-a.md";
  const metaBPath = ".arc/backlog/planned/origin/member-b/meta-member-b.md";
  const cohortPath = ".arc/backlog/planned/origin/cohort-origin.md";
  const roadmapPath = ".arc/backlog/ROADMAP.md";
  map.authoring.destinations = [
    {
      kind: "existing-home",
      destinationId: "a-work",
      target: { kind: "work-unit", slug: "home-wu" },
    },
    {
      kind: "existing-home",
      destinationId: "b-draft",
      target: {
        kind: "draft-block",
        slug: "draft-home",
        locator: { artifact: "draft-draft-home.md", kind: "preamble" },
      },
    },
    {
      kind: "existing-home",
      destinationId: "c-document",
      target: { kind: "document", path: documentOutput },
    },
    ...map.authoring.destinations,
  ];
  if (parseV3DecomposeCutMap(map) === null) {
    throw new Error("existing-destination cut map must remain canonical");
  }

  const contentByPath = new Map<string, string>([
    [workMeta, meta("home-wu")],
    [draftMeta, meta("draft-home")],
    [workOutput, "# Existing specification\n"],
    [draftOutput, "Owned draft preamble.\n"],
    [documentOutput, "# Architecture\n"],
    [metaAPath, meta("member-a")],
    [metaBPath, meta("member-b")],
    [cohortPath, "# Cohort: `origin`\n\n**Purpose:** Published members\n"],
    [roadmapPath, "# Roadmap after\n"],
  ]);
  const state = (path: string) => ({
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: digestBytes(bytes(contentByPath.get(path) ?? "")),
  });
  const outputPaths = new Map<string, string[]>([
    ["a-work", [workOutput]],
    ["b-draft", [draftOutput]],
    ["c-document", [documentOutput]],
    ["member-a", [metaAPath]],
    ["member-b", [metaBPath]],
  ]);
  const receiptId = base.receipt.receiptId;
  const receiptPath = v3DecomposeReceiptPath(receiptId);
  const allowedPaths = sortByCanonicalBytes([
    ...[...outputPaths.values()].flat(),
    cohortPath,
    roadmapPath,
    receiptPath,
  ]);
  const allowedPathsDigest = v3AllowedPathsDigest(allowedPaths);
  if (allowedPathsDigest === null) throw new Error("fixture paths must be canonical");
  const candidatePublication = v3CandidatePublication(
    map,
    { kind: "cohort", cohort: "origin" },
  );
  const topologyFacts = [{
    kind: "create" as const,
    path: cohortPath,
    before: { kind: "absent" as const },
    after: state(cohortPath),
  }];
  const topology = { facts: topologyFacts, digest: v3TopologyDigest(topologyFacts) };
  const cutMapDigest = v3CutMapDigest(map);
  const planId = v3PlanId({
    preflightId: map.machine.preflightId,
    cutMapDigest,
    allowedPathsDigest,
    candidatePublication,
    topologyDigest: topology.digest,
  });
  const prospectiveProjection = {
    overlay: {
      origin: "origin",
      sourceBranch: "plan/origin",
      planId,
    },
    roadmap: {
      path: roadmapPath,
      before: {
        kind: "file" as const,
        mode: "100644" as const,
        contentDigest: digestBytes(bytes("# Roadmap before\n")),
      },
      after: state(roadmapPath),
    },
  };
  const destinationOutputPaths = map.authoring.destinations.map(({ destinationId }) => ({
    destinationId,
    paths: outputPaths.get(destinationId) ?? [],
  }));
  const facts = {
    ...base.preparation.facts,
    completedMap: map,
    cutMapDigest,
    allowedPaths,
    allowedPathsDigest,
    candidatePublication,
    topology,
    destinationOutputPaths,
    prospectiveProjection,
  };
  const preparationId = v3PreparationId({
    receiptId,
    planId,
    resultBaseHead: map.machine.resultBase.head,
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
  if (parseV3DecomposePreparation(preparation) === null) {
    throw new Error("existing-destination preparation must remain canonical");
  }
  const absent = { kind: "absent" as const };
  const resultPaths = [...outputPaths.values()].flat();
  const managedPathResults = sortByCanonicalBytes([
    ...resultPaths,
    cohortPath,
    roadmapPath,
  ]).map((path) => ({
    path,
    before: path === cohortPath || path === metaAPath || path === metaBPath
      ? absent
      : path === roadmapPath
        ? prospectiveProjection.roadmap.before
        : {
          kind: "file" as const,
          mode: "100644" as const,
          contentDigest: digestBytes(bytes(`before:${path}`)),
        },
    after: state(path),
  }));
  const destinationOutputs = destinationOutputPaths.map(({ destinationId, paths }) => ({
    destinationId,
    outputs: paths.map((path) => ({ path, after: state(path) })),
  }));
  const receipt = createV3DecomposeReceipt(
    preparation,
    managedPathResults,
    destinationOutputs,
    { kind: "selected", slugs: ["member-a"] },
  );
  if (receipt === null) throw new Error("existing-destination fixture must remain canonical");
  return {
    receipt,
    files: [...contentByPath].map(([path, content]) => file(path, content)),
  };
}

describe("resolveLandedDecompositionPublication", () => {
  it("resolves the exact landed cohort, ordered leaves, and selected readiness", async () => {
    const { receipt, files, metaAPath, metaBPath, cohortPath } = fixture();

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files,
      readiness: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(
            candidates.map(({ slug }) => [slug, { kind: "ready" as const }]),
          ),
        },
      },
    });

    expect(result).toEqual({
      status: "resolved",
      publication: {
        anchor: {
          kind: "cohort",
          cohort: "origin",
          displayPath: dirname(cohortPath),
        },
        entries: [
          {
            kind: "new-leaf",
            slug: "member-a",
            displayPath: dirname(metaAPath),
            readiness: { kind: "ready" },
          },
          {
            kind: "new-leaf",
            slug: "member-b",
            displayPath: dirname(metaBPath),
            readiness: { kind: "ready" },
          },
        ],
      },
    });
  });

  it("preserves dependency and provider blockers from the shared readiness reducer", async () => {
    const { receipt, files } = fixture({ memberADependencies: ["foundation"] });

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files,
      readiness: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(candidates.map(({ slug }) => [
            slug,
            slug === "member-a"
              ? {
                kind: "blocked" as const,
                blockers: [{ code: "provider-blocked", locus: "member-a:provider" }],
              }
              : { kind: "ready" as const },
          ])),
        },
      },
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.publication.entries[0]).toMatchObject({
      kind: "new-leaf",
      readiness: {
        kind: "blocked",
        blockers: [
          {
            code: "dependency-missing",
            locus: expect.stringContaining("Depends On:foundation"),
          },
          { code: "provider-blocked", locus: "member-a:provider" },
        ],
      },
    });
  });

  it("resolves work-unit, exact draft-block, and document destination arms", async () => {
    const { receipt, files } = existingDestinationsFixture();

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files,
      readiness: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(
            candidates.map(({ slug }) => [slug, { kind: "ready" as const }]),
          ),
        },
      },
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.publication.entries.slice(0, 3)).toEqual([
      {
        kind: "existing-destination",
        destinationId: "a-work",
        target: { kind: "work-unit", slug: "home-wu" },
        displayPath: ".arc/backlog/planned/origin/home-wu",
      },
      {
        kind: "existing-destination",
        destinationId: "b-draft",
        target: {
          kind: "draft-block",
          slug: "draft-home",
          locator: { artifact: "draft-draft-home.md", kind: "preamble" },
        },
        displayPath: ".arc/backlog/planned/origin/draft-home/draft-draft-home.md",
      },
      {
        kind: "existing-destination",
        destinationId: "c-document",
        target: {
          kind: "document",
          path: ".arc/reference/architecture.md",
        },
        displayPath: ".arc/reference/architecture.md",
      },
    ]);
  });

  it("refuses duplicate live records instead of reducing them by ordinary precedence", async () => {
    const { receipt, files } = fixture();

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files: [
        ...files,
        file(".arc/active/meta-member-a.md", meta("member-a")),
      ],
      readiness: {
        readinessProvider: {
          resolve: () => new Map(),
        },
      },
    });

    expect(result).toEqual({
      status: "projection-mismatch",
      reason: "project-record-duplicate",
      locus: "member-a",
    });
  });

  it("changes only the display path when a cohort anchor moves with valid structural identity", async () => {
    const { receipt, files } = fixture();
    const movedPath = ".arc/completed/2026-Q3/01a_cohort-origin/cohort-origin.md";
    const moved = files.map((entry) =>
      entry.path.endsWith("cohort-origin.md")
        ? file(movedPath, "# Cohort: `origin`\n\n**Purpose:** Published members\n")
        : entry);

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files: moved,
      readiness: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(
            candidates.map(({ slug }) => [slug, { kind: "ready" as const }]),
          ),
        },
      },
    });

    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.publication.anchor).toEqual({
      kind: "cohort",
      cohort: "origin",
      displayPath: dirname(movedPath),
    });
    expect(receipt.finalized.publication.logicalAnchor).toEqual({
      kind: "cohort",
      cohort: "origin",
    });
  });

  it("refuses duplicate structurally valid anchor locations", async () => {
    const { receipt, files } = fixture();

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files: [
        ...files,
        file(
          ".arc/completed/2026-Q3/01a_cohort-origin/cohort-origin.md",
          "# Cohort: `origin`\n\n**Purpose:** Published members\n",
        ),
      ],
      readiness: {
        readinessProvider: {
          resolve: () => new Map(),
        },
      },
    });

    expect(result).toEqual({
      status: "projection-mismatch",
      reason: "logical-anchor-duplicate",
      locus: "origin",
    });
  });

  it.each([
    [
      "changed destination bytes",
      (files: LandedPublicationTreeFile[]) => files.map((entry) =>
        entry.path.endsWith("meta-member-a.md")
          ? file(entry.path, `${meta("member-a")}\nchanged\n`)
          : entry),
      {
        status: "projection-mismatch",
        reason: "destination-path-mismatch",
        locus: ".arc/backlog/planned/origin/member-a/meta-member-a.md",
      },
    ],
    [
      "wrong cohort structural identity",
      (files: LandedPublicationTreeFile[]) => files.map((entry) =>
        entry.path.endsWith("cohort-origin.md")
          ? file(entry.path, "# Cohort: `elsewhere`\n\n**Purpose:** Wrong\n")
          : entry),
      {
        status: "projection-mismatch",
        reason: "logical-anchor-identity",
        locus: "origin",
      },
    ],
  ] as const)("refuses %s without a partial publication", async (_label, mutate, expected) => {
    const { receipt, files } = fixture();

    const result = await resolveLandedDecompositionPublication({
      cwd,
      receipt,
      files: mutate([...files]),
      readiness: {
        readinessProvider: {
          resolve: () => new Map(),
        },
      },
    });

    expect(result).toEqual(expected);
  });
});
