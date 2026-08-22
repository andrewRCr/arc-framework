/**
 * Integration tests for the active-status probe.
 *
 * Builds synthetic `.arc/active/` fixture trees — zero-file, one-file, and
 * many-file under Full layout plus single-file under Lite layout — and
 * exercises the real `runActiveStatus` / `runActiveSessionInitStatus`
 * against them. Covers layout detection, per-WU field parsing, and
 * session-init resolution shaping (none/single/multiple).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runActiveSessionInitStatus,
  runActiveSessionInitStatusInternal,
  runActiveStatus,
} from "../../src/commands/active.js";
import {
  createStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  projectPublicationBoundary,
} from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { stubGitExec } from "../helpers/integration.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  serializeCandidateManagedRecord,
} from "../../src/lib/work-unit/candidate-attestation.js";

/** Shared default — non-planning branch keeps existing assertions stable. */
const defaultExec = stubGitExec("main");

interface Fixture {
  root: string;
  activeDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-active-probe-"));
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  return { root, activeDir };
}

async function writeCandidate(root: string, slug: string): Promise<{ candidateId: string; subjectDigest: string }> {
  const subject = createCandidateSubjectSnapshot([]);
  const attestation = createCandidateAttestation({
    workUnit: slug,
    subject,
    baseRevision: "a".repeat(40),
    attestedBy: "andrew",
    attestedAt: "2026-08-19T00:00:00.000Z",
    verificationEvidenceRef: `tasks-${slug}.md#verification`,
  });
  const directory = join(root, ".arc", "system", ".internal", "candidates");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${slug}.json`), serializeCandidateManagedRecord({
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation,
    subject,
    transitions: [],
    lineageAttestations: [],
  }));
  return { candidateId: attestation.candidateId, subjectDigest: subject.subjectDigest };
}

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

function statusBody(fields: {
  state: string;
  branch: string;
  currentWorkflow?: string;
  design?: string;
  nextTask?: string;
  taskList?: string;
  nextAction?: string;
  candidateId?: string;
}): string {
  const lines: string[] = [
    "# Metadata: fixture",
    "",
    `- **State:** ${fields.state}`,
    `- **Branch:** ${fields.branch}`,
  ];
  if (fields.design !== undefined) lines.push(`- **Design:** ${fields.design}`);
  if (fields.currentWorkflow !== undefined) {
    lines.push(`- **Current Workflow:** ${fields.currentWorkflow}`);
  }
  if (fields.taskList !== undefined) lines.push(`- **Task List:** ${fields.taskList}`);
  if (fields.candidateId !== undefined) lines.push(`- **Candidate:** ${fields.candidateId}`);
  if (fields.nextTask !== undefined) lines.push(`- **Next Task:** ${fields.nextTask}`);
  if (fields.nextAction !== undefined) lines.push(`- **Next Action:** ${fields.nextAction}`);
  return lines.join("\n");
}

describe("runActiveStatus — Full layout", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns an empty candidate list when .arc/active/ has no status files", async () => {
    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.mode).toBe("full");
    expect(result.layout).toBe("full");
    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("enumerates a single Full-layout candidate with all fields populated", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        nextTask: "Task 3.R.k.d — probe (line ~1828)",
        taskList: "`.arc/active/tasks-foo.md`",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("full");
    expect(result.candidates).toHaveLength(1);
    const c = result.candidates[0]!;
    expect(c.filename).toBe("meta-foo.md");
    expect(c.path).toBe(".arc/active/meta-foo.md");
    expect(c.branch).toBe("technical/foo");
    expect(c.state).toBe("Active");
    expect(c.nextTask).toBe("Task 3.R.k.d — probe (line ~1828)");
    expect(c.taskList).toBe(".arc/active/tasks-foo.md");
  });

  it("enumerates many Full-layout candidates across categories with full State values", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-alpha.md"),
      statusBody({ state: "Active", branch: "feature/alpha" }),
    );
    await writeFile(
      join(fixture.activeDir, "meta-beta.md"),
      statusBody({
        state: "Paused (2026-04-12) — waiting for restructure",
        branch: "technical/beta",
      }),
    );

    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.candidates).toHaveLength(2);
    const beta = result.candidates.find((c) => c.filename === "meta-beta.md");
    expect(beta?.state).toBe("Paused (2026-04-12) — waiting for restructure");
  });
});

describe("runActiveStatus — Lite layout", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("detects Lite layout via .arc/active/status.md and returns a single candidate", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );
    const result = await runActiveStatus({ cwd: fixture.root });
    expect(result.layout).toBe("lite");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.path).toBe(".arc/active/status.md");
    expect(result.candidates[0]!.state).toBe("Active");
  });
});

describe("runActiveSessionInitStatus — resolution states", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns resolution=none when no status files exist", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.mode).toBe("session-init");
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it("returns resolution=single with the resolved path for exactly one candidate", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "technical/foo" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/meta-foo.md");
    expect(result.candidates).toEqual([]);
  });

  it("retains semantic project placement without changing the serialized envelope", async () => {
    await writeFile(join(fixture.activeDir, "meta-foo.md"), statusBody({ state: "Active", branch: "technical/foo" }));

    const internal = await runActiveSessionInitStatusInternal({ cwd: fixture.root, exec: defaultExec });
    const envelope = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });

    expect(internal.resolved).toMatchObject({ slug: "foo", placement: { kind: "active", scope: { kind: "project" } } });
    expect(JSON.stringify(internal.result)).toBe(JSON.stringify(envelope));
  });

  it("ignores a recognized meta filename whose stem is not a canonical slug", async () => {
    await writeFile(join(fixture.activeDir, "meta-Not-A-Slug.md"), statusBody({ state: "Active", branch: "main" }));

    const result = await runActiveSessionInitStatusInternal({ cwd: fixture.root, exec: defaultExec });

    expect(result.result.resolution).toBe("none");
    expect(result.result.warnings).toContainEqual(expect.stringContaining("invalid work-unit slug"));
  });

  it("returns resolution=multiple with the full candidate list for many files", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-alpha.md"),
      statusBody({ state: "Active", branch: "feature/alpha" }),
    );
    await writeFile(
      join(fixture.activeDir, "meta-beta.md"),
      statusBody({ state: "Integrating", branch: "technical/beta" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.path).toBeNull();
    expect(result.candidates).toHaveLength(2);
    const filenames = result.candidates.map((c) => c.filename).sort();
    expect(filenames).toEqual(["meta-alpha.md", "meta-beta.md"]);
    // Candidates carry enough context for the agent to apply Step 2 Item 8's
    // branch/state precedence without re-scanning.
    const beta = result.candidates.find((c) => c.filename === "meta-beta.md");
    expect(beta?.branch).toBe("technical/beta");
    expect(beta?.state).toBe("Integrating");
  });

  it("warns per malformed Candidate without hiding a valid sibling", async () => {
    const { candidateId } = await writeCandidate(fixture.root, "alpha");
    await writeFile(
      join(fixture.activeDir, "meta-alpha.md"),
      statusBody({
        state: "Active",
        branch: "main",
        candidateId,
      }),
    );
    await writeFile(
      join(fixture.activeDir, "meta-beta.md"),
      statusBody({
        state: "Active",
        branch: "feat/beta",
        candidateId: "sha256:not-a-candidate",
      }),
    );

    const full = await runActiveStatus({ cwd: fixture.root });
    expect(full.candidates).toHaveLength(2);
    expect(full.candidates.find(({ filename }) => filename === "meta-alpha.md")).toMatchObject({
      candidateId,
      integrationBoundary: expect.objectContaining({ candidateId }),
    });
    expect(full.candidates.find(({ filename }) => filename === "meta-beta.md")).toMatchObject({
      candidateId: null,
      integrationBoundary: null,
    });
    expect(full.warnings).toContainEqual(expect.stringContaining(".arc/active/meta-beta.md"));

    const session = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(session).toMatchObject({
      resolution: "multiple",
      path: null,
      sessionType: null,
      integrationBoundary: null,
    });
    expect(session.warnings).toContainEqual(expect.stringContaining(".arc/active/meta-beta.md"));
  });

  it("resolves Lite layout's single file as resolution=single", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/status.md");
  });

  it("propagates warnings when .arc/active/ is missing entirely", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-active-missing-"));
    try {
      const result = await runActiveSessionInitStatus({ cwd: root, exec: defaultExec });
      expect(result.resolution).toBe("none");
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain(".arc/active/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("runActiveSessionInitStatus — companion-file resolution", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  async function writeFullStatus(category: string, stem: string): Promise<string> {
    await writeFile(
      join(fixture.activeDir, `meta-${stem}.md`),
      statusBody({
        state: "Active",
        branch: `${category}/${stem}`,
        taskList: `\`.arc/active/tasks-${stem}.md\``,
      }),
    );
    return fixture.activeDir;
  }

  it("populates both companion paths when notes-{stem}.md and atomic-{stem}.md exist", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBe(".arc/active/tasks-foo.md");
    expect(result.companions).toEqual({
      notes: ".arc/active/notes-foo.md",
      atomic: ".arc/active/atomic-foo.md",
    });
  });

  it("populates notes only when atomic companion is absent", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "notes-foo.md"), "# notes\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({
      notes: ".arc/active/notes-foo.md",
      atomic: null,
    });
  });

  it("populates atomic only when notes companion is absent", async () => {
    const sub = await writeFullStatus("technical", "foo");
    await writeFile(join(sub, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(sub, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({
      notes: null,
      atomic: ".arc/active/atomic-foo.md",
    });
  });

  it("emits companions with both null when neither file exists", async () => {
    await writeFullStatus("technical", "foo");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.companions).toEqual({ notes: null, atomic: null });
  });

  it("omits companions entirely for Lite-shape `tasks.md` task-list value", async () => {
    await writeFile(
      join(fixture.activeDir, "status.md"),
      statusBody({
        state: "Active",
        branch: "main",
        taskList: "`.arc/active/tasks.md`",
      }),
    );
    await writeFile(join(fixture.activeDir, "tasks.md"), "# tasks\n");
    await writeFile(join(fixture.activeDir, "notes.md"), "# notes\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBe(".arc/active/tasks.md");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `multiple`", async () => {
    const sub1 = await writeFullStatus("feature", "alpha");
    const sub2 = await writeFullStatus("technical", "beta");
    await writeFile(join(sub1, "notes-alpha.md"), "# notes\n");
    await writeFile(join(sub2, "atomic-beta.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.companions).toBeUndefined();
  });

  it("omits companions when resolution is `none`", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("none");
    expect(result.companions).toBeUndefined();
  });

  it("derives companions from meta-file directory when Task List value is a bare filename", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`tasks-foo.md`",
      }),
    );
    await writeFile(join(fixture.activeDir, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(fixture.activeDir, "notes-foo.md"), "# notes\n");
    await writeFile(join(fixture.activeDir, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBe(".arc/active/tasks-foo.md");
    expect(result.companions).toEqual({
      notes: ".arc/active/notes-foo.md",
      atomic: ".arc/active/atomic-foo.md",
    });
  });

  it("derives companions from meta-file directory when Task List value is explicitly relative", async () => {
    await writeFile(join(fixture.activeDir, "notes-foo.md"), "# Notes\n");
    await writeFile(join(fixture.activeDir, "atomic-foo.md"), "# Atomic\n");
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`./tasks-foo.md`",
      }),
    );

    let result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBe(".arc/active/tasks-foo.md");
    expect(result.companions).toEqual({
      notes: ".arc/active/notes-foo.md",
      atomic: ".arc/active/atomic-foo.md",
    });

    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`.\\tasks-foo.md`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBe(".arc/active/tasks-foo.md");
    expect(result.companions).toEqual({
      notes: ".arc/active/notes-foo.md",
      atomic: ".arc/active/atomic-foo.md",
    });
  });

  it("omits companions when Task List value is `[none]`", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "[none]",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();
  });

  it("rejects absolute, parent-traversing, and bare dot Task List values", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-absolute.md"),
      statusBody({
        state: "Active",
        branch: "technical/absolute",
        taskList: "`/tmp/tasks-absolute.md`",
      }),
    );

    let result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-absolute.md"));
    await writeFile(
      join(fixture.activeDir, "meta-parent.md"),
      statusBody({
        state: "Active",
        branch: "technical/parent",
        taskList: "`../tasks-parent.md`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-parent.md"));
    await writeFile(
      join(fixture.activeDir, "meta-embedded-parent.md"),
      statusBody({
        state: "Active",
        branch: "technical/embedded-parent",
        taskList: "`subdir/../tasks-parent.md`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-embedded-parent.md"));
    await writeFile(
      join(fixture.activeDir, "meta-drive.md"),
      statusBody({
        state: "Active",
        branch: "technical/drive",
        taskList: "`C:\\tasks-drive.md`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-drive.md"));
    await writeFile(
      join(fixture.activeDir, "meta-drive-relative.md"),
      statusBody({
        state: "Active",
        branch: "technical/drive-relative",
        taskList: "`C:tasks-drive.md`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-drive-relative.md"));
    await writeFile(
      join(fixture.activeDir, "meta-dot.md"),
      statusBody({
        state: "Active",
        branch: "technical/dot",
        taskList: "`.`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();

    await rm(join(fixture.activeDir, "meta-dot.md"));
    await writeFile(
      join(fixture.activeDir, "meta-dotdot.md"),
      statusBody({
        state: "Active",
        branch: "technical/dotdot",
        taskList: "`..`",
      }),
    );

    result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.taskListPath).toBeNull();
    expect(result.companions).toBeUndefined();
  });
});

describe("runActiveSessionInitStatus — contributor role-aware resolution", () => {
  let fixture: Fixture;
  let userActiveDir: string;
  beforeEach(async () => {
    fixture = await createFixture();
    userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("resolves contributor full-layout single → user/{identity}/active/meta-{name}.md", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
    expect(result.layout).toBe("full");
  });

  it("retains contributor scope from the resolved role and configured identity", async () => {
    await writeFile(join(userActiveDir, "meta-foo.md"), statusBody({ state: "Active", branch: "user/alice/foo" }));

    const result = await runActiveSessionInitStatusInternal({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });

    expect(result.resolved?.placement).toEqual({
      kind: "active",
      scope: { kind: "contributor", identity: "alice" },
    });
  });

  it("resolves contributor full-layout multiple → resolution=multiple with candidate list", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );
    await writeFile(
      join(userActiveDir, "meta-bar.md"),
      statusBody({ state: "Integrating", branch: "user/alice/bar" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("multiple");
    expect(result.path).toBeNull();
    expect(result.candidates).toHaveLength(2);
    const paths = result.candidates.map((c) => c.path).sort();
    expect(paths).toEqual([
      ".arc/user/alice/active/meta-bar.md",
      ".arc/user/alice/active/meta-foo.md",
    ]);
  });

  it("resolves contributor lite-layout {root}/status.md → resolution=single", async () => {
    await writeFile(
      join(userActiveDir, "status.md"),
      statusBody({ state: "Active", branch: "main" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.layout).toBe("lite");
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/status.md");
  });

  it("returns resolution=none when contributor active dir has no files", async () => {
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
  });

  it("returns resolution=none with a warning when role=contributor but identity is null", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("none");
    expect(result.path).toBeNull();
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => /identity/i.test(w))).toBe(true);
  });

  it("derives companion paths under the contributor root when single resolves with a Task List value", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
      }),
    );
    await writeFile(join(userActiveDir, "tasks-foo.md"), "# tasks\n");
    await writeFile(join(userActiveDir, "notes-foo.md"), "# notes\n");
    await writeFile(join(userActiveDir, "atomic-foo.md"), "# atomic\n");

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.companions).toEqual({
      notes: ".arc/user/alice/active/notes-foo.md",
      atomic: ".arc/user/alice/active/atomic-foo.md",
    });
  });

  it("ignores stray subdirectories under the contributor root (flat scan-shape)", async () => {
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "user/alice/foo" }),
    );
    const stray = join(userActiveDir, "technical");
    await mkdir(stray, { recursive: true });
    await writeFile(
      join(stray, "meta-stray.md"),
      statusBody({ state: "Active", branch: "technical/stray" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
  });

  it("preserves maintainer-default resolution when role is null/maintainer (behavior i)", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({ state: "Active", branch: "technical/foo" }),
    );
    // Also place a contributor-shape file that should NOT be picked up
    await writeFile(
      join(userActiveDir, "meta-other.md"),
      statusBody({ state: "Active", branch: "user/alice/other" }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "maintainer",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.path).toBe(".arc/active/meta-foo.md");
  });
});

describe("runActiveSessionInitStatus — sessionType inference", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  async function writeStatus(
    category: string,
    stem: string,
    fields: { taskList?: string; nextAction?: string },
  ): Promise<void> {
    await writeFile(
      join(fixture.activeDir, `meta-${stem}.md`),
      statusBody({
        state: "Active",
        branch: `${category}/${stem}`,
        ...fields,
      }),
    );
  }

  it("emits sessionType=planning when resolution=none + branch matches plan-pattern", async () => {
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=null when resolution=none + branch does not match plan-pattern (orphan)", async () => {
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBeNull();
  });

  it("emits sessionType=null when resolution is multiple (defer until disambiguation)", async () => {
    await writeStatus("feature", "alpha", {
      taskList: "`.arc/active/tasks-alpha.md`",
      nextAction: "Start Task 1.1 — implement",
    });
    await writeStatus("technical", "beta", {
      taskList: "`.arc/active/tasks-beta.md`",
      nextAction: "Start Task 2.3 — refactor",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("multiple");
    expect(result.sessionType).toBeNull();
  });

  it("emits sessionType=planning when resolution=single + Task List: [none]", async () => {
    await writeStatus("technical", "foo", {
      taskList: "[none]",
      nextAction: "Plan next phase",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=planning when resolution=single + Task List: [none associated]", async () => {
    await writeStatus("technical", "foo", {
      taskList: "[none associated]",
      nextAction: "Draft PRD",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("keeps sessionType=execution when Active narration begins with integrate-work-unit", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "integrate-work-unit Step 3 — push and create PR",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("keeps sessionType=execution when Active narration begins with archive-work-unit", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "archive-work-unit Step 1 — archive artifacts and retire the status file",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("emits sessionType=execution for a regular Start-Task Next Action", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "Start Task 4.2 — write unit tests",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("projects a Candidate review locus independently of narrative fields", async () => {
    const { candidateId } = await writeCandidate(fixture.root, "foo");
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "archive-work-unit Step 1",
        candidateId,
        currentWorkflow: "prepare-work-unit",
      }),
    );

    const full = await runActiveStatus({ cwd: fixture.root });
    expect(full.candidates[0]?.integrationBoundary?.locus).toBe("candidate-review-pending");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.sessionType).toBe("prepublication");
    expect(result.currentWorkflow).toBe("prepare-work-unit");
    expect(result.integrationBoundary).toMatchObject({
      candidateId,
      locus: "candidate-review-pending",
      nextAction: {
        kind: "run-self-review",
        command: "arc review pre-publication foo --json",
      },
    });
  });

  it("preserves the exact Active prepublication boundary in full and session-init status", async () => {
    const { candidateId, subjectDigest } = await writeCandidate(fixture.root, "foo");
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "stale narrative",
        candidateId,
        currentWorkflow: "prepare-work-unit",
      }),
    );
    const boundary = ownerAcceptedPublishBoundary({ slug: "foo", candidateId, subjectDigest });
    await writeFile(
      join(fixture.root, ".arc", "system", ".internal", "candidates", "foo.boundary.json"),
      JSON.stringify(boundary),
    );

    const full = await runActiveStatus({ cwd: fixture.root });
    expect(full.candidates[0]?.integrationBoundary).toEqual(boundary);

    const session = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(session.integrationBoundary).toEqual(boundary);
  });

  it("falls back to initial review when an Active prepublication boundary names a stale subject", async () => {
    const { candidateId, subjectDigest } = await writeCandidate(fixture.root, "foo");
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "stale narrative",
        candidateId,
        currentWorkflow: "prepare-work-unit",
      }),
    );
    const boundary = ownerAcceptedPublishBoundary({
      slug: "foo",
      candidateId,
      subjectDigest: `sha256:${"9".repeat(64)}`,
    });
    await writeFile(
      join(fixture.root, ".arc", "system", ".internal", "candidates", "foo.boundary.json"),
      JSON.stringify(boundary),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.integrationBoundary).toMatchObject({
      candidateId,
      candidateSubjectDigest: subjectDigest,
      terminus: null,
      locus: "candidate-review-pending",
      nextAction: { kind: "run-self-review" },
    });
  });

  it("does not fall back to execution when a Candidate record is unavailable", async () => {
    const candidateId = `sha256:${"1".repeat(64)}`;
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "technical/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "stale narrative",
        candidateId,
        currentWorkflow: "prepare-work-unit",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });

    expect(result).toMatchObject({
      resolution: "single",
      sessionType: null,
      currentWorkflow: "prepare-work-unit",
      integrationBoundary: null,
    });
    expect(result.warnings).toContainEqual(expect.stringMatching(/Candidate.*unavailable|unavailable.*Candidate/iu));
  });

  it("preserves the durable publication reservation in the session-init resume locus", async () => {
    const { candidateId, subjectDigest } = await writeCandidate(fixture.root, "foo");
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Integrating",
        branch: "technical/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "stale narrative",
        candidateId,
        currentWorkflow: "integrate-work-unit",
      }),
    );
    const reservation = createStandardReviewReservation({
      candidateId,
      sourceId: "codex-pr",
      repository: "arc-framework/example",
      headSha: "b".repeat(40),
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"d".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    const storedBoundary = IntegrationBoundaryLocusSchema.parse({
      schemaVersion: 1,
      mode: "integration-boundary",
      workUnit: "foo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      locus: "candidate-publish-ready",
      nextAction: {
        kind: "publish-candidate",
        command: "arc publish foo --json",
        interactionText: "Submit the current Candidate for publication.",
      },
      policy: null,
      reservation,
    });
    const recoveredBoundary = projectPublicationBoundary({
      workUnit: "foo",
      branch: "technical/foo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      changeRequest: null,
    });
    const boundaryDir = join(fixture.root, ".arc", "system", ".internal", "candidates");
    await mkdir(boundaryDir, { recursive: true });
    await writeFile(join(boundaryDir, "foo.boundary.json"), JSON.stringify(storedBoundary));

    const full = await runActiveStatus({ cwd: fixture.root });
    expect(full.candidates[0]?.integrationBoundary).toEqual(recoveredBoundary);

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });

    expect(result.integrationBoundary).toEqual(recoveredBoundary);
  });

  it("emits sessionType=execution for non-integration lifecycle workflows (e.g., clean-work-unit)", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "clean-work-unit Step 3 — Mode 1 mid-work cleanup",
    });
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("infers sessionType under maintainer root when identity is null", async () => {
    await writeStatus("technical", "foo", {
      taskList: "`.arc/active/tasks-foo.md`",
      nextAction: "Start Task 1.1 — kick off",
    });
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: null,
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
  });

  it("infers sessionType under contributor root with identity set", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
        nextAction: "integrate-work-unit Step 7 — push and create PR",
      }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: "alice",
      role: "contributor",
      exec: defaultExec,
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("execution");
    expect(result.path).toBe(".arc/user/alice/active/meta-foo.md");
  });

  it("falls back to branch pattern under role=contributor + identity=null short-circuit", async () => {
    const userActiveDir = join(fixture.root, ".arc", "user", "alice", "active");
    await mkdir(userActiveDir, { recursive: true });
    await writeFile(
      join(userActiveDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "user/alice/foo",
        taskList: "`.arc/user/alice/active/tasks-foo.md`",
        nextAction: "Start Task 1.1 — implement",
      }),
    );

    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      identity: null,
      role: "contributor",
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBe("planning");
  });

  it("emits sessionType=planning when resolution=single + State: Planning", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Planning",
        branch: "technical/plan-foo",
        taskList: "[none]",
        nextAction: "Run `create-spec.md`",
      }),
    );
    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });

  it("falls back to branch pattern when State is empty + branch matches plan-pattern", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({ state: "", branch: "plan/foo" }),
    );
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("single");
    expect(result.sessionType).toBe("planning");
  });
});

describe("runActiveSessionInitStatus — planning sub-stage resolution", () => {
  let fixture: Fixture;
  beforeEach(async () => {
    fixture = await createFixture();
  });
  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("surfaces the sub-stage directly from the `Current Workflow` field", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Planning",
        branch: "plan/foo",
        currentWorkflow: "create-spec",
        taskList: "[none]",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.sessionType).toBe("planning");
    expect(result.currentWorkflow).toBe("create-spec");
    expect(result.planningStage).toBe("create-spec");
  });

  it("defaults to draft-design when the meta carries no `Current Workflow` field", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({ state: "Planning", branch: "plan/foo", taskList: "[none]" }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.currentWorkflow).toBeNull();
    expect(result.planningStage).toBe("draft-design");
  });

  it("defaults to draft-design regardless of on-disk artifacts — no artifact scan", async () => {
    // A spec on disk must NOT shift the resolution: the field is the only signal,
    // and artifact presence is a deliberately-retired heuristic. Guards against a
    // scan creeping back in.
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({ state: "Planning", branch: "plan/foo", taskList: "[none]" }),
    );
    await writeFile(join(fixture.activeDir, "draft-foo.md"), "# draft\n");
    await writeFile(join(fixture.activeDir, "spec-foo.md"), "# spec\n");

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.planningStage).toBe("draft-design");
  });

  it("treats a `[none]` field value as field-absent and defaults to draft-design", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Planning",
        branch: "plan/foo",
        currentWorkflow: "[none]",
        taskList: "[none]",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.planningStage).toBe("draft-design");
  });

  it("emits planningStage=null for a non-planning (execution) session", async () => {
    await writeFile(
      join(fixture.activeDir, "meta-foo.md"),
      statusBody({
        state: "Active",
        branch: "feature/foo",
        taskList: "`.arc/active/tasks-foo.md`",
        nextAction: "Start Task 4.2 — write unit tests",
      }),
    );

    const result = await runActiveSessionInitStatus({ cwd: fixture.root, exec: defaultExec });
    expect(result.sessionType).toBe("execution");
    expect(result.planningStage).toBeNull();
  });

  it("emits planningStage=null when resolution is none (orphan planning branch, no meta to scan)", async () => {
    const result = await runActiveSessionInitStatus({
      cwd: fixture.root,
      exec: stubGitExec("plan/foo"),
    });
    expect(result.resolution).toBe("none");
    expect(result.sessionType).toBe("planning");
    expect(result.planningStage).toBeNull();
  });
});
