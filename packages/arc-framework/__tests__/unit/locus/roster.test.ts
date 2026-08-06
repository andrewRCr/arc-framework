/** Checkout-directed subject and roster projection. */

import { posix } from "node:path";

import { describe, expect, it } from "vitest";

import {
  projectManagedSubject,
  projectProvisionalRoster,
} from "../../../src/lib/locus/roster.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
  type SubjectMetaProjection,
} from "../../../src/lib/locus/subject-meta.js";
import type { LocusEvidenceResult } from "../../../src/lib/locus/evidence.js";
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
      io: subjectIO(files),
    });
    expect(result).toMatchObject({ kind: "resolved", taskCursor: { status: "malformed" } });
  });
});

function record(subject: LocusRecordV1["role"]["subject"]): LocusRecordV1 {
  return recordAt("1", "/repo-wt", subject);
}

function recordAt(
  digit: string,
  checkoutPath: string,
  subject: LocusRecordV1["role"]["subject"] = { kind: "work-unit", key: "demo", claimId: null },
): LocusRecordV1 {
  return {
    schemaVersion: 1,
    recordId: `sha256:${digit.repeat(64)}`,
    checkoutPath,
    role: {
      kind: subject.kind === "work-unit" ? "work-unit" : "errand",
      subject,
      establishedAt: "2026-07-20T00:00:00.000Z",
      parentCheckoutPath: null,
      originEntry: null,
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

  it("keeps claimless transient marker provenance unresolved despite an exact identity claim and branch", () => {
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "demo",
      claimId: "2".repeat(32),
      protection: "full",
      branch: "chore/demo",
      purpose: "errand",
      origin: "description",
      originEntry: null,
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
    })).toEqual({ kind: "unresolved", reasons: ["subject-unresolved"] });
    expect(projectManagedSubject({
      ...base,
      record: record({ kind: "errand", key: "demo", claimId: "4".repeat(32) }),
    })).toEqual({ kind: "unresolved", reasons: ["subject-unresolved"] });
  });

  it("resolves only ready transient provenance for the exact identity generation", () => {
    const claimId = "5".repeat(32);
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "demo",
      claimId,
      protection: "full",
      branch: "chore/demo",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    };
    const project = (provisioning: "pending" | "ready", markerClaimId = claimId) => projectManagedSubject({
      identity: "andrew",
      checkout: { path: "/repo-wt", head: "a".repeat(40), branch: "chore/demo", detached: false, primary: false },
      record: record({ kind: "errand", key: "demo", claimId }),
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: true,
          spawningIdentity: "andrew",
          createdAt: "2026-07-20T00:00:00.000Z",
          createdFor: { kind: "errand", slug: "demo", claimId: markerClaimId },
          provisioning,
        },
      },
      identities: {
        kind: "complete",
        tip: "3".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["demo", identity]]),
        diagnostics: [],
      },
      meta: null,
    });

    expect(project("ready")).toEqual({ kind: "resolved", authority: "transient", identity, meta: null });
    expect(project("pending")).toEqual({ kind: "unresolved", reasons: ["subject-unresolved"] });
    expect(project("ready", "6".repeat(32))).toEqual({
      kind: "unresolved",
      reasons: ["subject-unresolved"],
    });
  });

  it("treats unified primary occupancy as exact transient agreement", () => {
    const claimId = "7".repeat(32);
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "demo",
      claimId,
      protection: "full",
      branch: "chore/demo",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "open",
      savedHead: null,
      changeRequest: null,
    };
    expect(projectManagedSubject({
      identity: "andrew",
      checkout: { path: "/repo", head: "a".repeat(40), branch: "chore/demo", detached: false, primary: true },
      record: recordAt("7", "/repo", { kind: "errand", key: "demo", claimId }),
      marker: {
        kind: "present",
        marker: {
          spawnedByArc: false,
          spawningIdentity: "andrew",
          createdAt: "2026-07-20T00:00:00.000Z",
          createdFor: { kind: "errand", slug: "demo", claimId },
          provisioning: "ready",
          parentCheckoutPath: "/repo-wu",
        },
      },
      identities: {
        kind: "complete",
        tip: "3".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["demo", identity]]),
        diagnostics: [],
      },
      meta: null,
    })).toEqual({ kind: "resolved", authority: "transient", identity, meta: null });
  });
});

describe("provisional roster classification", () => {
  it("classifies record-free primary, unmanaged checkout, and identity-only tails", () => {
    const identity: LocusIdentityV1 = {
      kind: "errand",
      key: "tail",
      claimId: "8".repeat(32),
      protection: "full",
      branch: "chore/tail",
      purpose: "errand",
      origin: "description",
      originEntry: null,
      state: "paused",
      savedHead: "9".repeat(40),
      changeRequest: null,
    };
    const evidence = {
      kind: "complete",
      root: { primaryPath: "/repo", userRoot: "/user", lociRoot: "/loci", locksRoot: "/locks" },
      topology: { ok: true, worktrees: [] },
      checkouts: ["/repo", "/linked"].map((path, index) => ({
        worktree: {
          path,
          head: String(index).repeat(40),
          branch: index === 0 ? "main" : "feature/manual",
          detached: false,
          primary: index === 0,
        },
        canonical: { kind: "resolved", path },
        marker: { kind: "absent" },
        metaRoots: [],
        metas: [],
      })),
      recordEntries: [],
      records: [],
      lockEntries: [],
      locks: [],
      identities: {
        kind: "complete",
        tip: "a".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map([["tail", identity]]),
        diagnostics: [],
      },
    } satisfies Extract<LocusEvidenceResult, { kind: "complete" }>;
    expect(projectProvisionalRoster({ evidence, subjects: new Map() }).rows.map((row) => row.kind))
      .toEqual(["unmanaged-checkout", "free-primary", "identity-only"]);
  });

  it("classifies managed, stale, malformed, and duplicate record generations", () => {
    const managed = recordAt("1", "/managed");
    const stale = recordAt("2", "/stale");
    const duplicateA = recordAt("3", "/alias-a");
    const duplicateB = recordAt("4", "/alias-b");
    const recordEntry = (value: LocusRecordV1, canonical: string) => ({
      kind: "record" as const,
      name: `locus-${value.recordId.slice("sha256:".length)}.json`,
      digest: value.recordId.slice("sha256:".length),
      path: `/loci/locus-${value.recordId.slice("sha256:".length)}.json`,
      result: { kind: "valid" as const, record: value, bytes: Buffer.from(value.recordId) },
      canonical: { kind: "resolved" as const, path: canonical },
    });
    const records = [
      recordEntry(managed, "/managed"),
      recordEntry(stale, "/stale"),
      recordEntry(duplicateA, "/physical-alias"),
      recordEntry(duplicateB, "/physical-alias"),
      {
        kind: "record" as const,
        name: `locus-${"5".repeat(64)}.json`,
        digest: "5".repeat(64),
        path: `/loci/locus-${"5".repeat(64)}.json`,
        result: { kind: "malformed" as const, message: "bad record" },
      },
    ];
    const checkout = {
      worktree: { path: "/managed", head: "a".repeat(40), branch: "feat/demo", detached: false, primary: false },
      canonical: { kind: "resolved" as const, path: "/managed" },
      marker: { kind: "absent" as const },
      metaRoots: [],
      metas: [],
    };
    const evidence = {
      kind: "complete",
      root: { primaryPath: "/repo", userRoot: "/user", lociRoot: "/loci", locksRoot: "/locks" },
      topology: { ok: true, worktrees: [checkout.worktree] },
      checkouts: [checkout],
      recordEntries: records,
      records,
      lockEntries: [],
      locks: [],
      identities: { kind: "absent" },
    } satisfies Extract<LocusEvidenceResult, { kind: "complete" }>;
    const subject: SubjectMetaProjection = RESOLVED_META;
    const result = projectProvisionalRoster({
      evidence,
      subjects: new Map([[managed.recordId, {
        kind: "resolved",
        authority: "work-unit",
        identity: null,
        meta: subject as Extract<SubjectMetaProjection, { kind: "resolved" }>,
      }]]),
    });
    expect(result.rows.map((row) => row.kind)).toEqual([
      "duplicate-locus",
      "duplicate-locus",
      "managed-role",
      "stale-record",
      "malformed-record",
    ]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "record-malformed", source: expect.objectContaining({ kind: "record" }) }),
      expect.objectContaining({ code: "duplicate-locus", source: expect.objectContaining({ kind: "record" }) }),
    ]));
  });

  it("preserves path, identity, and orphan-lock diagnostics in deterministic order", () => {
    const keys = ["/é", "/😀", "/z", "/e\u0301", "/a"];
    const checkouts = [
      ...keys.map((path, index) => ({
        worktree: { path, head: String(index).repeat(40), branch: `b${index}`, detached: false, primary: false },
        canonical: { kind: "resolved" as const, path },
        marker: { kind: "absent" as const },
        metaRoots: [],
        metas: [],
      })),
      {
        worktree: { path: "/broken", head: "f".repeat(40), branch: "broken", detached: false, primary: false },
        canonical: { kind: "error" as const, message: "realpath denied" },
        marker: { kind: "absent" as const },
        metaRoots: [],
        metas: [],
      },
    ];
    const evidence = {
      kind: "complete",
      root: { primaryPath: "/repo", userRoot: "/user", lociRoot: "/loci", locksRoot: "/locks" },
      topology: { ok: true, worktrees: checkouts.map((item) => item.worktree) },
      checkouts,
      recordEntries: [],
      records: [],
      lockEntries: [{ kind: "unexpected", name: "orphan" }],
      locks: [],
      identities: {
        kind: "complete",
        tip: "b".repeat(40),
        objects: new Map(),
        records: new Map(),
        projections: new Map(),
        diagnostics: [{ kind: "malformed", key: "bad-id", message: "bad identity" }],
      },
    } satisfies Extract<LocusEvidenceResult, { kind: "complete" }>;
    const result = projectProvisionalRoster({ evidence, subjects: new Map() });
    expect(result.rows.map((row) => row.checkoutPath)).toEqual([
      "/a", "/broken", "/e\u0301", "/z", "/é", "/😀",
    ]);
    expect(result.diagnostics).toEqual([...result.diagnostics].sort((left, right) =>
      Buffer.compare(
        Buffer.from(`${left.code}\0${left.source.kind}\0${left.source.key}`),
        Buffer.from(`${right.code}\0${right.source.kind}\0${right.source.key}`),
      )));
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "path-unavailable", source: { kind: "checkout", key: "/broken" } }),
      expect.objectContaining({ code: "identity-malformed", source: { kind: "identity", key: "bad-id" } }),
      expect.objectContaining({ code: "lock-unknown", source: { kind: "lock", key: "orphan" } }),
    ]));
  });

  it("retains every checkout spelling for physical aliases", () => {
    const checkouts = ["/alias", "/alias-link"].map((path) => ({
      worktree: { path, head: "c".repeat(40), branch: "feat/alias", detached: false, primary: false },
      canonical: { kind: "resolved" as const, path: "/physical" },
      marker: { kind: "absent" as const },
      metaRoots: [],
      metas: [],
    }));
    const evidence = {
      kind: "complete",
      root: { primaryPath: "/repo", userRoot: "/user", lociRoot: "/loci", locksRoot: "/locks" },
      topology: { ok: true, worktrees: checkouts.map((item) => item.worktree) },
      checkouts,
      recordEntries: [], records: [], lockEntries: [], locks: [], identities: { kind: "absent" },
    } satisfies Extract<LocusEvidenceResult, { kind: "complete" }>;
    expect(projectProvisionalRoster({ evidence, subjects: new Map() }).rows).toMatchObject([
      { kind: "duplicate-locus", checkoutPath: "/alias" },
      { kind: "duplicate-locus", checkoutPath: "/alias-link" },
    ]);
  });
});
