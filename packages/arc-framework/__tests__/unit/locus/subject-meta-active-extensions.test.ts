/** Active-extension input seam for checkout-directed subject projection. */

import { posix } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { LoadSetProjectionInput } from "../../../src/lib/load-set/projection.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
} from "../../../src/lib/locus/subject-meta.js";
import {
  createStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  projectCandidateReviewBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  reduceCandidateDurableBaseline,
  serializeCandidateManagedRecord,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { classifyCandidateApplicability } from
  "../../../src/lib/work-unit/candidate-applicability.js";
import { projectEffectiveCandidateTarget } from
  "../../../src/lib/work-unit/candidate-effective-target.js";
import type { CandidateTargetProjector } from
  "../../../src/lib/work-unit/candidate-effective-target.js";
import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";

const resolverInputs = vi.hoisted(() => [] as LoadSetProjectionInput[]);

vi.mock("../../../src/lib/load-set/projection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/load-set/projection.js")>();
  return {
    ...actual,
    resolveLoadSetManifest(input: LoadSetProjectionInput) {
      resolverInputs.push(input);
      return actual.resolveLoadSetManifest(input);
    },
  };
});

function subjectIO(files: ReadonlyMap<string, string>): SubjectMetaIO {
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return content;
    },
    pathExists: async (path) => files.has(path),
    realpath: async (path) => posix.normalize(path),
    lstat: async () => ({ isSymbolicLink: () => false }),
    projectCandidateTarget: async ({ record }) => {
      const baseline = reduceCandidateDurableBaseline(record);
      return projectEffectiveCandidateTarget({
        record,
        current: baseline.target,
        currentBase: record.attestation.baseRevision,
        projectApplicability: async () => {
          throw new Error("A durable target must not request applicability.");
        },
      });
    },
  };
}

function candidateRecord(slug: string): { candidateId: string; subjectDigest: string; content: string } {
  const subject = createCandidateSubjectSnapshot([]);
  const attestation = createCandidateAttestation({
    workUnit: slug,
    subject,
    baseRevision: "a".repeat(40),
    attestedBy: "andrew",
    attestedAt: "2026-08-19T00:00:00.000Z",
    verificationEvidenceRef: `tasks-${slug}.md#verification`,
  });
  return {
    candidateId: attestation.candidateId,
    subjectDigest: subject.subjectDigest,
    content: serializeCandidateManagedRecord({
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation,
      subject,
      transitions: [],
      lineageAttestations: [],
    }),
  };
}

const projectCandidateApplicabilityDecision: CandidateTargetProjector = async ({ record }) => {
  const baseline = reduceCandidateDurableBaseline(record);
  const currentSubject = createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "changed" }),
    treatment: "reviewable",
  }]);
  const decision = classifyCandidateApplicability({
    candidateId: baseline.candidateId,
    baselineTarget: baseline.target,
    currentTarget: { revision: "b".repeat(40), subject: currentSubject },
    currentBase: "c".repeat(40),
  }, {
    endpoints: {
      before: {
        predecessor: { head: "1".repeat(40), tree: "2".repeat(40) },
        member: { head: baseline.target.revision, tree: "3".repeat(40) },
      },
      after: {
        predecessor: { head: "4".repeat(40), tree: "5".repeat(40) },
        member: { head: "b".repeat(40), tree: "6".repeat(40) },
      },
    },
    proof: {
      status: "refused",
      reason: "contribution-diverged",
      paths: ["packages/arc-framework/src/example.ts"],
    },
  });
  if (decision.state !== "decision-required") throw new Error("expected an applicability decision");
  return decision;
};

function ownerAcceptedPublishBoundary(input: {
  slug: string;
  candidateId: string;
  subjectDigest: string;
}) {
  return IntegrationBoundaryLocusSchema.parse({
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: input.slug,
    candidateId: input.candidateId,
    candidateSubjectDigest: input.subjectDigest,
    locus: "candidate-publish-ready",
    nextAction: {
      kind: "publish-candidate",
      command: `arc publish ${input.slug} --json`,
      interactionText: "Publish the current Candidate.",
    },
    policy: null,
    reservation: null,
    terminus: {
      schemaVersion: 1,
      semanticsVersion: "review-terminus/v1",
      kind: "owner-accepted",
      lane: "standard",
      acceptedBy: "andrew",
      completedPasses: 5,
    },
  });
}

function fixture() {
  const cwd = "/repo-wt";
  const metaPath = `${cwd}/.arc/active/meta-demo.md`;
  const taskListPath = `${cwd}/.arc/active/tasks-demo.md`;
  const cohortDocPath = `${cwd}/.arc/backlog/planned/release/core/cohort-core.md`;
  const files = new Map([
    [metaPath, `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Current Workflow:** [none]
- **Next Action:** Continue
`],
    [taskListPath, "## **Phase 1:** Demo\n\n### `[ ]` **1.1 Do it**\n"],
    [cohortDocPath, "# Cohort\n"],
  ]);
  return {
    files,
    options: {
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "maintainer" as const },
      candidates: [{
        kind: "read" as const,
        name: "meta-demo.md",
        path: metaPath,
        text: files.get(metaPath) ?? "",
      }],
      io: subjectIO(files),
    },
  };
}

describe("checkout subject active-extension seam", () => {
  it("passes supplied active extensions unchanged to one load-set projection", async () => {
    resolverInputs.length = 0;
    const { options } = fixture();
    const activeExtensions = ["release-notes", "security-review"] as const;

    const result = await projectCheckoutSubjectMeta({ ...options, activeExtensions });

    expect(resolverInputs).toHaveLength(1);
    expect(resolverInputs[0]?.activeExtensions).toBe(activeExtensions);
    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskCursor: { status: "found", cursor: { section: { id: "1.1" }, leaf: { id: "1.1" } } },
      cohortDocPath: ".arc/backlog/planned/release/core/cohort-core.md",
    });
    expect(result.kind === "resolved" ? result.loadSet.entries : []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("extensions/") }),
    ]));
  });

  it("projects the exact durable publication boundary on integration resume", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId, subjectDigest } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Integrating\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`integrate-work-unit\`
- **Next Action:** stale narrative
`;
    const reservation = createStandardReviewReservation({
      candidateId,
      sourceId: "codex-pr",
      repository: "arc-framework/example",
      headSha: "b".repeat(40),
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"c".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    const storedBoundary = IntegrationBoundaryLocusSchema.parse({
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: "demo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      locus: "candidate-publish-ready",
      nextAction: {
        kind: "publish-candidate",
        command: "arc publish demo --json",
        interactionText: "Submit the current Candidate for publication.",
      },
      policy: null,
      reservation,
    });
    const recoveredBoundary = projectPublicationBoundary({
      workUnit: "demo",
      branch: "feat/demo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      changeRequest: null,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(
      `${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`,
      JSON.stringify(storedBoundary),
    );

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    });

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.integrationBoundary).toEqual(recoveredBoundary);
  });

  it("keeps an Integrating re-root recoverable while pre-publication review is pending", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId, subjectDigest } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Integrating\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`integrate-work-unit\`
- **Next Action:** stale narrative
`;
    const boundary = projectCandidateReviewBoundary({
      workUnit: "demo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(
      `${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`,
      JSON.stringify(boundary),
    );

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "integration",
      workflow: "integrate-work-unit",
      taskCursor: { status: "no-open-task" },
      integrationBoundary: boundary,
    });
  });

  it("preserves an exact Integrating boundary while Candidate applicability awaits authority", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId, subjectDigest } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Integrating\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`integrate-work-unit\`
- **Next Action:** stale narrative
`;
    const boundary = projectCandidateReviewBoundary({
      workUnit: "demo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(
      `${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`,
      JSON.stringify(boundary),
    );

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
      io: { ...options.io, projectCandidateTarget: projectCandidateApplicabilityDecision },
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "integration",
      workflow: "integrate-work-unit",
      taskCursor: { status: "no-open-task" },
      integrationBoundary: boundary,
    });
  });

  it("does not recover pending applicability through a boundary bound to another subject", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Integrating\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`integrate-work-unit\`
- **Next Action:** stale narrative
`;
    const mismatched = projectCandidateReviewBoundary({
      workUnit: "demo",
      candidateId,
      candidateSubjectDigest: `sha256:${"9".repeat(64)}`,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(
      `${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`,
      JSON.stringify(mismatched),
    );

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
      io: { ...options.io, projectCandidateTarget: projectCandidateApplicabilityDecision },
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: null,
      workflow: null,
      integrationBoundary: null,
    });
  });

  it("keeps Active prepublication strict while Candidate applicability awaits authority", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidate.candidateId}\`
- **Current Workflow:** \`prepare-work-unit\`
- **Next Action:** stale narrative
`;
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);

    await expect(projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
      io: { ...options.io, projectCandidateTarget: projectCandidateApplicabilityDecision },
    })).resolves.toMatchObject({
      kind: "unresolved",
      code: "subject-unresolved",
      message: "Candidate target requires request-authority.",
    });
  });

  it("projects a Candidate-bearing Active subject as prepublication", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`prepare-work-unit\`
- **Next Action:** stale narrative
`;
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "prepublication",
      workflow: "prepare-work-unit",
      taskCursor: { status: "no-open-task" },
      integrationBoundary: { candidateId, locus: "candidate-review-pending" },
    });
    expect(result.kind === "resolved" ? result.loadSet.entries : []).toContainEqual({
      path: ".arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      readMode: { kind: "full" },
    });
  });

  it("does not require Candidate currentness while an Active subject is back in task execution", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const projector = vi.fn(async () => {
      throw new Error("execution recovery must not project Candidate authority");
    });
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidate.candidateId}\`
- **Current Workflow:** [none]
- **Next Action:** Continue reopened work
`;
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
      io: { ...options.io, projectCandidateTarget: projector },
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "execution",
      workflow: "process-task-loop",
      taskCursor: { status: "found", cursor: { section: { id: "1.1" }, leaf: { id: "1.1" } } },
      integrationBoundary: null,
    });
    expect(projector).not.toHaveBeenCalled();
  });

  it("projects a closed Active task list as execution verification closeout", async () => {
    resolverInputs.length = 0;
    const { options, files } = fixture();
    files.set(
      `${options.cwd}/.arc/active/tasks-demo.md`,
      "## **Phase 1:** Verification\n\n### `[x]` **1.1 Complete verification**\n",
    );

    const result = await projectCheckoutSubjectMeta(options);

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "execution",
      workflow: "verify-work-unit",
      taskCursor: { status: "no-open-task" },
      integrationBoundary: null,
    });
    expect(resolverInputs.at(-1)).toMatchObject({
      sessionType: "execution",
      executionStage: "verification-closeout",
    });
    expect(result.kind === "resolved" ? result.loadSet.entries : []).toContainEqual({
      path: ".arc/system/workflows/arc/work-unit-lifecycle/verify-work-unit.md",
      readMode: { kind: "full" },
    });
    expect(result.kind === "resolved" ? result.loadSet.entries : []).not.toContainEqual({
      path: ".arc/active/tasks-demo.md",
      readMode: { kind: "partial-strategic" },
    });
  });

  it("preserves the exact durable Active prepublication boundary on recovery", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId, subjectDigest } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`prepare-work-unit\`
- **Next Action:** stale narrative
`;
    const boundary = ownerAcceptedPublishBoundary({ slug: "demo", candidateId, subjectDigest });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`, JSON.stringify(boundary));

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    });

    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "prepublication",
      workflow: "prepare-work-unit",
      integrationBoundary: boundary,
    });
  });

  it("does not recover an Active prepublication boundary for a stale Candidate subject", async () => {
    const { options, files } = fixture();
    const candidate = candidateRecord("demo");
    const { candidateId, subjectDigest } = candidate;
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`prepare-work-unit\`
- **Next Action:** stale narrative
`;
    const stale = ownerAcceptedPublishBoundary({
      slug: "demo",
      candidateId,
      subjectDigest: `sha256:${"9".repeat(64)}`,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.json`, candidate.content);
    files.set(`${options.cwd}/.arc/system/.internal/candidates/demo.boundary.json`, JSON.stringify(stale));

    const result = await projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    });

    expect(result).toMatchObject({
      kind: "resolved",
      integrationBoundary: {
        candidateId,
        candidateSubjectDigest: subjectDigest,
        terminus: null,
        locus: "candidate-review-pending",
        nextAction: { kind: "run-self-review" },
      },
    });
  });

  it.each([
    ["Active", "prepare-work-unit"],
    ["Integrating", "integrate-work-unit"],
  ])("degrades malformed Candidate metadata in %s instead of throwing", async (state, workflow) => {
    const { options, files } = fixture();
    const meta = `# Metadata: demo

- **State:** \`${state}\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`not-a-candidate\`
- **Current Workflow:** \`${workflow}\`
- **Next Action:** stale narrative
`;
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);

    await expect(projectCheckoutSubjectMeta({
      ...options,
      candidates: [{
        kind: "read",
        name: "meta-demo.md",
        path: `${options.cwd}/.arc/active/meta-demo.md`,
        text: meta,
      }],
    })).resolves.toMatchObject({
      kind: "unresolved",
      code: "subject-unresolved",
      metaPath: ".arc/active/meta-demo.md",
    });
  });

  it("makes omission output-identical to an explicit empty extension list", async () => {
    const { options } = fixture();

    const omitted = await projectCheckoutSubjectMeta(options);
    const explicit = await projectCheckoutSubjectMeta({ ...options, activeExtensions: [] });

    expect(omitted).toEqual(explicit);
  });
});
