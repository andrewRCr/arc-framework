/**
 * Unit tests for the lifecycle verb handlers — the dispatch + refusal glue around
 * each `run*` transition. The dispatch core, the verbs, and the preamble seams
 * (identity, config, executor build, worktree resolution) are mocked at the module
 * seam; these assert each command dispatches its transition with the assembled
 * inputs and refuses (without dispatching) when a required input is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  projectCandidateReviewBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const mockLogError = vi.fn();
const mockLogInfo = vi.fn();
const mockNote = vi.fn();
const mockSelect = vi.fn();
const mockIoExec = vi.fn();
const mockIoExecInput = vi.fn();
const mockCreateUserIOContext = vi.fn();
const mockSpinnerStart = vi.fn();
const mockSpinnerStop = vi.fn();
const mockResolveUserIdentity = vi.fn<(exec?: unknown) => Promise<string>>(async () => "andrew");
const mockRequireArcProjectRoot = vi.fn<(startDir?: string) => string | null>(() => "/repo");
const mockResolveArcRoot = vi.fn<(startDir?: string) => string | null>(() => "/repo");
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: (...a: unknown[]) => mockNote(...a),
  select: (...a: unknown[]) => mockSelect(...a),
  isCancel: () => false,
  log: { error: (...a: unknown[]) => mockLogError(...a), info: (...a: unknown[]) => mockLogInfo(...a) },
  spinner: () => ({ start: (...a: unknown[]) => mockSpinnerStart(...a), stop: (...a: unknown[]) => mockSpinnerStop(...a) }),
}));

vi.mock("../../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (exec?: unknown) => mockResolveUserIdentity(exec),
  requireArcProjectRoot: (startDir?: string) => mockRequireArcProjectRoot(startDir),
  isHandledError: () => false,
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  createRawGitExec: () => vi.fn(),
  createUserIOContext: (...args: unknown[]) => {
    mockCreateUserIOContext(...args);
    return {
      exec: mockIoExec,
      execInput: mockIoExecInput,
      readFile: vi.fn(async () => "meta"),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    };
  },
  prepareGitRefVerification: vi.fn(),
  readGitBlobBytes: vi.fn(),
  readGitObjectBytes: vi.fn(),
}));

const mockReadConfigSettings = vi.fn();
vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mockReadConfigSettings(...args),
}));

function configResult(protection: "full" | "partial" = "partial") {
  return {
    settings: {
      "team.mode": "false",
      "branch.base": "main",
      "branch.protection": protection,
      "worktree.location_template": "../{repo}-{branch}",
      "worktree.post_create": "",
      "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
    },
    warnings: [],
  };
}

vi.mock("../../../src/lib/work-unit/executor-context.js", () => ({ buildExecutorContext: () => ({}) }));
vi.mock("../../../src/lib/paths.js", () => ({
  getArcTemplatePath: () => "/arc",
  getInternalTemplatePath: () => "/tpl",
  resolveArcRoot: (startDir?: string) => mockResolveArcRoot(startDir),
}));

vi.mock("../../../src/lib/git/worktree-roster.js", () => ({
  resolvePrimaryWorktreePath: async () => "/repos/myrepo",
  resolveWorktreePathsByBranch: async () => new Map<string, string>(),
  runWorktreeRoster: async () => ({ entries: [], warnings: [] }),
}));

vi.mock("../../../src/lib/git/write-context.js", () => ({
  resolveWriteContext: async () => ({
    verdict: "proceed",
    currentBranch: "main",
    baseBranch: "main",
    primaryWorktreePath: "/repo",
  }),
}));

const mockParseMetaRecord = vi.fn(() => ({ branch: "feat/foo", state: "Active", taskList: "tasks-foo.md" }));
const mockReadActiveMetaCandidates = vi.fn<(cwd: string) => Promise<{ candidates: { filename: string }[] }>>(
  async () => ({
    candidates: [{ filename: "meta-foo.md" }],
  }),
);
vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  parseMetaRecord: () => mockParseMetaRecord(),
  readActiveMetaCandidates: (cwd: string) => mockReadActiveMetaCandidates(cwd),
}));

const mockBuildLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: (...a: unknown[]) => mockBuildLifecycleIndex(...a),
}));

const mockResolveComposedLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/composed-lifecycle-index.js", () => ({
  resolveComposedLifecycleIndex: (...args: unknown[]) => mockResolveComposedLifecycleIndex(...args),
}));

const mockRunStub = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/stub.js", () => ({ runStub: (...a: unknown[]) => mockRunStub(...a) }));

// Lifecycle handlers read templates and other files through `node:fs/promises`.
const mockReadFile = vi.fn(async () => "{}");
vi.mock("node:fs/promises", () => ({
  readFile: () => mockReadFile(),
  lstat: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  open: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  cp: vi.fn(),
  stat: vi.fn(async () => ({ isDirectory: () => false })),
  readdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  rmdir: vi.fn(),
}));

const mockRevalidateV3DecomposeExecutionPreflight = vi.fn();
vi.mock("../../../src/lib/work-unit/decompose-v3-execution-preflight.js", () => ({
  revalidateV3DecomposeExecutionPreflight: (...a: unknown[]) => mockRevalidateV3DecomposeExecutionPreflight(...a),
}));
const mockResolveProjectReadinessComposition = vi.fn();
vi.mock("../../../src/lib/status/project-view.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/status/project-view.js")>(),
  resolveProjectReadinessComposition: (...a: unknown[]) => mockResolveProjectReadinessComposition(...a),
}));

const mockCreateGitV3DecomposePreflight = vi.fn();
vi.mock("../../../src/lib/work-unit/git-decompose-v3-preflight.js", () => ({
  createGitV3DecomposePreflight: (...args: unknown[]) => mockCreateGitV3DecomposePreflight(...args),
}));
const mockExecuteGitV3DecomposeCommand = vi.fn();
const mockExecuteGitV3ExtractionCommand = vi.fn();
vi.mock("../../../src/lib/work-unit/git-decompose-v3-operation.js", () => ({
  executeGitV3DecomposeCommand: (...args: unknown[]) =>
    mockExecuteGitV3DecomposeCommand(...args),
  executeGitV3ExtractionCommand: (...args: unknown[]) =>
    mockExecuteGitV3ExtractionCommand(...args),
}));
const mockFinishGitV3Extraction = vi.fn();
vi.mock("../../../src/lib/work-unit/git-decompose-v3-finish.js", () => ({
  finishGitV3Extraction: (...args: unknown[]) => mockFinishGitV3Extraction(...args),
}));
const mockAdvanceGitDecomposeTransitionBase = vi.fn();
vi.mock("../../../src/lib/work-unit/git-decompose-transition-base-advancement.js", () => ({
  advanceGitDecomposeTransitionBase: (...args: unknown[]) =>
    mockAdvanceGitDecomposeTransitionBase(...args),
}));
vi.mock("../../../src/lib/work-unit/decompose-v3-schema.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/work-unit/decompose-v3-schema.js")>(),
  decodeV3DecomposeCutMap: () => ({
    status: "accepted",
    value: { machine: { source: { origin: "mono" } } },
  }),
}));

const mockRunPromote = vi.fn();
const mockRunDemote = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/promote-demote.js", () => ({
  runPromote: (...a: unknown[]) => mockRunPromote(...a),
  runDemote: (...a: unknown[]) => mockRunDemote(...a),
}));

const mockRunPark = vi.fn();
const mockRunResume = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/park-resume.js", () => ({
  runPark: (...a: unknown[]) => mockRunPark(...a),
  runResume: (...a: unknown[]) => mockRunResume(...a),
}));

const mockLandParkPlanningTransition = vi.fn();
vi.mock("../../../src/lib/work-unit/park-planning-landing.js", () => ({
  createInRepoParkPlanningLandingContext: () => ({ kind: "landing-context" }),
  landParkPlanningTransition: (...a: unknown[]) => mockLandParkPlanningTransition(...a),
}));

const mockRunMaterialize = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/materialize.js", () => ({
  runMaterialize: (...a: unknown[]) => mockRunMaterialize(...a),
}));

const mockResolveInFlightBranchSet = vi.fn();
vi.mock("../../../src/lib/git/remote-ref-reader.js", () => ({
  resolveInFlightBranchSet: (...a: unknown[]) => mockResolveInFlightBranchSet(...a),
  DEFAULT_NETWORK_TIMEOUT_MS: 5000,
}));

const mockDeriveInFlight = vi.fn();
vi.mock("../../../src/lib/git/in-flight-derivation.js", () => ({
  deriveInFlight: (...a: unknown[]) => mockDeriveInFlight(...a),
}));

const mockExpandActiveInFlight = vi.fn();
const mockRunActiveInFlightExpansion = vi.fn();
const mockResolveTaskListPath = vi.fn();
vi.mock("../../../src/commands/active.js", () => ({
  expandActiveInFlight: (...args: unknown[]) => mockExpandActiveInFlight(...args),
  runActiveInFlightExpansion: (...args: unknown[]) => mockRunActiveInFlightExpansion(...args),
  resolveTaskListPath: (...args: unknown[]) => mockResolveTaskListPath(...args),
}));

const mockFindMaterializableWorkUnits = vi.fn();
vi.mock("../../../src/lib/session-init/materializable-work-units.js", () => ({
  findMaterializableWorkUnits: (...a: unknown[]) => mockFindMaterializableWorkUnits(...a),
}));

const mockRunActivate = vi.fn();
const mockRunDeactivate = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/activate-deactivate.js", () => ({
  runActivate: (...a: unknown[]) => mockRunActivate(...a),
  runDeactivate: (...a: unknown[]) => mockRunDeactivate(...a),
}));

const mockRunAbandon = vi.fn();
const mockPlanAbandon = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/abandon.js", () => ({
  runAbandon: (...a: unknown[]) => mockRunAbandon(...a),
  planAbandon: (...a: unknown[]) => mockPlanAbandon(...a),
}));

const mockRunPublish = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/publish.js", () => ({
  runPublish: (...a: unknown[]) => mockRunPublish(...a),
}));

const mockReadCandidateRecord = vi.fn();
vi.mock("../../../src/lib/work-unit/candidate-record-store.js", () => ({
  readCandidateRecord: (...a: unknown[]) => mockReadCandidateRecord(...a),
  writeCandidateRecord: vi.fn(),
}));
const mockCollectGitCandidateTarget = vi.fn();
const mockCollectUnstagedReviewablePaths = vi.fn();
vi.mock("../../../src/lib/work-unit/git-candidate-subject.js", () => ({
  collectGitCandidateTarget: (...a: unknown[]) => mockCollectGitCandidateTarget(...a),
  collectUnstagedReviewablePaths: (...a: unknown[]) => mockCollectUnstagedReviewablePaths(...a),
}));
const mockRunAttest = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/attest.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/lib/work-unit/verbs/attest.js")>()),
  runAttest: (...a: unknown[]) => mockRunAttest(...a),
}));
const mockProjectGitCandidateEffectiveTarget = vi.fn();
vi.mock("../../../src/lib/work-unit/git-candidate-effective-target.js", () => ({
  projectGitCandidateEffectiveTarget: (...a: unknown[]) => mockProjectGitCandidateEffectiveTarget(...a),
}));
const mockReadSubmissionBoundaryVersioned = vi.fn();
const mockWriteSubmissionBoundary = vi.fn();
vi.mock("../../../src/lib/work-unit/submission-boundary-store.js", () => ({
  readSubmissionBoundaryVersioned: (...a: unknown[]) => mockReadSubmissionBoundaryVersioned(...a),
  writeSubmissionBoundary: (...a: unknown[]) => mockWriteSubmissionBoundary(...a),
}));

const mockRunReopen = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/reopen.js", () => ({
  runReopen: (...a: unknown[]) => mockRunReopen(...a),
}));
const mockInspectRepositoryDeliveryReopen = vi.fn();
vi.mock("../../../src/lib/delivery/repository-entry.js", () => ({
  inspectRepositoryDeliveryReopen: (...args: unknown[]) => mockInspectRepositoryDeliveryReopen(...args),
}));

// The slug→state resolver feeds the handler's impact-plan composition; keep the
// rest of the resolver real (the dispatch core's `deriveState` rides on it).
const mockResolveSlugState = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-resolver.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/lib/work-unit/lifecycle-resolver.js")>()),
  resolveSlugState: (...a: unknown[]) => mockResolveSlugState(...a),
}));

const {
  handleStub,
  handleDecompose,
  handlePromote,
  handleDemote,
  handlePark,
  handleResume,
  handleMaterialize,
  handleActivate,
  handleDeactivate,
  handlePublish,
  handleAbandon,
  handleReopen,
  handleAttest,
  LifecycleCommandRefusalSchema,
} = await import("../../../src/handlers/lifecycle.js");

const okOutcome = { status: "ok", advisories: [] as string[] };
const pendingRetirementLifecycle = {
  subject: { slug: "foo", branch: "feat/foo" },
  transition: "abandon",
  cleanup: {
    branch: { status: "pending" },
    worktree: { status: "pending" },
    userWorkspace: { status: "pending" },
  },
  successorReadiness: { candidates: [], actionable: false, remedy: null },
} as const;
const branchlessRetirementLifecycle = {
  ...pendingRetirementLifecycle,
  subject: { slug: "foo", branch: null },
  cleanup: {
    branch: { status: "not-applicable" },
    worktree: { status: "not-applicable" },
    userWorkspace: { status: "not-applicable" },
  },
} as const;
const cleanReconcile = {
  status: "clean",
  prepared: {
    slug: "foo",
    plan: {
      status: "ready",
      dependency: {
        before: [],
        after: [],
        replacements: [],
        drops: [],
        discharged: [],
        live: [],
        conflicts: [],
      },
      trackedReferences: { edits: [] },
      advisories: [],
    },
    edits: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  mockResolveUserIdentity.mockResolvedValue("andrew");
  mockRequireArcProjectRoot.mockReturnValue("/repo");
  mockResolveArcRoot.mockReturnValue("/repo");
  mockReadActiveMetaCandidates.mockResolvedValue({ candidates: [{ filename: "meta-foo.md" }] });
  mockReadFile.mockResolvedValue("{}");
  mockResolveTaskListPath.mockReturnValue(".arc/active/tasks-foo.md");
  mockReadConfigSettings.mockResolvedValue(configResult());
  mockParseMetaRecord.mockReturnValue({ branch: "feat/foo", state: "Active", taskList: "tasks-foo.md" });
  mockInspectRepositoryDeliveryReopen.mockReset();
  mockInspectRepositoryDeliveryReopen.mockResolvedValue({
    status: "reopen-permitted",
    composition: "absent",
    nextAction: "continue-reopen",
    recommendedActionText: "Continue ordinary singleton withdrawal.",
  });
  mockCollectUnstagedReviewablePaths.mockResolvedValue([]);
  mockRunAttest.mockResolvedValue({
    status: "unchanged",
    locus: projectCandidateReviewBoundary({ workUnit: "foo", candidateId: `sha256:${"c".repeat(64)}` }),
  });
  mockRunStub.mockResolvedValue({ status: "scaffolded", outcome: okOutcome, metaPath: ".arc/backlog/provisional/foo/meta-foo.md" });
  mockBuildLifecycleIndex.mockResolvedValue(new Map([
    ["foo", { name: "foo", location: "provisional", path: ".arc/backlog/provisional/foo/meta-foo.md" }],
  ]));
  mockRunPromote.mockResolvedValue({ status: "moved", outcome: okOutcome, metaPath: ".arc/backlog/planned/foo/meta-foo.md" });
  mockRunDemote.mockResolvedValue({ status: "moved", outcome: okOutcome, metaPath: ".arc/backlog/provisional/foo/meta-foo.md" });
  mockRunPark.mockResolvedValue({
    status: "parked",
    outcome: { ...okOutcome, from: { phase: "Active", location: "active" } },
    metaPath: ".arc/backlog/planned/foo/meta-foo.md",
  });
  mockLandParkPlanningTransition.mockResolvedValue({
    status: "landed",
    commit: "abc123",
    plannedPaths: [".arc/backlog/planned/foo/meta-foo.md"],
  });
  mockRunResume.mockResolvedValue({ status: "resumed", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunMaterialize.mockResolvedValue({
    status: "materialized",
    branch: "feat/foo",
    inPlace: false,
    worktreePath: "/repos/myrepo-feat-foo",
    advisories: [],
  });
  mockRunActivate.mockResolvedValue({ status: "activated", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunDeactivate.mockResolvedValue({ status: "deactivated", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunAbandon.mockResolvedValue({
    status: "abandoned",
    outcome: okOutcome,
    lifecycle: pendingRetirementLifecycle,
  });
  mockResolveComposedLifecycleIndex.mockResolvedValue({
    index: new Map(),
    recordsBySlug: new Map(),
    qualityFacts: { warnings: [], resultMarks: [], bySlug: new Map() },
    worktreePathBySlug: new Map(),
    liveRefs: {},
    reachable: true,
    readQuality: "reachable",
  });
  mockResolveSlugState.mockReturnValue("active");
  mockPlanAbandon.mockReturnValue({ legal: true, lines: ["Artifacts: remove the work unit's artifact set"] });
  const candidateId = `sha256:${"a".repeat(64)}`;
  const boundary = {
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: "foo",
    candidateId,
    locus: "candidate-publish-ready",
    nextAction: {
      kind: "publish-candidate",
      command: "arc publish foo --json",
      interactionText: "Publish the current Candidate.",
    },
    policy: null,
    reservation: null,
  };
  mockReadCandidateRecord.mockResolvedValue({ attestation: { candidateId } });
  mockCollectGitCandidateTarget.mockResolvedValue({ revision: "a".repeat(40), subject: {} });
  mockProjectGitCandidateEffectiveTarget.mockResolvedValue({
    state: "current",
    candidateId,
    recognizedTarget: {
      revision: "a".repeat(40),
      subject: { subjectDigest: `sha256:${"b".repeat(64)}` },
    },
    convergenceVerification: "satisfied",
  });
  mockReadSubmissionBoundaryVersioned.mockResolvedValue({ boundary, version: "boundary-version" });
  mockWriteSubmissionBoundary.mockResolvedValue(".arc/system/.internal/candidates/foo.boundary.json");
  mockRunPublish.mockResolvedValue({
    status: "published",
    outcome: okOutcome,
    metaPath: ".arc/active/meta-foo.md",
    reconcile: cleanReconcile,
    boundary: { ...boundary, mode: "integration-boundary", locus: "publication-pending" },
  });
  mockRunReopen.mockResolvedValue({ status: "reopened", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockReadFile.mockResolvedValue('{"schemaVersion":1}');
  mockRevalidateV3DecomposeExecutionPreflight.mockResolvedValue({
    status: "current",
    completedMap: {},
    preflight: {},
  });
  mockResolveProjectReadinessComposition.mockResolvedValue({
    acceptedCandidates: [],
    rejectedRecords: [],
    records: [],
    treeRecords: [],
    derivationWarnings: [],
    sourceWarnings: [],
    indeterminate: false,
    view: { title: "Project", records: [], derivationWarnings: [], sourceWarnings: [], indeterminate: false },
  });
  mockCreateGitV3DecomposePreflight.mockResolvedValue({
    status: "ready",
    preflight: { starterMap: { schemaVersion: 3, origin: "mono" } },
  });
  mockExecuteGitV3DecomposeCommand.mockResolvedValue({
    status: "staged",
    operation: { report: { destinations: ["member"] } },
  });
  mockExecuteGitV3ExtractionCommand.mockResolvedValue({
    status: "staged",
    operation: { report: { extraction: { anchor: { origin: "mono" } } } },
  });
  mockFinishGitV3Extraction.mockResolvedValue({ status: "previewed" });
  mockAdvanceGitDecomposeTransitionBase.mockResolvedValue({
    status: "advanced",
    candidateBranch: "chore/decompose-mono",
    previousBaseHead: "b".repeat(40),
    currentBaseHead: "c".repeat(40),
    candidateHead: "d".repeat(40),
  });
  mockIoExec.mockResolvedValue({ stdout: "", stderr: "" });
  mockResolveInFlightBranchSet.mockResolvedValue({
    branches: ["feat/foo"],
    refs: { "origin/feat/foo": "abc123" },
    liveRefs: { "origin/feat/foo": "abc123" },
    reachable: true,
  });
  const completeExpansion = {
    entries: [{ kind: "work-unit", name: "foo", branch: "feat/foo", remoteOnly: true }],
    residue: [],
    warnings: [],
    snapshot: { refs: { "origin/feat/foo": "abc123" }, worktrees: {} },
    liveRefs: { "origin/feat/foo": "abc123" },
    reachable: true,
    pendingBranchCount: 0,
    remoteEvidence: "exact",
    candidateExpansion: { status: "complete", pendingBranchCount: 0 },
  };
  mockExpandActiveInFlight.mockResolvedValue(completeExpansion);
  mockRunActiveInFlightExpansion.mockResolvedValue(completeExpansion);
  mockFindMaterializableWorkUnits.mockReturnValue({ candidates: [{ name: "foo", branch: "feat/foo" }] });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("handleStub", () => {
  it("dispatches runStub with the assembled inputs", async () => {
    await handleStub("foo", { commitment: "provisional", priority: "P1", origin: "#42" });
    expect(mockRunStub).toHaveBeenCalledTimes(1);
    expect(mockRunStub.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      commitment: "provisional",
      priority: "P1",
      owner: "andrew",
      origin: "#42",
    });
  });

  it("dispatches a nested cohort path", async () => {
    await handleStub("foo", {
      commitment: "planned",
      priority: "P1",
      cohort: "parent/child",
    });

    expect(mockRunStub).toHaveBeenCalledTimes(1);
    expect(mockRunStub.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      cohort: "parent/child",
    });
  });

  it.each(["parent/child/grandchild", "parent//child"])(
    "rejects an invalid cohort path %s before dispatch",
    async (cohort) => {
      await handleStub("foo", { commitment: "planned", priority: "P1", cohort });

      expect(mockRunStub).not.toHaveBeenCalled();
      expect(mockLogError).toHaveBeenCalled();
    },
  );

  it("rejects an invalid commitment before dispatch", async () => {
    await handleStub("foo", { commitment: "bogus", priority: "P1" });
    expect(mockRunStub).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });

  it("refuses without a name and never dispatches", async () => {
    await handleStub(undefined, { commitment: "provisional", priority: "P1" });
    expect(mockRunStub).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("refuses an absent name before eliciting handler-level inputs", async () => {
    await handleStub(undefined, {});

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRunStub).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleDecompose", () => {
  it("exposes only the complete read-only v3 preflight", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleDecompose("mono", { preflight: true });

    expect(stdoutWrite).toHaveBeenCalledWith('{"origin":"mono","schemaVersion":3}\n');
    expect(mockExecuteGitV3DecomposeCommand).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("routes execute only through the repository operation adapter", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleDecompose("mono", { execute: "cut-map.json" });

    expect(mockExecuteGitV3DecomposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", spawningIdentity: "andrew" }),
      {
        protection: "partial",
        baseBranch: "main",
        origin: "mono",
        cutMapPath: "cut-map.json",
      },
    );
    expect(stdoutWrite).toHaveBeenCalledWith(
      `{"operation":{"report":{"destinations":["member"]}},"status":"staged"}\n`,
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("maps full branch protection into full candidate execution", async () => {
    mockReadConfigSettings.mockResolvedValue(configResult("full"));

    await handleDecompose("mono", { execute: "cut-map.json" });

    expect(mockExecuteGitV3DecomposeCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", spawningIdentity: "andrew" }),
      {
        protection: "full",
        baseBranch: "main",
        origin: "mono",
        cutMapPath: "cut-map.json",
      },
    );
  });

  it("routes extract only through the additive repository operation adapter", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleDecompose("mono", { extract: "cut-map.json" });

    expect(mockExecuteGitV3ExtractionCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", spawningIdentity: "andrew" }),
      {
        protection: "partial",
        baseBranch: "main",
        origin: "mono",
        cutMapPath: "cut-map.json",
      },
    );
    expect(mockExecuteGitV3DecomposeCommand).not.toHaveBeenCalled();
    expect(stdoutWrite).toHaveBeenCalledWith(
      '{"operation":{"report":{"extraction":{"anchor":{"origin":"mono"}}}},"status":"staged"}\n',
    );
  });

  it.each([
    ["finished", true],
    ["already-finished", true],
  ] as const)("routes finish and emits the typed %s outcome", async (status, apply) => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockFinishGitV3Extraction.mockResolvedValue({ status });

    const authority = `sha256:${"a".repeat(64)}`;
    await handleDecompose("mono", { finish: "cut-map.json", ...(apply ? { apply: authority } : {}) });

    expect(mockFinishGitV3Extraction).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo" }),
      {
        cwd: "/repo",
        baseBranch: "main",
        origin: "mono",
        cutMapPath: "cut-map.json",
        applyAuthority: apply ? authority : null,
      },
    );
    expect(stdoutWrite).toHaveBeenCalledWith(`{"status":"${status}"}\n`);
    expect(process.exitCode).toBeUndefined();
  });

  it("emits the exact typed finish preview", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const preview = {
      applyAuthority: `sha256:${"c".repeat(64)}`,
      liveBase: {
        ref: "refs/heads/main",
        head: "a".repeat(40),
        destinations: [{
          path: ".arc/backlog/planned/member/meta-member.md",
          mode: "100644" as const,
          contentDigest: `sha256:${"b".repeat(64)}`,
        }],
      },
      sources: [{
        path: ".arc/active/spec-mono.md",
        before: {
          mode: "100644" as const,
          contentDigest: `sha256:${"d".repeat(64)}`,
        },
        after: {
          kind: "file" as const,
          mode: "100644" as const,
          contentBase64: Buffer.from("retained\n", "utf8").toString("base64"),
        },
        removedLocators: [{ artifact: "spec-mono.md", kind: "preamble" as const }],
      }],
    };
    mockFinishGitV3Extraction.mockResolvedValue({ status: "previewed", preview });

    await handleDecompose("mono", { finish: "cut-map.json" });

    expect(mockFinishGitV3Extraction).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo" }),
      {
        cwd: "/repo",
        baseBranch: "main",
        origin: "mono",
        cutMapPath: "cut-map.json",
        applyAuthority: null,
      },
    );
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toEqual({
      preview,
      status: "previewed",
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("surfaces a typed finish refusal", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    mockFinishGitV3Extraction.mockResolvedValue({
      status: "refused",
      reason: "destination-missing",
      locus: "member",
    });

    await handleDecompose("mono", { finish: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(
      '{"locus":"member","reason":"destination-missing","status":"refused"}\n',
    );
    expect(stderrWrite).toHaveBeenCalledWith("destination-missing: member\n");
    expect(process.exitCode).toBe(1);
  });

  it("surfaces the execute adapter's precomposed recovery without rebuilding it", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const remedy = "ADAPTER-ONLY: retry or clean the owned candidate";
    mockExecuteGitV3DecomposeCommand.mockResolvedValue({
      status: "refused",
      stage: "occupation",
      reason: "candidate-conflict",
      recovery: { kind: "none" },
      remedy,
    });

    await handleDecompose("mono", { execute: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(
      `{"reason":"candidate-conflict","recovery":{"kind":"none"},`
      + `"remedy":"${remedy}","stage":"occupation","status":"refused"}\n`,
    );
    expect(stderrWrite).toHaveBeenCalledWith(`candidate-conflict\n${remedy}\n`);
    expect(process.exitCode).toBe(1);
  });

  it("routes advance-base through the full-protection repository driver", async () => {
    mockReadConfigSettings.mockResolvedValue(configResult("full"));
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(
      `{"candidateBranch":"chore/decompose-mono","candidateHead":"${"d".repeat(40)}",`
      + `"currentBaseHead":"${"c".repeat(40)}","previousBaseHead":"${"b".repeat(40)}",`
      + `"status":"advanced"}\n`,
    );
  });

  it("surfaces advance-base refusals without prescribing a successor", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    mockAdvanceGitDecomposeTransitionBase.mockResolvedValue({
      status: "refused",
      reason: "full-protection-required",
    });

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(
      '{"reason":"full-protection-required","status":"refused"}\n',
    );
    expect(stderrWrite).toHaveBeenCalledWith("full-protection-required\n");
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["conflicting modes", { preflight: true, execute: "cut-map.json" }],
    ["advance-base with another mode", { preflight: true, advanceBase: "cut-map.json" }],
    ["apply without finish", { apply: `sha256:${"a".repeat(64)}` }],
  ])("refuses %s before any production adapter", async (_case, options) => {
    await handleDecompose(
      "mono",
      options as unknown as Parameters<typeof handleDecompose>[1],
    );

    expect(mockCreateGitV3DecomposePreflight).not.toHaveBeenCalled();
    expect(mockExecuteGitV3DecomposeCommand).not.toHaveBeenCalled();
    expect(mockExecuteGitV3ExtractionCommand).not.toHaveBeenCalled();
    expect(mockFinishGitV3Extraction).not.toHaveBeenCalled();
    expect(mockAdvanceGitDecomposeTransitionBase).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("refuses an invocation without preflight authority", async () => {
    await handleDecompose("mono", {});

    expect(mockCreateGitV3DecomposePreflight).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("refuses without an origin argument", async () => {
    await handleDecompose(undefined, { preflight: true });

    expect(mockCreateGitV3DecomposePreflight).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handlePromote / handleDemote", () => {
  it("promote dispatches runPromote for the slug", async () => {
    await handlePromote("foo", { class: "Novel" });
    expect(mockRunPromote).toHaveBeenCalledTimes(1);
    expect(mockRunPromote.mock.calls[0]?.[1]).toEqual({ name: "foo", class: "Novel" });
  });

  it("demote dispatches runDemote for the slug", async () => {
    await handleDemote("foo");
    expect(mockRunDemote).toHaveBeenCalledTimes(1);
    expect(mockRunDemote.mock.calls[0]?.[1]).toEqual({ name: "foo" });
  });

  it("a bare slug-required verb surfaces the candidate list and never dispatches", async () => {
    await handlePromote(undefined);
    expect(mockRunPromote).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handlePark", () => {
  it("dispatches runPark with the reason, resolved worktree path, and current locus", async () => {
    await handlePark("foo", { reason: "shelving for a higher-priority pivot" });
    expect(mockRunPark).toHaveBeenCalledTimes(1);
    expect(mockRunPark.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      reason: "shelving for a higher-priority pivot",
      worktreePath: "/repo",
      currentLocus: "/repo",
    });
  });

  it("routes --land through the partial-protection landing arm without re-running park", async () => {
    await handlePark("foo", { land: "abc123" });

    expect(mockLandParkPlanningTransition).toHaveBeenCalledTimes(1);
    expect(mockRunPark).not.toHaveBeenCalled();
    expect(mockNote).toHaveBeenCalledWith(expect.stringContaining("abc123"), "Park result landed");
  });
});

describe("handleResume", () => {
  it("dispatches runResume with the spawn config", async () => {
    await handleResume("foo");
    expect(mockExpandActiveInFlight).toHaveBeenCalledWith(expect.objectContaining({
      exec: mockIoExec,
      execInput: mockIoExecInput,
      identity: "andrew",
      teamMode: false,
      baseBranch: "main",
    }));
    expect(mockResolveComposedLifecycleIndex).toHaveBeenCalledWith(expect.objectContaining({
      oracle: expect.objectContaining({
        acquisitionPolicy: "materialized-live",
        suppliedResult: expect.objectContaining({ remoteEvidence: "exact" }),
      }),
    }));
    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect(mockRunResume.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      locationTemplate: "../{repo}-{branch}",
      repo: "myrepo",
      spawningIdentity: "andrew",
    });
  });

  it("dispatches an in-place runResume under `--here` (no spawn config)", async () => {
    await handleResume("foo", { here: true });
    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect(mockRunResume.mock.calls[0]?.[1]).toEqual({ name: "foo", inPlace: true });
  });
});

describe("handleMaterialize", () => {
  it("fetches the selected remote ref and dispatches runMaterialize with the spawn config", async () => {
    await handleMaterialize("foo");

    expect(mockRunActiveInFlightExpansion).toHaveBeenCalledWith(expect.objectContaining({
      exec: mockIoExec,
      execInput: mockIoExecInput,
      localOnly: false,
    }));
    expect(mockIoExec).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "+refs/heads/feat/foo:refs/remotes/origin/feat/foo"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRunMaterialize).toHaveBeenCalledTimes(1);
    expect(mockRunMaterialize.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      branch: "feat/foo",
      locationTemplate: "../{repo}-{branch}",
      repo: "myrepo",
      spawningIdentity: "andrew",
    });
    expect(mockSpinnerStart).toHaveBeenCalledWith("Fetching origin/feat/foo...");
    expect(mockSpinnerStop).toHaveBeenCalledWith("Fetch complete.");
    expect(mockSpinnerStart).toHaveBeenCalledWith("Spawning materialize worktree...");
    expect(mockSpinnerStop).toHaveBeenCalledWith("Worktree ready.");
    expect(mockNote).toHaveBeenCalledWith(
      expect.stringContaining("Worktree:  /repos/myrepo-feat-foo"),
      "Materialized",
    );
  });

  it("dispatches an in-place materialize under `--here` after fetching the remote ref", async () => {
    mockRunMaterialize.mockResolvedValueOnce({
      status: "materialized",
      branch: "feat/foo",
      inPlace: true,
      worktreePath: "/repo",
      advisories: [],
    });

    await handleMaterialize("foo", { here: true });

    expect(mockIoExec).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin", "+refs/heads/feat/foo:refs/remotes/origin/feat/foo"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mockRunMaterialize).toHaveBeenCalledTimes(1);
    expect(mockRunMaterialize.mock.calls[0]?.[1]).toEqual({
      name: "foo",
      branch: "feat/foo",
      inPlace: true,
    });
    expect(mockSpinnerStart).toHaveBeenCalledWith("Materializing in place...");
    expect(mockSpinnerStop).toHaveBeenCalledWith("Materialize complete.");
    expect(mockNote).toHaveBeenCalledWith(
      expect.stringContaining("Worktree:  /repo"),
      "Materialized (in place)",
    );
  });

  it("stops the spinner and reports a materialize rejection", async () => {
    mockRunMaterialize.mockResolvedValueOnce({
      status: "rejected",
      reason: "occupancy probe failed",
    });

    await handleMaterialize("foo", { here: true });

    expect(mockSpinnerStop).toHaveBeenCalledWith("Materialize failed.");
    expect(mockLogError).toHaveBeenCalledWith("occupancy probe failed");
    expect(process.exitCode).toBe(1);
  });

  it("propagates forbidden subprocess interaction to the network boundary", async () => {
    const subprocess = {
      terminalPrompts: "forbidden" as const,
      presenters: "forbidden" as const,
      ambientStdin: "closed" as const,
    };

    await handleMaterialize("foo", {}, {
      interaction: "forbidden",
      terminal: "non-interactive",
      confirmation: "ask",
      machineReadable: false,
      promptInput: process.stdin,
      promptOutput: process.stdout,
      subprocess,
    });

    expect(mockCreateUserIOContext).toHaveBeenCalledWith(subprocess);
  });

  it("refuses when the requested slug is not a remote-only materialize candidate", async () => {
    mockFindMaterializableWorkUnits.mockReturnValue({ candidates: [{ name: "bar", branch: "feat/bar" }] });

    await handleMaterialize("foo");

    expect(mockRunMaterialize).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(mockSpinnerStart).not.toHaveBeenCalled();
  });
});

describe("handleActivate", () => {
  it("dispatches runActivate, composing the working branch from --type and the slug", async () => {
    await handleActivate("foo", { type: "feat", task: "Task 1.1 — start", action: "Begin the loop" });
    expect(mockRunActivate).toHaveBeenCalledTimes(1);
    expect(mockRunActivate.mock.calls[0]?.[1]).toEqual({
      name: "foo",
      toBranch: "feat/foo",
      nextTask: "Task 1.1 — start",
      nextAction: "Begin the loop",
    });
  });

  it("refuses without the branch type / orientation inputs and never dispatches", async () => {
    await handleActivate("foo", { type: "feat" });
    expect(mockRunActivate).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleDeactivate", () => {
  it("dispatches runDeactivate for the slug", async () => {
    await handleDeactivate("foo");
    expect(mockRunDeactivate).toHaveBeenCalledTimes(1);
    expect(mockRunDeactivate.mock.calls[0]?.[1]).toEqual({ name: "foo" });
  });
});

describe("handleAbandon", () => {
  it("prints the impact plan and refuses without --yes, never dispatching the cascade", async () => {
    await handleAbandon("foo", {});
    expect(mockNote).toHaveBeenCalledTimes(1);
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("dispatches runAbandon with the confirmation flag when --yes is given", async () => {
    await handleAbandon("foo", { yes: true });
    expect(mockNote.mock.calls[0]?.[1]).toContain("impact plan");
    expect(mockRunAbandon).toHaveBeenCalledTimes(1);
    expect(mockRunAbandon.mock.calls[0]?.[1]).toMatchObject({ name: "foo", confirmed: true });
  });

  it("does not advertise teardown for a branchless abandon", async () => {
    mockRunAbandon.mockResolvedValue({
      status: "abandoned",
      outcome: okOutcome,
      lifecycle: branchlessRetirementLifecycle,
    });

    await handleAbandon("foo", { yes: true });

    expect(mockNote).toHaveBeenLastCalledWith(expect.not.stringContaining("arc teardown"), "Abandoned");
  });

  it("refuses an illegal source state up front, printing no plan and never dispatching", async () => {
    mockResolveSlugState.mockReturnValue("integrating");
    mockPlanAbandon.mockReturnValue({ legal: false, lines: [] });
    await handleAbandon("foo", { yes: true });
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("a bare invocation (no slug) surfaces the candidate list and never dispatches", async () => {
    await handleAbandon(undefined, {});
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handlePublish", () => {
  it("dispatches runPublish, forwarding the orientation inputs", async () => {
    await handlePublish("foo", { lastCompleted: "Phase 7 — verification", action: "open the PR" });
    expect(mockRunPublish).toHaveBeenCalledTimes(1);
    expect(mockRunPublish.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      lastCompleted: "Phase 7 — verification",
      nextAction: "open the PR",
    });
  });

  it("reports the unchanged durable publication resume point as JSON", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const boundary = (await mockReadSubmissionBoundaryVersioned()).boundary;
    const publicationBoundary = {
      ...boundary,
      mode: "integration-boundary",
      locus: "publication-pending",
      nextAction: {
        kind: "continue-publication",
        command: "git push -u origin feat/foo",
        interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
      },
    };
    mockRunPublish.mockResolvedValueOnce({
      status: "unchanged",
      boundary: publicationBoundary,
    });

    await handlePublish("foo", {
      lastCompleted: "Phase 7 — verification",
      action: "open the PR",
      json: true,
    });

    expect(stdoutWrite).toHaveBeenCalledWith(`${JSON.stringify({
      status: "unchanged",
      boundary: publicationBoundary,
    })}\n`);
  });

  it("forwards explicit advisory-retention authority", async () => {
    await handlePublish("foo", {
      lastCompleted: "Phase 7 — verification",
      action: "open the PR",
      allowAdvisories: true,
    });
    expect(mockRunPublish.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      lastCompleted: "Phase 7 — verification",
      nextAction: "open the PR",
      allowAdvisories: true,
    });
  });

  it("leaves both orientation inputs to the verb when neither flag is given", async () => {
    await handlePublish("foo", {});
    expect(mockRunPublish).toHaveBeenCalledTimes(1);
    const params = mockRunPublish.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params).toMatchObject({ name: "foo" });
    expect(params).not.toHaveProperty("lastCompleted");
    expect(params).not.toHaveProperty("nextAction");
  });

  it("forwards one orientation override without inventing the other", async () => {
    await handlePublish("foo", { action: "open the PR" });
    const params = mockRunPublish.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(params).toMatchObject({ nextAction: "open the PR" });
    expect(params).not.toHaveProperty("lastCompleted");
  });

  it("emits a JSON refusal with command usage under --json", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handlePublish("../foo", { json: true });

    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "rejected",
      remedy: { argv: ["arc", "publish", "--help"] },
    });
    expect(mockRunPublish).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("emits one typed JSON refusal when the ARC root is unavailable", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockResolveArcRoot.mockReturnValueOnce(null);

    await handlePublish("foo", { json: true });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const refusal = LifecycleCommandRefusalSchema.parse(
      JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])),
    );
    expect(refusal.remedy.argv).toEqual(["arc", "status", "--json"]);
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockRunPublish).not.toHaveBeenCalled();
  });

  it("emits one typed JSON refusal when a context-defaulted target is unavailable", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockReadActiveMetaCandidates.mockResolvedValueOnce({ candidates: [] });

    await handlePublish(undefined, { json: true });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const refusal = LifecycleCommandRefusalSchema.parse(
      JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])),
    );
    expect(refusal.remedy.argv).toEqual(["arc", "status", "--json"]);
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockRunPublish).not.toHaveBeenCalled();
  });

  it("defaults a bare invocation to the current worktree's WU", async () => {
    await handlePublish(undefined, { lastCompleted: "Phase 7 — verification", action: "open the PR" });
    expect(mockRunPublish).toHaveBeenCalledTimes(1);
    expect(mockRunPublish.mock.calls[0]?.[1]).toMatchObject({ name: "foo" });
  });

  it("surfaces every pending reconcile advisory and refuses phase entry", async () => {
    mockRunPublish.mockResolvedValueOnce({
      status: "reconcile-pending",
      reason: "Cannot publish `foo`: current-WU reconcile has 2 advisory reference(s) requiring review.",
      remedy: {
        invariant: "Tracked references reconcile before the publication boundary is written.",
        text: "Tracked references reconcile before the publication boundary is written. "
          + "Apply the current work unit's reconcile: `arc wu reconcile foo --apply --json`.",
        argv: ["arc", "wu", "reconcile", "foo", "--apply", "--json"],
      },
      metaPath: ".arc/active/meta-foo.md",
      reconcile: {
        status: "pending",
        prepared: {
          slug: "foo",
          plan: {
            status: "ready",
            dependency: {
              before: [],
              after: [],
              replacements: [],
              drops: [],
              discharged: [],
              live: [],
              conflicts: [],
            },
            trackedReferences: { edits: [] },
            advisories: [
              {
                path: ".arc/active/spec-foo.md",
                line: 12,
                context: "Historical mention of retired-alpha.",
                referenceKind: "narrative",
                subject: "retired-alpha",
                suggestedDisposition: "review-rename",
              },
              {
                path: ".arc/active/notes-foo.md",
                line: 4,
                context: "`notes-retired-beta.md`",
                referenceKind: "dangling-artifact",
                subject: "retired-beta",
                suggestedDisposition: "remove-or-retarget",
              },
            ],
          },
          edits: [],
        },
      },
    });

    await handlePublish("foo", { lastCompleted: "Phase 7 — verification", action: "open the PR" });

    expect(mockLogInfo.mock.calls.map(([message]) => message)).toEqual([
      "Reconcile advisory: .arc/active/spec-foo.md:12 — narrative reference to `retired-alpha`; "
        + "review-rename. Context: Historical mention of retired-alpha.",
      "Reconcile advisory: .arc/active/notes-foo.md:4 — dangling-artifact reference to `retired-beta`; "
        + "remove-or-retarget. Context: `notes-retired-beta.md`",
    ]);
    expect(mockLogError).toHaveBeenCalledWith(
      "Cannot publish `foo`: current-WU reconcile has 2 advisory reference(s) requiring review.\n"
      + "Tracked references reconcile before the publication boundary is written. "
      + "Apply the current work unit's reconcile: `arc wu reconcile foo --apply --json`.",
    );
    expect(process.exitCode).toBe(1);
    expect(mockNote).not.toHaveBeenCalled();
  });

  it("emits one structural JSON document for a pending reconcile", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const pending = {
      status: "reconcile-pending" as const,
      reason: "Reconcile requires direction.",
      remedy: {
        invariant: "Tracked references reconcile before publication.",
        text: "Resolve the advisory.",
        argv: ["arc", "wu", "reconcile", "foo", "--apply", "--json"],
      },
      metaPath: ".arc/active/meta-foo.md",
      reconcile: {
        status: "pending" as const,
        prepared: {
          slug: "foo",
          plan: {
            status: "ready" as const,
            dependency: {
              before: [], after: [], replacements: [], drops: [], discharged: [], live: [], conflicts: [],
            },
            trackedReferences: { edits: [] },
            advisories: [{
              path: ".arc/active/spec-foo.md",
              line: 12,
              context: "Historical reference.",
              referenceKind: "narrative" as const,
              subject: "retired-alpha",
              suggestedDisposition: "review-rename" as const,
            }],
          },
          edits: [],
        },
      },
    };
    mockRunPublish.mockResolvedValueOnce(pending);

    await handlePublish("foo", { lastCompleted: "verification", action: "open the PR", json: true });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toEqual(pending);
    expect(mockLogInfo).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleReopen", () => {
  it("establishes coherent unbound delivery before host observation and lifecycle transition", async () => {
    const events: string[] = [];
    mockInspectRepositoryDeliveryReopen.mockImplementationOnce(async () => {
      events.push("delivery-composition");
      return {
        status: "reopen-permitted",
        composition: "unbound",
        planId: "11111111-1111-4111-8111-111111111111",
        nextAction: "continue-reopen",
        recommendedActionText: "Continue ordinary withdrawal.",
      };
    });
    mockIoExec.mockImplementationOnce(async () => {
      events.push("host-observation");
      return { stdout: '{"state":"OPEN"}\n', stderr: "" };
    });
    mockRunReopen.mockImplementationOnce(async () => {
      events.push("lifecycle-transition");
      return { status: "reopened", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" };
    });

    await handleReopen("foo", {});

    expect(events).toEqual(["delivery-composition", "host-observation", "lifecycle-transition"]);
    expect(mockLogError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("refuses a coherently bound delivery before host or lifecycle mutation", async () => {
    const reason = "Ordinary reopen would strand retained member requests.";
    mockInspectRepositoryDeliveryReopen.mockResolvedValueOnce({
      status: "reopen-bound",
      planId: "11111111-1111-4111-8111-111111111111",
      stateRevision: 7,
      nextAction: "stop",
      recommendedActionText: reason,
    });

    await handleReopen("foo", {});

    expect(mockLogError).toHaveBeenCalledWith(reason);
    expect(process.exitCode).toBe(1);
    expect(mockIoExec).not.toHaveBeenCalled();
    expect(mockRunReopen).not.toHaveBeenCalled();
  });

  it.each(["evidence-unavailable", "state-incoherent"])(
    "fails closed on %s delivery composition before host or lifecycle mutation",
    async (reason) => {
      const recommendedActionText = `Resolve ${reason} delivery evidence before reopening.`;
      mockInspectRepositoryDeliveryReopen.mockResolvedValueOnce({
        status: "refused",
        nextAction: "stop",
        reason,
        recommendedActionText,
      });

      await handleReopen("foo", {});

      expect(mockLogError).toHaveBeenCalledWith(recommendedActionText);
      expect(process.exitCode).toBe(1);
      expect(mockIoExec).not.toHaveBeenCalled();
      expect(mockRunReopen).not.toHaveBeenCalled();
    },
  );

  it("reopens an unmerged WU, forwarding the resolved merge fact and the default close mode", async () => {
    mockIoExec.mockResolvedValueOnce({ stdout: '{"state":"OPEN"}\n', stderr: "" });
    await handleReopen("foo", {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo", prMerged: false, withdrawMode: "close" });
    expect(mockIoExec).toHaveBeenCalledWith("gh", ["pr", "view", "feat/foo", "--json", "state"]);
  });

  it("forwards the draft withdrawal mode under --keep-pr", async () => {
    mockIoExec.mockResolvedValueOnce({ stdout: '{"state":"OPEN"}\n', stderr: "" });
    await handleReopen("foo", { keepPr: true });
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ withdrawMode: "draft" });
  });

  it("forwards an exact reopened task orientation", async () => {
    mockIoExec.mockResolvedValueOnce({ stdout: '{"state":"OPEN"}\n', stderr: "" });
    await handleReopen("foo", { task: "Task 6.11.R — Revalidate the amended member boundary" });
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({
      nextTask: "Task 6.11.R — Revalidate the amended member boundary",
    });
  });

  it("forwards a merged PR fact and surfaces the resulting rejection", async () => {
    mockIoExec.mockResolvedValueOnce({ stdout: '{"state":"MERGED"}\n', stderr: "" });
    mockRunReopen.mockResolvedValueOnce({ status: "rejected", reason: "the PR has already merged — back out via a new WU." });
    await handleReopen("foo", {});
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ prMerged: true });
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("forwards an undefined merge fact when gh is unavailable, surfacing the guard's refusal", async () => {
    mockIoExec.mockRejectedValueOnce(new Error("gh: command not found"));
    mockRunReopen.mockResolvedValueOnce({
      status: "rejected",
      reason: "the PR's merge state can't be confirmed (`gh`/remote unavailable) — resolve it and retry.",
    });
    await handleReopen("foo", {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]?.prMerged).toBeUndefined();
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo", withdrawMode: "close" });
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("defaults a bare invocation to the current worktree's WU", async () => {
    mockIoExec.mockResolvedValueOnce({ stdout: '{"state":"OPEN"}\n', stderr: "" });
    await handleReopen(undefined, {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo" });
  });
});

describe("handleAttest", () => {
  it("emits one typed JSON refusal when identity resolution fails", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockResolveUserIdentity.mockRejectedValueOnce(new Error("identity unavailable"));

    await handleAttest("foo", { json: true });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const refusal = LifecycleCommandRefusalSchema.parse(
      JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])),
    );
    expect(refusal.remedy.argv).toEqual(["arc", "init"]);
    expect(mockLogError).not.toHaveBeenCalled();
    expect(mockRunAttest).not.toHaveBeenCalled();
  });

  it("attests when the index carries every reviewable edit", async () => {
    await handleAttest("foo", { json: true });

    expect(mockRunAttest).toHaveBeenCalledTimes(1);
    expect(mockRunAttest.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      lifecycle: "Active",
      newRoot: false,
    });
  });

  it("refuses without attesting when reviewable content is missing from the index", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockCollectUnstagedReviewablePaths.mockResolvedValueOnce([
      ".arc/active/tasks-foo.md",
      "packages/arc-framework/src/foo.ts",
    ]);

    await handleAttest("foo", { json: true });

    const refusal = JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])) as {
      status: string;
      reason: string;
      remedy: { argv: string[] };
    };
    expect(refusal.status).toBe("rejected");
    expect(refusal.reason).toContain(".arc/active/tasks-foo.md");
    expect(refusal.reason).toContain("packages/arc-framework/src/foo.ts");
    expect(refusal.remedy.argv).toEqual(["arc", "attest", "foo"]);
    expect(mockRunAttest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("names the deliberate re-rooting invocation as the re-attempt when re-rooting", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockCollectUnstagedReviewablePaths.mockResolvedValueOnce(["packages/arc-framework/src/foo.ts"]);

    await handleAttest("foo", { json: true, newRoot: true });

    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      remedy: { argv: ["arc", "attest", "foo", "--new-root"] },
    });
    expect(mockRunAttest).not.toHaveBeenCalled();
  });

  it("bounds a wide refusal's path list while reporting the full scale", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockCollectUnstagedReviewablePaths.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_value, index) => `src/file-${index}.ts`),
    );

    await handleAttest("foo", { json: true });

    const { reason } = JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])) as { reason: string };
    expect(reason).toContain("8 reviewable path(s)");
    expect(reason).toContain("src/file-4.ts");
    expect(reason).not.toContain("src/file-5.ts");
    expect(reason).toContain("and 3 more");
  });
});
