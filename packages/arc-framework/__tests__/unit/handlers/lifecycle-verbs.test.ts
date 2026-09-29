/**
 * Unit tests for the lifecycle verb handlers — the dispatch + refusal glue around
 * each `run*` transition. The dispatch core, the verbs, and the preamble seams
 * (identity, config, executor build, worktree resolution) are mocked at the module
 * seam; these assert each command dispatches its transition with the assembled
 * inputs and refuses (without dispatching) when a required input is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createStandardReviewReservation,
  projectCandidateReviewBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalize } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { spineRemedy } from "../../../src/scripts/integration/spine-refusal.js";

const mockLogError = vi.fn();
const mockLogInfo = vi.fn();
const mockNote = vi.fn();
const mockSelect = vi.fn();
const mockIoExec = vi.fn();
const mockIoExecInput = vi.fn();
const mockIoWriteFile = vi.fn();
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
      writeFile: (...args: unknown[]) => mockIoWriteFile(...args),
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

const mockParseMetaRecord = vi.fn((): {
  branch: string;
  state: string;
  taskList: string;
  currentWorkflow?: string | null;
  nextAction?: string | null;
  lastCompleted?: string | null;
  nextTask?: string | null;
} => ({ branch: "feat/foo", state: "Active", taskList: "tasks-foo.md" }));
const mockReadActiveMetaCandidates = vi.fn<(cwd: string) => Promise<{ candidates: { filename: string }[] }>>(
  async () => ({
    candidates: [{ filename: "meta-foo.md" }],
  }),
);
const mockSetMetaBulletFields = vi.fn<(
  content: string,
  fields: Record<string, string>,
) => string>((content) => content);
vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  formatValue: (value: string) => value,
  parseMetaRecord: () => mockParseMetaRecord(),
  readActiveMetaCandidates: (cwd: string) => mockReadActiveMetaCandidates(cwd),
  setMetaBulletFields: (...args: [string, Record<string, string>]) => mockSetMetaBulletFields(...args),
  setMetaCandidate: (content: string) => content,
}));
vi.mock("../../../src/lib/active/current-workflow-consistency.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/active/current-workflow-consistency.js")>(),
  checkCurrentWorkflowConsistency: () => [],
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
vi.mock("../../../src/lib/work-unit/git-decompose-v3-operation.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/lib/work-unit/git-decompose-v3-operation.js")>(),
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
const mockReadRepositoryCandidateRecordRevision = vi.fn();
const mockWriteCandidateRecord = vi.fn();
vi.mock("../../../src/lib/work-unit/candidate-record-store.js", () => ({
  readCandidateRecord: (...a: unknown[]) => mockReadCandidateRecord(...a),
  readRepositoryCandidateRecordRevision: (...a: unknown[]) => mockReadRepositoryCandidateRecordRevision(...a),
  writeCandidateRecord: (...a: unknown[]) => mockWriteCandidateRecord(...a),
}));
const mockResolveRepositoryIdentity = vi.fn();
vi.mock("../../../src/scripts/review-gate/hosts/local/git-common-state.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/scripts/review-gate/hosts/local/git-common-state.js")>()),
  resolveRepositoryIdentity: (...a: unknown[]) => mockResolveRepositoryIdentity(...a),
  withRepositoryReviewOperationLock: async <T>(
    _exec: unknown, _cwd: string, _operationId: string, _maxWaitMs: number,
    action: () => Promise<T>,
  ): Promise<T> => action(),
}));
const mockReadLaneProgressOwner = vi.fn();
vi.mock("../../../src/scripts/review-gate/lane-progress.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/scripts/review-gate/lane-progress.js")>()),
  readLaneProgressOwner: (...a: unknown[]) => mockReadLaneProgressOwner(...a),
}));
const mockCollectGitCandidateSubject = vi.fn();
const mockCollectUnstagedReviewablePaths = vi.fn();
vi.mock("../../../src/lib/work-unit/git-candidate-subject.js", () => ({
  collectGitCandidateSubject: (...a: unknown[]) => mockCollectGitCandidateSubject(...a),
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
const mockInspectRepositoryDeliveryCandidateRenewal = vi.fn();
vi.mock("../../../src/lib/delivery/repository-entry.js", () => ({
  inspectRepositoryDeliveryReopen: (...args: unknown[]) => mockInspectRepositoryDeliveryReopen(...args),
  inspectRepositoryDeliveryCandidateRenewal: (...args: unknown[]) =>
    mockInspectRepositoryDeliveryCandidateRenewal(...args),
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
  AttestCommandInputSchema,
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
  mockInspectRepositoryDeliveryCandidateRenewal.mockResolvedValue({ status: "not-applicable" });
  mockCollectUnstagedReviewablePaths.mockResolvedValue([]);
  mockWriteCandidateRecord.mockResolvedValue(".arc/system/.internal/candidates/foo.json");
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
  mockResolveRepositoryIdentity.mockResolvedValue("repository-id");
  mockReadLaneProgressOwner.mockResolvedValue(null);
  mockCollectGitCandidateSubject.mockResolvedValue({
    status: "collected",
    target: { revision: "a".repeat(40), subject: {} },
  });
  mockProjectGitCandidateEffectiveTarget.mockResolvedValue({
    state: "current",
    candidateId,
    recognizedTarget: {
      revision: "a".repeat(40),
      subject: { subjectDigest: `sha256:${"b".repeat(64)}` },
    },
    convergenceVerification: "satisfied",
    convergenceScope: null,
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
  mockIoWriteFile.mockResolvedValue(undefined);
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
          byteLength: 128,
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

  it.each([
    ["preview", null],
    ["apply", `sha256:${"a".repeat(64)}`],
  ] as const)("emits the same typed finish refusal for %s", async (_mode, authority) => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const remedy = spineRemedy(
      "Every extraction destination must be present on the live base.",
      "Land the reported destination, then retry finish",
      [
        "arc",
        "decompose",
        "mono",
        "--finish",
        "cut-map.json",
        ...(authority === null ? [] : ["--apply", authority]),
      ],
    );
    const refusal = {
      status: "refused",
      reason: "destination-missing",
      locus: "member",
      evidence: { expected: "planned", actual: { kind: "absent" } },
      remedy,
    };
    mockFinishGitV3Extraction.mockResolvedValue(refusal);

    await handleDecompose("mono", {
      finish: "cut-map.json",
      ...(authority === null ? {} : { apply: authority }),
    });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize(refusal)}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`destination-missing\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    [
      "preflight",
      { preflight: true as const },
      mockCreateGitV3DecomposePreflight,
      ["arc", "decompose", "mono", "--preflight"],
    ],
    [
      "execute",
      { execute: "cut-map.json" },
      mockExecuteGitV3DecomposeCommand,
      ["arc", "decompose", "mono", "--execute", "cut-map.json"],
    ],
    [
      "extract",
      { extract: "cut-map.json" },
      mockExecuteGitV3ExtractionCommand,
      ["arc", "decompose", "mono", "--extract", "cut-map.json"],
    ],
    [
      "finish preview",
      { finish: "cut-map.json" },
      mockFinishGitV3Extraction,
      ["arc", "decompose", "mono", "--finish", "cut-map.json"],
    ],
    [
      "finish apply",
      { finish: "cut-map.json", apply: `sha256:${"a".repeat(64)}` },
      mockFinishGitV3Extraction,
      ["arc", "decompose", "mono", "--finish", "cut-map.json", "--apply", `sha256:${"a".repeat(64)}`],
    ],
    [
      "advance base",
      { advanceBase: "cut-map.json" },
      mockAdvanceGitDecomposeTransitionBase,
      ["arc", "decompose", "mono", "--advance-base", "cut-map.json"],
    ],
  ] as const)("converts a thrown %s failure to the core refusal", async (mode, options, adapter, argv) => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const locus = `${mode} exploded`;
    adapter.mockRejectedValue(new Error(locus));
    const remedy = spineRemedy(
      "The selected decomposition mode must complete without an unexpected runtime failure.",
      "Retry the selected mode",
      argv,
    );
    const refusal = {
      status: "refused",
      reason: "unexpected-error",
      locus,
      remedy,
    };

    await handleDecompose("mono", options);

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize(refusal)}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`unexpected-error\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);

    stdoutWrite.mockClear();
    stderrWrite.mockClear();
    process.exitCode = undefined;
    adapter.mockRejectedValue(new Error(""));

    await handleDecompose("mono", options);

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize({
      status: "refused",
      reason: "unexpected-error",
      remedy,
    })}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`unexpected-error\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it("surfaces the execute adapter's precomposed recovery without rebuilding it", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const remedy = spineRemedy(
      "The candidate must be recoverable from its typed operation facts.",
      "Retry the selected mode",
      ["arc", "decompose", "mono", "--execute", "cut-map.json"],
    );
    mockExecuteGitV3DecomposeCommand.mockResolvedValue({
      status: "refused",
      stage: "occupation",
      reason: "candidate-conflict",
      recovery: { kind: "none" },
      remedy,
    });

    await handleDecompose("mono", { execute: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize({
      status: "refused",
      stage: "occupation",
      reason: "candidate-conflict",
      recovery: { kind: "none" },
      remedy,
    })}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`candidate-conflict\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it("emits uncovered retirement content through the strict decompose refusal boundary", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const refusal = {
      status: "refused" as const,
      stage: "repository-plan" as const,
      reason: "conservation:live-conservation:uncovered-retirement-content",
      locus: ".arc/active/notes-mono.md",
      recovery: { kind: "none" as const },
      remedy: spineRemedy(
        "Retirement cannot delete nonempty companion content outside the conservation proof.",
        "Move the content into a scanned artifact or delete the file, then re-run preflight",
        ["arc", "decompose", "mono", "--preflight"],
      ),
    };
    mockExecuteGitV3DecomposeCommand.mockResolvedValue(refusal);

    await handleDecompose("mono", { execute: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize(refusal)}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`${refusal.reason}\n${refusal.remedy.text}\n`);
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

  it("keeps unchanged advance-base output free of refusal fields", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const unchanged = {
      status: "unchanged",
      candidateBranch: "chore/decompose-mono",
      candidateHead: "d".repeat(40),
      currentBaseHead: "c".repeat(40),
    } as const;
    mockAdvanceGitDecomposeTransitionBase.mockResolvedValue(unchanged);

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize(unchanged)}\n`);
    expect(process.exitCode).toBeUndefined();
  });

  it("emits an actionable advance-base comparison refusal", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const refusal = {
      status: "refused",
      reason: "base-not-descendant",
      locus: "main",
      evidence: { expected: "base-before", actual: "base-now" },
    } as const;
    const remedy = spineRemedy(
      "The live result base must descend from the decomposition plan's authenticated base.",
      "Land or select a descendant base, then retry base advancement",
      ["arc", "decompose", "mono", "--advance-base", "cut-map.json"],
    );
    mockAdvanceGitDecomposeTransitionBase.mockResolvedValue(refusal);

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize({ ...refusal, remedy })}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`${refusal.reason}\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it("emits an actionable nested advancement-plan refusal", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const refusal = {
      status: "refused",
      reason: "advancement-plan-refused:conservation:uncovered-retirement-content",
      locus: ".arc/active/notes-mono.md",
      evidence: { expected: "covered", actual: "uncovered" },
    } as const;
    const remedy = spineRemedy(
      "Retirement cannot delete nonempty companion content outside the conservation proof.",
      "Move the content at .arc/active/notes-mono.md into a scanned artifact or delete the file, then re-run preflight",
      ["arc", "decompose", "mono", "--preflight"],
    );
    mockAdvanceGitDecomposeTransitionBase.mockResolvedValue(refusal);

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize({ ...refusal, remedy })}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`${refusal.reason}\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it("emits candidate cleanup for a stranded base-advancement result", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const refusal = {
      status: "refused",
      reason: "candidate-restore-failed",
      locus: "/repo/decompose-mono",
    } as const;
    const remedy = spineRemedy(
      "A refused base advancement must restore its candidate to the authenticated head.",
      "Clean the stranded candidate at /repo/decompose-mono, then retry with arc decompose mono --advance-base cut-map.json",
      ["arc", "teardown", "--branch", "chore/decompose-mono"],
    );
    mockAdvanceGitDecomposeTransitionBase.mockResolvedValue(refusal);

    await handleDecompose("mono", { advanceBase: "cut-map.json" });

    expect(stdoutWrite).toHaveBeenCalledWith(`${canonicalize({ ...refusal, remedy })}\n`);
    expect(stderrWrite).toHaveBeenCalledWith(`${refusal.reason}\n${remedy.text}\n`);
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["conflicting modes", { preflight: true, execute: "cut-map.json" }],
    ["advance-base with another mode", { preflight: true, advanceBase: "cut-map.json" }],
    ["apply without finish", { apply: `sha256:${"a".repeat(64)}` }],
  ])("refuses %s before any production adapter", async (_case, options) => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await handleDecompose(
      "mono",
      options as unknown as Parameters<typeof handleDecompose>[1],
    );

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalled();
    expect(mockCreateGitV3DecomposePreflight).not.toHaveBeenCalled();
    expect(mockExecuteGitV3DecomposeCommand).not.toHaveBeenCalled();
    expect(mockExecuteGitV3ExtractionCommand).not.toHaveBeenCalled();
    expect(mockFinishGitV3Extraction).not.toHaveBeenCalled();
    expect(mockAdvanceGitDecomposeTransitionBase).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("refuses a malformed apply digest with the kernel schema message", async () => {
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await handleDecompose("mono", { finish: "cut-map.json", apply: "sha256:BAD" });

    expect(stderrWrite.mock.calls.flat().join("")).toContain(
      "Expected sha256: followed by 64 lowercase hex characters",
    );
    expect(mockFinishGitV3Extraction).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("keeps a missing-project finish refusal outside the mode envelope", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    mockResolveArcRoot.mockReturnValueOnce(null);

    await handleDecompose("mono", { finish: "cut-map.json" });

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(stderrWrite).toHaveBeenCalledWith(
      "Not inside an ARC project (no .arc/ directory found walking up from cwd).\n",
    );
    expect(mockFinishGitV3Extraction).not.toHaveBeenCalled();
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
  const convergencePendingBoundary = () => {
    const candidateId = `sha256:${"a".repeat(64)}`;
    const candidateSubjectDigest = `sha256:${"b".repeat(64)}`;
    const reviewedHead = "a".repeat(40);
    const resume = Buffer.from(JSON.stringify({ selfReview: "settled" }), "utf8").toString("base64url");
    const postAttestContinuation = {
      reviewedHead,
      nextAction: {
        kind: "continue-pre-publication-review" as const,
        command: `arc review pre-publication foo --resume ${resume}`,
        interactionText: "Resume pre-publication review over the converged Candidate.",
      },
      projectionDisposition: "keep-staged-until-publication" as const,
    };
    return {
      candidateId,
      candidateSubjectDigest,
      reviewedHead,
      postAttestContinuation,
      boundary: {
        schemaVersion: 1 as const,
        mode: "integration-boundary" as const,
        workUnit: "foo",
        candidateId,
        candidateSubjectDigest,
        terminus: null,
        deliveryReviewTermini: [],
        locus: "candidate-convergence-verification-pending" as const,
        nextAction: {
          kind: "run-convergence-verification" as const,
          command: "arc attest foo --json",
          interactionText: "Run convergence verification, then attest.",
          postAttestContinuation,
        },
        policy: null,
        reservation: null,
      },
    };
  };
  it("defaults convergence scope to full and rejects malformed scope or evidence", () => {
    expect(AttestCommandInputSchema.parse({ name: "foo" })).toMatchObject({ scope: "full" });
    expect(AttestCommandInputSchema.safeParse({ name: "foo", scope: "broad" }).success).toBe(false);
    expect(AttestCommandInputSchema.safeParse({
      name: "foo",
      verificationEvidenceRef: " ",
    }).success).toBe(false);
    expect(AttestCommandInputSchema.safeParse({
      name: "foo",
      verificationEvidenceRef: "{verificationEvidenceRef}",
    }).success).toBe(false);
  });

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

  it("returns a typed restore-and-retry refusal when the live review record cannot be read", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const reviewHeadSha = "a".repeat(40);
    mockReadLaneProgressOwner.mockResolvedValueOnce({
      attempts: [{ attemptId: "attempt-1", outcome: "pending", headSha: reviewHeadSha }],
    });
    mockReadRepositoryCandidateRecordRevision.mockRejectedValueOnce(new Error("missing review-head record"));
    mockRunAttest.mockImplementationOnce(async (context) => {
      await context.inspectReRootReviewAuthority("foo", `sha256:${"a".repeat(64)}`);
      throw new Error("expected record lookup refusal");
    });

    await handleAttest("foo", { newRoot: true, json: true });

    const refusal = LifecycleCommandRefusalSchema.parse(
      JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])),
    );
    expect(refusal.reason).toContain("missing review-head record");
    expect(refusal.remedy.argv).toEqual(["arc", "attest", "foo", "--new-root"]);
    expect(process.exitCode).toBe(1);
  });

  it("attests when the index carries every reviewable edit", async () => {
    await handleAttest("foo", { json: true });

    expect(mockRunAttest).toHaveBeenCalledTimes(1);
    expect(mockRunAttest.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      lifecycle: "Active",
      newRoot: false,
      scope: "full",
    });
  });

  it("repairs the exact post-attest continuation after the Candidate write outlives a boundary failure", async () => {
    const fixture = convergencePendingBoundary();
    mockReadSubmissionBoundaryVersioned.mockResolvedValue({
      boundary: fixture.boundary,
      version: "pending-boundary-version",
    });
    let attempt = 0;
    mockRunAttest.mockImplementation(async (context) => {
      attempt += 1;
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId: fixture.candidateId } },
        candidateId: fixture.candidateId,
        candidateSubjectDigest: fixture.candidateSubjectDigest,
        currentWorkflow: "prepare-work-unit",
        nextAction: "Resume pre-publication review",
        expectedRecordVersion: attempt === 1 ? "candidate-version" : "persisted-candidate-version",
        repairCurrent: attempt > 1,
      });
      return attempt === 1
        ? { status: "attested", operation: "convergence", ...published }
        : { status: "unchanged", locus: published.locus };
    });
    let persistedBoundary: unknown = null;
    mockWriteSubmissionBoundary
      .mockRejectedValueOnce(new Error("boundary write interrupted"))
      .mockImplementationOnce(async (_cwd, boundary, expectedVersion) => {
        expect(expectedVersion).toBe("pending-boundary-version");
        persistedBoundary = boundary;
        return ".arc/system/.internal/candidates/foo.boundary.json";
      });

    await expect(handleAttest("foo", { json: true })).rejects.toThrow("boundary write interrupted");
    expect(mockWriteCandidateRecord).toHaveBeenCalledTimes(1);
    expect(mockIoWriteFile).not.toHaveBeenCalled();
    expect(mockIoExec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["add"]), expect.anything());

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await handleAttest("foo", { json: true });

    expect(persistedBoundary).toMatchObject({
      locus: "candidate-review-pending",
      candidateId: fixture.candidateId,
      candidateSubjectDigest: fixture.candidateSubjectDigest,
      nextAction: fixture.postAttestContinuation.nextAction,
      postAttestContinuation: fixture.postAttestContinuation,
    });
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "unchanged",
      locus: {
        locus: "candidate-review-pending",
        nextAction: fixture.postAttestContinuation.nextAction,
        postAttestContinuation: fixture.postAttestContinuation,
      },
    });
    expect(mockIoWriteFile).toHaveBeenCalledTimes(1);
    expect(mockIoExec).toHaveBeenCalledWith(
      "git",
      [
        "add", "--",
        ".arc/system/.internal/candidates/foo.json",
        ".arc/active/meta-foo.md",
        ".arc/system/.internal/candidates/foo.boundary.json",
      ],
      { cwd: "/repo" },
    );
  });

  it("preserves the post-attest continuation across metadata and staging retry", async () => {
    const fixture = convergencePendingBoundary();
    let currentBoundary = fixture.boundary;
    let boundaryVersion = "pending-boundary-version";
    mockReadSubmissionBoundaryVersioned.mockImplementation(async () => ({
      boundary: currentBoundary,
      version: boundaryVersion,
    }));
    mockWriteSubmissionBoundary.mockImplementation(async (_cwd, boundary) => {
      currentBoundary = boundary;
      boundaryVersion = `boundary-version-${mockWriteSubmissionBoundary.mock.calls.length}`;
      return ".arc/system/.internal/candidates/foo.boundary.json";
    });
    let attempt = 0;
    mockRunAttest.mockImplementation(async (context) => {
      attempt += 1;
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId: fixture.candidateId } },
        candidateId: fixture.candidateId,
        candidateSubjectDigest: fixture.candidateSubjectDigest,
        currentWorkflow: "prepare-work-unit",
        nextAction: "Resume pre-publication review",
        expectedRecordVersion: attempt === 1 ? "candidate-version" : "persisted-candidate-version",
        repairCurrent: attempt > 1,
      });
      return attempt === 1
        ? { status: "attested", operation: "convergence", ...published }
        : { status: "unchanged", locus: published.locus };
    });
    mockIoWriteFile.mockRejectedValueOnce(new Error("meta write interrupted"));

    await expect(handleAttest("foo", { json: true })).rejects.toThrow("meta write interrupted");
    expect(currentBoundary).toMatchObject({
      locus: "candidate-review-pending",
      postAttestContinuation: fixture.postAttestContinuation,
    });

    mockIoExec.mockRejectedValueOnce(new Error("index write interrupted"));
    await expect(handleAttest("foo", { json: true })).rejects.toThrow("index write interrupted");
    expect(currentBoundary).toMatchObject({
      locus: "candidate-review-pending",
      postAttestContinuation: fixture.postAttestContinuation,
    });

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await handleAttest("foo", { json: true });

    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "unchanged",
      locus: {
        locus: "candidate-review-pending",
        nextAction: fixture.postAttestContinuation.nextAction,
        postAttestContinuation: fixture.postAttestContinuation,
      },
    });
    expect(mockIoWriteFile).toHaveBeenCalledTimes(3);
    expect(mockIoExec).toHaveBeenLastCalledWith(
      "git",
      [
        "add", "--",
        ".arc/system/.internal/candidates/foo.json",
        ".arc/active/meta-foo.md",
        ".arc/system/.internal/candidates/foo.boundary.json",
      ],
      { cwd: "/repo" },
    );
  });

  it("passes scoped convergence evidence through the public handler", async () => {
    await handleAttest("foo", {
      json: true,
      scope: "focused",
      verificationEvidenceRef: "verification://focused/current",
    });

    expect(mockRunAttest).toHaveBeenCalledTimes(1);
    expect(mockRunAttest.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      scope: "focused",
      verificationEvidenceRef: "verification://focused/current",
    });
  });

  it("preserves scoped refusal coordinates and action in JSON output", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockRunAttest.mockResolvedValueOnce({
      status: "refused",
      reason: "verification-evidence-required",
      candidateId: `sha256:${"c".repeat(64)}`,
      subjectDigest: `sha256:${"d".repeat(64)}`,
      requestedScope: "focused",
      requiredScope: "focused",
      verificationEvidenceProvided: false,
      nextAction: {
        kind: "run-verification",
        scope: "focused",
        verificationKind: "focused",
        verificationEvidenceRequired: true,
        attestArgv: [
          "arc", "attest", "foo", "--scope", "focused",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
      recommendedActionText: "Run focused convergence verification and supply its fresh evidence reference.",
    });

    await handleAttest("foo", { json: true, scope: "focused" });

    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "refused",
      candidateId: `sha256:${"c".repeat(64)}`,
      subjectDigest: `sha256:${"d".repeat(64)}`,
      requestedScope: "focused",
      requiredScope: "focused",
      verificationEvidenceProvided: false,
      nextAction: {
        verificationKind: "focused",
        attestArgv: [
          "arc", "attest", "foo", "--scope", "focused",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
    });
  });

  it("renders scoped refusal coordinates and exact action interactively", async () => {
    mockRunAttest.mockResolvedValueOnce({
      status: "refused",
      reason: "verification-scope-insufficient",
      candidateId: `sha256:${"c".repeat(64)}`,
      subjectDigest: `sha256:${"d".repeat(64)}`,
      requestedScope: "focused",
      requiredScope: "full",
      verificationEvidenceProvided: true,
      nextAction: {
        kind: "run-verification",
        scope: "full",
        verificationKind: "tier-3",
        verificationEvidenceRequired: true,
        attestArgv: [
          "arc", "attest", "foo", "--scope", "full",
          "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
        ],
      },
      recommendedActionText: "Run full convergence verification.",
    });

    await handleAttest("foo", {
      scope: "focused",
      verificationEvidenceRef: "verification://focused/current",
    });

    expect(mockLogError).toHaveBeenCalledWith(expect.stringMatching(
      /Candidate: sha256:c{64}[\s\S]*Subject: sha256:d{64}[\s\S]*focused requested; full required[\s\S]*Fresh evidence: supplied[\s\S]*arc attest foo --scope full --verification-evidence-ref \{verificationEvidenceRef\} --json/u,
    ));
  });

  it("renders re-root race coordinates, reason, and refresh action interactively", async () => {
    mockRunAttest.mockResolvedValueOnce({
      status: "refused",
      reason: "re-root-subject-mismatch",
      expected: {
        candidateId: `sha256:${"a".repeat(64)}`,
        subjectDigest: `sha256:${"b".repeat(64)}`,
      },
      observed: {
        candidateId: `sha256:${"a".repeat(64)}`,
        subjectDigest: `sha256:${"c".repeat(64)}`,
      },
      nextAction: {
        kind: "refresh-attestation",
        attestArgv: ["arc", "attest", "foo", "--json"],
      },
      recommendedActionText: "The bound re-root continuation is stale. Refresh Candidate attestation state.",
    });

    await handleAttest("foo", { newRoot: true });

    expect(mockLogError).toHaveBeenCalledWith(expect.stringMatching(
      /Reason: re-root-subject-mismatch[\s\S]*Expected Candidate: sha256:a{64}[\s\S]*Observed Candidate: sha256:a{64}[\s\S]*Expected Subject: sha256:b{64}[\s\S]*Observed Subject: sha256:c{64}[\s\S]*Next: arc attest foo --json/u,
    ));
  });

  it("renders recorded convergence scope and evidence in interactive output", async () => {
    mockRunAttest.mockResolvedValueOnce({
      status: "attested",
      operation: "convergence",
      scope: "focused",
      verificationEvidenceRef: "verification://focused/current",
      recordPath: ".arc/system/.internal/candidates/foo.json",
      metaPath: ".arc/active/meta-foo.md",
      locus: projectCandidateReviewBoundary({
        workUnit: "foo",
        candidateId: `sha256:${"c".repeat(64)}`,
      }),
    });

    await handleAttest("foo", {
      scope: "focused",
      verificationEvidenceRef: "verification://focused/current",
    });

    expect(mockNote).toHaveBeenCalledWith(
      expect.stringMatching(/Scope:\s+focused[\s\S]*Evidence:\s+verification:\/\/focused\/current/u),
      "Candidate attested",
    );
  });

  it("refuses Integrating attestation before Candidate mutation when public delivery evidence is not exact", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockParseMetaRecord.mockReturnValue({
      branch: "feat/foo",
      state: "Integrating",
      taskList: "tasks-foo.md",
    });
    mockInspectRepositoryDeliveryCandidateRenewal.mockResolvedValueOnce({
      status: "refused",
      reason: "public-boundary-mismatch",
    });

    await handleAttest("foo", { json: true });

    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("public delivery Candidate renewal"),
    });
    expect(mockRunAttest).not.toHaveBeenCalled();
  });

  it("recovers an Owner-accepted public boundary across repair-current subject movement", async () => {
    const candidateId = `sha256:${"a".repeat(64)}`;
    const sourceSubjectDigest = `sha256:${"b".repeat(64)}`;
    const movedSubjectDigest = `sha256:${"c".repeat(64)}`;
    const terminus = {
      schemaVersion: 1 as const,
      semanticsVersion: "review-terminus/v1" as const,
      kind: "owner-accepted" as const,
      lane: "standard" as const,
      acceptedBy: "andrew",
      completedPasses: 2,
    };
    const source = projectPublicationBoundary({
      workUnit: "foo",
      branch: "feat/foo",
      candidateId,
      candidateSubjectDigest: sourceSubjectDigest,
      reservation: null,
      terminus,
      changeRequest: null,
    });
    mockParseMetaRecord.mockReturnValue({
      branch: "feat/foo",
      state: "Active",
      taskList: "tasks-foo.md",
      currentWorkflow: "prepare-work-unit",
      nextAction: "Candidate review pending — run pre-publication review",
      lastCompleted: null,
      nextTask: null,
    });
    mockReadSubmissionBoundaryVersioned.mockResolvedValue({
      boundary: source,
      version: "source-boundary-version",
    });
    let persistedBoundary: unknown = null;
    mockWriteSubmissionBoundary.mockImplementation(async (_cwd, boundary) => {
      persistedBoundary = boundary;
      return ".arc/system/.internal/candidates/foo.boundary.json";
    });
    mockSetMetaBulletFields.mockImplementationOnce((_content, fields) => JSON.stringify(fields));
    let persistedMeta = "";
    mockIoWriteFile.mockImplementationOnce(async (_path, content) => {
      persistedMeta = String(content);
    });
    mockRunAttest.mockImplementationOnce(async (context) => {
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId } },
        candidateId,
        candidateSubjectDigest: movedSubjectDigest,
        currentWorkflow: "prepare-work-unit",
        nextAction: "Candidate review pending — run pre-publication review",
        expectedRecordVersion: "candidate-version",
        repairCurrent: true,
      });
      return { status: "unchanged", locus: published.locus };
    });
    vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleAttest("foo", { json: true });

    expect(persistedBoundary).toEqual({
      ...source,
      candidateSubjectDigest: movedSubjectDigest,
    });
    expect(JSON.parse(persistedMeta)).toMatchObject({
      "Next Action": source.nextAction.interactionText,
    });
  });

  it.each(["Integrating", "Shipped"] as const)("preserves public delivery authority while %s", async (lifecycle) => {
    const sourceCandidateId = `sha256:${"a".repeat(64)}`;
    const candidateId = `sha256:${"b".repeat(64)}`;
    const subjectDigest = `sha256:${"c".repeat(64)}`;
    const planId = "11111111-1111-4111-8111-111111111111";
    const memberTerminus = {
      vehicle: {
        kind: "delivery-member" as const,
        planId,
        deliverableId: `sha256:${"f".repeat(64)}`,
        workUnitId: "foo",
        head: "a".repeat(40),
      },
      terminus: {
        schemaVersion: 1 as const,
        semanticsVersion: "review-terminus/v1" as const,
        kind: "owner-accepted" as const,
        lane: "standard" as const,
        acceptedBy: "andrew",
        completedPasses: 2,
      },
    };
    const reservation = createStandardReviewReservation({
      candidateId: sourceCandidateId,
      sourceId: "codex-pr",
      target: {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "foo",
        planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"d".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    const source = {
      ...projectPublicationBoundary({
        workUnit: "foo",
        branch: "feat/foo",
        candidateId: sourceCandidateId,
        candidateSubjectDigest: `sha256:${"e".repeat(64)}`,
        reservation,
        changeRequest: null,
      }),
      deliveryReviewTermini: [memberTerminus],
    };
    const deliveryContinuation = {
      schemaVersion: 1 as const,
      semanticsVersion: "delivery-public-review-continuation/v1" as const,
      planId,
      planRevision: 1,
      planDigest: `sha256:${"1".repeat(64)}`,
      stateRevision: 7,
      stateDigest: `sha256:${"2".repeat(64)}`,
      memberEvidenceDigest: `sha256:${"3".repeat(64)}`,
    };
    mockParseMetaRecord.mockReturnValue({
      branch: "feat/foo",
      state: lifecycle,
      taskList: "tasks-foo.md",
      currentWorkflow: lifecycle === "Integrating" ? "integrate-work-unit" : "[none]",
      nextAction: lifecycle === "Integrating" ? "resume integration review" : "[none]",
      lastCompleted: null,
      nextTask: null,
    });
    mockReadSubmissionBoundaryVersioned.mockResolvedValue({
      boundary: source,
      version: "source-boundary-version",
    });
    mockInspectRepositoryDeliveryCandidateRenewal.mockResolvedValue({
      status: "ready",
      planId,
      stateRevision: 7,
      deliveryContinuation,
    });
    let persistedBoundary: unknown = null;
    mockWriteSubmissionBoundary.mockImplementation(async (
      _cwd: unknown,
      boundary: unknown,
      expectedVersion: unknown,
    ) => {
      if (expectedVersion !== "source-boundary-version") {
        throw new Error("renewed boundary did not use the source boundary version");
      }
      persistedBoundary = boundary;
      return ".arc/system/.internal/candidates/foo.boundary.json";
    });
    mockRunAttest.mockImplementationOnce(async (context) => {
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId, supersedes: sourceCandidateId } },
        candidateId,
        candidateSubjectDigest: subjectDigest,
        currentWorkflow: "integrate-work-unit",
        nextAction: "Candidate review pending — resume integration review",
        expectedRecordVersion: "candidate-version",
        repairCurrent: false,
      });
      return { status: "attested", operation: "re-root", ...published };
    });
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await handleAttest("foo", { json: true, newRoot: true });

    expect(persistedBoundary).toMatchObject({
      mode: "integration-boundary",
      locus: "delivery-status-required",
      workUnit: "foo",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      deliveryContinuation,
      deliveryReviewTermini: [memberTerminus],
      nextAction: expect.objectContaining({ kind: "resolve-delivery-status" }),
    });
    expect(mockParseMetaRecord.mock.results.at(-1)?.value).toMatchObject({ state: lifecycle });
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "attested",
      locus: { locus: "delivery-status-required", candidateId },
    });
  });

  it("repairs forward when Candidate persistence succeeds before the boundary version write", async () => {
    const sourceCandidateId = `sha256:${"a".repeat(64)}`;
    const candidateId = `sha256:${"b".repeat(64)}`;
    const subjectDigest = `sha256:${"c".repeat(64)}`;
    const planId = "11111111-1111-4111-8111-111111111111";
    const reservation = createStandardReviewReservation({
      candidateId: sourceCandidateId,
      sourceId: "codex-pr",
      target: {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "foo",
        planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"d".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    const source = projectPublicationBoundary({
      workUnit: "foo",
      branch: "feat/foo",
      candidateId: sourceCandidateId,
      candidateSubjectDigest: `sha256:${"e".repeat(64)}`,
      reservation,
      changeRequest: null,
    });
    const deliveryContinuation = {
      schemaVersion: 1 as const,
      semanticsVersion: "delivery-public-review-continuation/v1" as const,
      planId,
      planRevision: 1,
      planDigest: `sha256:${"1".repeat(64)}`,
      stateRevision: 7,
      stateDigest: `sha256:${"2".repeat(64)}`,
      memberEvidenceDigest: `sha256:${"3".repeat(64)}`,
    };
    mockParseMetaRecord.mockReturnValue({
      branch: "feat/foo",
      state: "Integrating",
      taskList: "tasks-foo.md",
      currentWorkflow: "integrate-work-unit",
      nextAction: "resume integration review",
      lastCompleted: null,
      nextTask: null,
    });
    mockReadSubmissionBoundaryVersioned.mockResolvedValue({
      boundary: source,
      version: "source-boundary-version",
    });
    mockInspectRepositoryDeliveryCandidateRenewal.mockResolvedValue({
      status: "ready",
      planId,
      stateRevision: 7,
      deliveryContinuation,
    });
    let persistedCandidate: unknown = null;
    mockWriteCandidateRecord.mockImplementation(async (
      _cwd: unknown,
      _name: unknown,
      record: unknown,
    ) => {
      persistedCandidate = record;
      return ".arc/system/.internal/candidates/foo.json";
    });
    let attempt = 0;
    mockRunAttest.mockImplementation(async (context) => {
      attempt += 1;
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId, supersedes: sourceCandidateId } },
        candidateId,
        candidateSubjectDigest: subjectDigest,
        currentWorkflow: "integrate-work-unit",
        nextAction: "Candidate review pending — resume integration review",
        expectedRecordVersion: attempt === 1 ? "source-candidate-version" : "renewed-candidate-version",
        repairCurrent: attempt > 1,
      });
      return { status: "attested", operation: "re-root", ...published };
    });
    let persistedBoundary: unknown = null;
    mockWriteSubmissionBoundary
      .mockRejectedValueOnce(new Error("stale boundary version"))
      .mockImplementationOnce(async (
        _cwd: unknown,
        boundary: unknown,
        expectedVersion: unknown,
      ) => {
        if (expectedVersion !== "source-boundary-version") {
          throw new Error("forward repair did not retain the source boundary version");
        }
        persistedBoundary = boundary;
        return ".arc/system/.internal/candidates/foo.boundary.json";
      });

    await expect(handleAttest("foo", { json: true, newRoot: true }))
      .rejects.toThrow("stale boundary version");
    expect(persistedCandidate).toMatchObject({
      attestation: { candidateId, supersedes: sourceCandidateId },
    });
    expect(persistedBoundary).toBeNull();

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await handleAttest("foo", { json: true, newRoot: true });

    expect(persistedBoundary).toMatchObject({
      locus: "delivery-status-required",
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      deliveryContinuation,
    });
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "attested",
      operation: "re-root",
      locus: { locus: "delivery-status-required", candidateId },
    });
  });

  it("refreshes delivery evidence across boundary, meta, and index interruption", async () => {
    const sourceCandidateId = `sha256:${"a".repeat(64)}`;
    const candidateId = `sha256:${"b".repeat(64)}`;
    const subjectDigest = `sha256:${"c".repeat(64)}`;
    const planId = "11111111-1111-4111-8111-111111111111";
    const reservation = createStandardReviewReservation({
      candidateId: sourceCandidateId,
      sourceId: "codex-pr",
      target: {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: "foo",
        planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"d".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    let currentBoundary = projectPublicationBoundary({
      workUnit: "foo",
      branch: "feat/foo",
      candidateId: sourceCandidateId,
      candidateSubjectDigest: `sha256:${"e".repeat(64)}`,
      reservation,
      changeRequest: null,
    });
    let boundaryVersion = "source-boundary-version";
    let stateRevision = 7;
    const continuation = () => ({
      schemaVersion: 1 as const,
      semanticsVersion: "delivery-public-review-continuation/v1" as const,
      planId,
      planRevision: 1,
      planDigest: `sha256:${"1".repeat(64)}`,
      stateRevision,
      stateDigest: `sha256:${stateRevision.toString(16).repeat(64)}`,
      memberEvidenceDigest: `sha256:${(stateRevision + 1).toString(16).repeat(64)}`,
    });
    mockParseMetaRecord.mockReturnValue({
      branch: "feat/foo",
      state: "Integrating",
      taskList: "tasks-foo.md",
      currentWorkflow: "integrate-work-unit",
      nextAction: "resume integration review",
      lastCompleted: null,
      nextTask: null,
    });
    mockReadSubmissionBoundaryVersioned.mockImplementation(async () => ({
      boundary: currentBoundary,
      version: boundaryVersion,
    }));
    mockInspectRepositoryDeliveryCandidateRenewal.mockImplementation(async () => ({
      status: "ready",
      planId,
      stateRevision,
      deliveryContinuation: continuation(),
    }));
    mockWriteSubmissionBoundary.mockImplementation(async (
      _cwd: unknown,
      boundary: typeof currentBoundary,
      expectedVersion: unknown,
    ) => {
      if (expectedVersion !== boundaryVersion) throw new Error("stale boundary version");
      currentBoundary = boundary;
      boundaryVersion = `boundary-version-${stateRevision}`;
      return ".arc/system/.internal/candidates/foo.boundary.json";
    });
    let attempt = 0;
    mockRunAttest.mockImplementation(async (context) => {
      attempt += 1;
      const published = await context.publish({
        name: "foo",
        record: { attestation: { candidateId, supersedes: sourceCandidateId } },
        candidateId,
        candidateSubjectDigest: subjectDigest,
        currentWorkflow: "integrate-work-unit",
        nextAction: "Candidate review pending — resume integration review",
        expectedRecordVersion: attempt === 1 ? "source-candidate-version" : "renewed-candidate-version",
        repairCurrent: attempt > 1,
      });
      return { status: "attested", operation: "re-root", ...published };
    });
    mockIoWriteFile.mockRejectedValueOnce(new Error("meta write interrupted"));

    await expect(handleAttest("foo", { json: true, newRoot: true }))
      .rejects.toThrow("meta write interrupted");
    expect(currentBoundary).toMatchObject({
      candidateId,
      deliveryContinuation: { stateRevision: 7 },
    });

    stateRevision = 8;
    mockIoExec.mockRejectedValueOnce(new Error("index write interrupted"));
    await expect(handleAttest("foo", { json: true, newRoot: true }))
      .rejects.toThrow("index write interrupted");
    expect(currentBoundary).toMatchObject({
      candidateId,
      deliveryContinuation: { stateRevision: 8 },
    });

    stateRevision = 9;
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await handleAttest("foo", { json: true, newRoot: true });

    expect(currentBoundary).toMatchObject({
      candidateId,
      candidateSubjectDigest: subjectDigest,
      reservation,
      deliveryContinuation: { stateRevision: 9 },
    });
    expect(JSON.parse(String(stdoutWrite.mock.calls[0]?.[0]))).toMatchObject({
      status: "attested",
      locus: { locus: "delivery-status-required", candidateId },
    });
  });

  it("forwards the exact Candidate and subject selectors on a bound re-root", async () => {
    const expectedCandidate = `sha256:${"a".repeat(64)}`;
    const expectedSubject = `sha256:${"b".repeat(64)}`;

    await handleAttest("foo", {
      json: true,
      newRoot: true,
      expectedCandidate,
      expectedSubject,
    });

    expect(mockRunAttest).toHaveBeenCalledTimes(1);
    expect(mockRunAttest.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      lifecycle: "Active",
      newRoot: true,
      expectedBlocked: {
        candidateId: expectedCandidate,
        subjectDigest: expectedSubject,
      },
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

  it("refuses without attesting when the branch and its base leave no single base to collect against", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    mockCollectGitCandidateSubject.mockResolvedValueOnce({
      status: "refused",
      reason: "merge-base-ambiguous",
      detail: "The revisions have more than one best merge base.",
    });

    await handleAttest("foo", { json: true });

    const refusal = LifecycleCommandRefusalSchema.parse(
      JSON.parse(String(stdoutWrite.mock.calls[0]?.[0])),
    );
    expect(refusal.reason).toContain("merge-base-ambiguous");
    expect(refusal.reason).toContain("The revisions have more than one best merge base.");
    expect(refusal.remedy.argv).toEqual(["arc", "attest", "foo"]);
    expect(mockRunAttest).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
