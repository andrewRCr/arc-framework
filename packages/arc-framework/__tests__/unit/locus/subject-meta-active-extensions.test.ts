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
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

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
  };
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
    const candidateId = `sha256:${"a".repeat(64)}`;
    const meta = `# Metadata: demo

- **State:** \`Integrating\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** [none]
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
    const boundary = projectPublicationBoundary({
      workUnit: "demo",
      branch: "feat/demo",
      candidateId,
      reservation,
      changeRequest: null,
    });
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
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

    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") expect(result.integrationBoundary).toEqual(boundary);
  });

  it("projects a Candidate-bearing Active subject as prepublication", async () => {
    const { options, files } = fixture();
    const candidateId = `sha256:${"a".repeat(64)}`;
    const meta = `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Candidate:** \`${candidateId}\`
- **Current Workflow:** \`integrate-work-unit\`
- **Next Action:** stale narrative
`;
    files.set(`${options.cwd}/.arc/active/meta-demo.md`, meta);
    files.set(`${options.cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[x]` **1.1 Done**\n");

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

  it("makes omission output-identical to an explicit empty extension list", async () => {
    const { options } = fixture();

    const omitted = await projectCheckoutSubjectMeta(options);
    const explicit = await projectCheckoutSubjectMeta({ ...options, activeExtensions: [] });

    expect(omitted).toEqual(explicit);
  });
});
