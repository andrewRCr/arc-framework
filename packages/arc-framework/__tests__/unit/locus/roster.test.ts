/** Checkout-directed subject and roster projection. */

import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  projectCheckoutSubjectMeta,
  projectManagedSubject,
  type SubjectMetaIO,
  type SubjectMetaProjection,
} from "../../../src/lib/locus/roster.js";
import type { LocusIdentityV1, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";

function meta(fields: {
  state: string;
  owner?: string;
  branch: string;
  taskList: string;
  currentWorkflow?: string;
  nextAction?: string;
  cohort?: string;
}): string {
  return `# Metadata: demo

- **State:** \`${fields.state}\`
- **Owner:** \`${fields.owner ?? "andrew"}\`
- **Branch:** \`${fields.branch}\`
- **Cohort:** ${fields.cohort ?? "[none]"}
- **Task List:** ${fields.taskList}
- **Current Workflow:** ${fields.currentWorkflow ?? "[none]"}
- **Next Action:** ${fields.nextAction ?? "Continue"}
`;
}

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

describe("checkout-directed subject projection", () => {
  it("selects the exact WU meta and derives its execution cursor, cohort, and load set", async () => {
    const cwd = "/repo-wt";
    const demoMetaPath = `${cwd}/.arc/active/meta-demo.md`;
    const files = new Map([
      [demoMetaPath, meta({
        state: "Active",
        branch: "feat/demo",
        taskList: "`tasks-demo.md`",
        cohort: "`release/core`",
      })],
      [`${cwd}/.arc/active/meta-other.md`, meta({
        state: "Active",
        branch: "feat/other",
        taskList: "`tasks-other.md`",
      })],
      [`${cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[ ]` **1.1 Do it**\n"],
      [`${cwd}/.arc/backlog/planned/release/core/cohort-core.md`, "# Cohort\n"],
    ]);

    const result = await projectCheckoutSubjectMeta({
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "maintainer" },
      candidates: [
        { kind: "read", name: "meta-other.md", path: `${cwd}/.arc/active/meta-other.md`, text: files.get(`${cwd}/.arc/active/meta-other.md`) ?? "" },
        { kind: "read", name: "meta-demo.md", path: demoMetaPath, text: files.get(demoMetaPath) ?? "" },
      ],
      activeExtensions: ["pre-pr-open"],
      io: subjectIO(files),
    });

    expect(result).toMatchObject({
      kind: "resolved",
      metaPath: ".arc/active/meta-demo.md",
      owner: "andrew",
      branch: "feat/demo",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskCursor: { status: "found", cursor: { section: { id: "1.1" }, leaf: { id: "1.1" } } },
      cohortDocPath: ".arc/backlog/planned/release/core/cohort-core.md",
      loadSet: { entries: expect.arrayContaining([
        { path: ".arc/active/meta-demo.md", readMode: { kind: "full" } },
        { path: ".arc/active/tasks-demo.md", readMode: { kind: "partial-strategic" } },
      ]) },
    });
  });

  it.each([
    { state: "Planning", taskList: "[none]", currentWorkflow: "create-spec", sessionType: "planning", workflow: "planning", stage: "create-spec" },
    { state: "Integrating", taskList: "`tasks-demo.md`", currentWorkflow: "[none]", sessionType: "integration", workflow: "integrate-work-unit", stage: null },
  ])("derives $sessionType workflow state from the selected meta", async (scenario) => {
    const cwd = "/repo-wt";
    const metaPath = `${cwd}/.arc/active/meta-demo.md`;
    const files = new Map([[metaPath, meta({
      state: scenario.state,
      branch: "feat/demo",
      taskList: scenario.taskList,
      currentWorkflow: scenario.currentWorkflow,
    })]]);
    const result = await projectCheckoutSubjectMeta({
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "maintainer" },
      candidates: [{ kind: "read", name: "meta-demo.md", path: metaPath, text: files.get(metaPath) ?? "" }],
      activeExtensions: [],
      io: subjectIO(files),
    });
    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: scenario.sessionType,
      workflow: scenario.workflow,
      stage: scenario.stage,
    });
  });

  it("projects contributor-root metas and reports a missing task list", async () => {
    const cwd = "/repo-wt";
    const metaPath = `${cwd}/.arc/user/andrew/active/meta-demo.md`;
    const files = new Map([[metaPath, meta({
      state: "Active",
      branch: "feat/demo",
      taskList: "`tasks-demo.md`",
    })]]);
    const result = await projectCheckoutSubjectMeta({
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "contributor", identity: "andrew" },
      candidates: [{ kind: "read", name: "meta-demo.md", path: metaPath, text: files.get(metaPath) ?? "" }],
      activeExtensions: [],
      io: subjectIO(files),
    });
    expect(result).toMatchObject({
      kind: "resolved",
      metaPath: ".arc/user/andrew/active/meta-demo.md",
      taskListPath: ".arc/user/andrew/active/tasks-demo.md",
      taskCursor: { status: "missing", path: ".arc/user/andrew/active/tasks-demo.md" },
    });
  });

  it("preserves a malformed task-list cursor without losing the subject meta", async () => {
    const cwd = "/repo-wt";
    const metaPath = `${cwd}/.arc/active/meta-demo.md`;
    const files = new Map([
      [metaPath, meta({ state: "Active", branch: "feat/demo", taskList: "`tasks-demo.md`" })],
      [`${cwd}/.arc/active/tasks-demo.md`, "## **Phase 1:** Demo\n\n### `[ ]` **missing-id**\n"],
    ]);
    const result = await projectCheckoutSubjectMeta({
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "maintainer" },
      candidates: [{ kind: "read", name: "meta-demo.md", path: metaPath, text: files.get(metaPath) ?? "" }],
      activeExtensions: [],
      io: subjectIO(files),
    });
    expect(result).toMatchObject({ kind: "resolved", taskCursor: { status: "malformed" } });
  });
});

function record(subject: LocusRecordV1["role"]["subject"]): LocusRecordV1 {
  return {
    schemaVersion: 1,
    recordId: `sha256:${"1".repeat(64)}`,
    checkoutPath: "/repo-wt",
    role: {
      kind: subject.kind === "work-unit" ? "work-unit" : "errand",
      subject,
      establishedAt: "2026-07-20T00:00:00.000Z",
      parentCheckoutPath: null,
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
    },
    lease: null,
  };
}

const RESOLVED_META: Extract<SubjectMetaProjection, { kind: "resolved" }> = {
  kind: "resolved",
  metaPath: ".arc/active/meta-demo.md",
  owner: "andrew",
  branch: "feat/demo",
  sessionType: "execution",
  workflow: "process-task-loop",
  stage: null,
  taskListPath: null,
  taskCursor: null,
  cohortDocPath: null,
  loadSet: { manifestVersion: 1, entries: [] },
};

describe("managed subject authority", () => {
  it("requires WU marker, owner, and branch agreement", () => {
    const result = projectManagedSubject({
      identity: "andrew",
      checkout: { path: "/repo-wt", head: "a".repeat(40), branch: "feat/demo", detached: false, primary: false },
      record: record({ kind: "work-unit", key: "demo", claimId: null }),
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: true,
          spawningIdentity: "other",
          createdAt: "2026-07-20T00:00:00.000Z",
          wuName: "demo",
          createdFor: { kind: "work-unit", name: "demo" },
        },
      },
      identities: { kind: "absent" },
      meta: { ...RESOLVED_META, owner: "other", branch: "feat/elsewhere" },
    });
    expect(result).toEqual({
      kind: "unresolved",
      reasons: expect.arrayContaining(["cross-identity", "subject-unresolved"]),
    });
  });

  it("joins a transient only through its exact identity claim and branch", () => {
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "demo",
      claimId: "2".repeat(32),
      protection: "full",
      branch: "chore/demo",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      dispatchId: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    };
    const base = {
      identity: "andrew",
      checkout: { path: "/repo-wt", head: "a".repeat(40), branch: "chore/demo", detached: false, primary: false },
      marker: {
        kind: "present" as const,
        marker: {
          spawnedByArc: true,
          spawningIdentity: "andrew",
          createdAt: "2026-07-20T00:00:00.000Z",
          createdFor: { kind: "errand" as const, slug: "demo" },
        },
      },
      identities: {
        kind: "complete" as const,
        tip: "3".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["demo", identity]]),
        diagnostics: [],
      },
      meta: null,
    };
    expect(projectManagedSubject({
      ...base,
      record: record({ kind: "errand", key: "demo", claimId: identity.claimId }),
    })).toMatchObject({ kind: "resolved", authority: "transient", identity });
    expect(projectManagedSubject({
      ...base,
      record: record({ kind: "errand", key: "demo", claimId: "4".repeat(32) }),
    })).toEqual({ kind: "unresolved", reasons: ["subject-unresolved"] });
  });
});
