/** Exact Errand review clearance across real base movement and native status composition. */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleReviewLocalAttest, handleReviewLocalPrepare, handleReviewStatus } from "../../src/handlers/review.js";
import { TransientIdentityRecordV3Schema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { recordHostedRequestAdmission, acknowledgeHostedRequest, recordHostedAwaitAttempt, readLaneProgress } from
  "../../src/scripts/review-gate/lane-progress.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { projectGitReviewContributionApplicability } from
  "../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";
import type { HostedRequestHandle } from "../../src/scripts/review-gate/hosted/request.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalAttestDependencies } from "../../src/scripts/review-gate/runtime/local-attest-composition.js";
import { attestLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createReviewStatusPort } from "../../src/scripts/review-gate/status-composition.js";
import { resolveReviewStatus, ReviewStatusCommandResultSchema } from "../../src/scripts/review-gate/status.js";
import { readErrandRoutedObligation } from "../../src/scripts/review-gate/status-errand.js";
import { BaseMovementObservationSchema } from "../../src/lib/evidence-applicability/index.js";
import {
  advanceBase, arrangeBranchSide, movementPaths, arrangeAmbiguousMergeBase, arrangeUnrelatedBase,
  withUnreadableMergeBases, type GitExecLike, type BaseMovementKind,
} from "../helpers/base-advance.js";
import { makeGitExec, execFileAsync } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
const repository = "owner/repo";
const pullRequest = 42;
const slug = "review-currency";
const branch = `chore/${slug}`;
const claimId = "0123456789abcdef0123456789abcdef";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => removeGitBackedDir(root)));
});

async function git(root: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], { cwd: root })).stdout.trim();
}

async function withHost<T>(bin: string, run: () => Promise<T>): Promise<T> {
  const prior = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${prior ?? ""}`;
  try {
    return await run();
  } finally {
    if (prior === undefined) delete process.env.PATH;
    else process.env.PATH = prior;
  }
}

async function installHost(root: string, headSha: string, remote: string): Promise<string> {
  const bin = join(root, ".arc-fixture", "bin");
  await mkdir(bin, { recursive: true });
  const candidate = {
    number: pullRequest, url: `https://github.com/${repository}/pull/${pullRequest}`,
    state: "OPEN", baseRefName: "main", headRefName: branch, headRefOid: headSha,
  };
  const pull = { number: pullRequest, state: "open", merged: false, draft: false,
    head: { ref: branch, sha: headSha, repo: { full_name: repository } },
    base: { ref: "main", sha: "%s", repo: { full_name: repository } } };
  const hostReview = { data: { repository: { pullRequest: {
    reviewDecision: null, latestOpinionatedReviews: { nodes: [] },
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  } } } };
  const script = join(bin, "gh");
  await writeFile(script, [
    "#!/bin/sh",
    `base=$(git --git-dir='${remote}' rev-parse refs/heads/main)`,
    'case "$1:$2" in',
    `repo:view) printf '%s\\n' '{"nameWithOwner":"${repository}"}' ;;`,
    `pr:list) printf '%s\\n' '${JSON.stringify([candidate])}' ;;`,
    "pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `api:repos/${repository}/pulls/${pullRequest}) printf '${JSON.stringify(pull)}\\n' "$base" ;;`,
    `api:repos/${repository}/branches/main) printf '%s\\n' '{}' ;;`,
    `api:repos/${repository}) printf '%s\\n' '{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}' ;;`,
    `api:graphql) printf '%s\\n' '${JSON.stringify(hostReview)}' ;;`,
    "api:--paginate) printf '%s\\n' '[[]]' ;;",
    '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;',
    "esac", "",
  ].join("\n"));
  await chmod(script, 0o755);
  return bin;
}

async function recordHostedReview(root: string, base: string, head: string, outcome: ReviewOutcome) {
  const exec = makeGitExec(root);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const store = new LocalReviewOperationStateStore(publisher);
  const standardReview = {
    obligation: "required" as const, reasons: ["sensitive-change-set" as const],
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: "full-final" as const, count: 1 as const,
  };
  const target = { repository, pullRequest, headSha: head };
  const vehicle = { kind: "errand" as const, key: slug, claimId, branch, sources: ["codex-pr"], standardReview };
  const reviewTarget = createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set", repositoryId,
    baseRef: "main", diffBaseSha: base, diffBaseTree: await git(root, ["rev-parse", `${base}^{tree}`]),
    headSha: head, headTree: await git(root, ["rev-parse", `${head}^{tree}`]),
  });
  const requirement = createReviewRequirement({
    target: reviewTarget, projection: standardReview,
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }], initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("review requirement missing");
  const admitted = await recordHostedRequestAdmission(store, {
    repositoryId, lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: claimId, headSha: head },
    request: { schemaVersion: 1, target, provider: "codex-pr", coverage: "complete",
      vehicle: { kind: "errand", standardReview } },
    progressVehicle: vehicle, reviewTarget, requirement, actorIdentity: "github-user-1",
    authorizeCapacity: async () => undefined, now: "2026-10-01T00:00:00Z",
  });
  if (admitted.state !== "admitted") throw new Error("review admission missing");
  const handle: HostedRequestHandle = {
    schemaVersion: 1, provider: "codex-pr", requestedCoverage: "complete", effectiveCoverage: "complete",
    target, vehicle, admission: admitted.admission,
    artifact: { kind: "issue-comment", id: "review-request", url: "https://example.test/request",
      createdAt: "2026-10-01T00:00:00Z" },
  };
  await acknowledgeHostedRequest(store, { admission: admitted.admission, handle, now: "2026-10-01T00:00:01Z" });
  const reviewUrl = "https://example.test/review";
  await recordHostedAwaitAttempt(store, {
    repositoryId,
    result: outcome === "clean"
      ? { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete", reviewUrl }
      : { schemaVersion: 1, mode: "review-hosted-await", handle, state: "findings", nextAction: "triage", reviewUrl,
        findings: [{
          findingId: "finding-1", origin: "review-body", reviewId: "review-1", fingerprint: "fingerprint-1",
          settlement: "not-applicable", severity: "major", locus: "src/branch-only-surface.ts:1", url: reviewUrl,
          body: "The reviewed change needs a correction.", sourceOrdinal: 1,
        }] },
    now: "2026-10-01T00:00:02Z",
  });
}

async function recordLocalReview(root: string) {
  const output: string[] = [];
  const exits: number[] = [];
  const boundary = {
    resolveRoot: () => root, write: (text: string) => output.push(text), setExitCode: (code: number) => exits.push(code),
  };
  await handleReviewLocalPrepare("-", {
    ...boundary,
    prepare: (input) => prepareLocalReview(input, createLocalPrepareDependencies({ cwd: root, exec: makeGitExec(root) })),
    readText: async () => JSON.stringify({
      schemaVersion: 1, evaluatorIdentity: "fresh-subagent/independent-reviewer",
      routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "atomic",
        ownership: "self", surfaceAuthority: "ordinary" },
      policyJudgment: { invocation: { mode: "force", sourceId: "delegated-agent" } },
    }),
  });
  expect(exits, output.join("")).toEqual([]);
  const prepared = LocalPrepareEnvelopeSchema.parse(JSON.parse(output.join("")));
  if (prepared.state !== "ready") throw new Error("local review not ready");
  output.length = 0;
  await handleReviewLocalAttest("-", {
    ...boundary,
    attest: (input) => attestLocalReviewCommand(input, createLocalAttestDependencies({ cwd: root, exec: makeGitExec(root) })),
    readText: async () => JSON.stringify({
      schemaVersion: 1, operationId: prepared.payload.operationId,
      result: { status: "complete", result: "clean", evaluatorIdentity: "fresh-subagent/independent-reviewer",
        reviewRunId: "integration-run", applicabilityId: null, findings: [] },
    }),
  });
  expect(exits, output.join("")).toEqual([]);
  expect(LocalAttestEnvelopeSchema.parse(JSON.parse(output.join("")))).toMatchObject({ state: "attested-current" });
}

type ReviewOutcome = "clean" | "findings";

interface ReviewedErrandOptions {
  /** Further branch-side history, returning a deferred base publication when one is needed. */
  readonly arrange?: (root: string) => Promise<(() => Promise<void>) | undefined>;
  /** Files the base carries before the branch forks, keyed by repository path. */
  readonly seed?: Readonly<Record<string, string>>;
  readonly outcome?: ReviewOutcome;
  /** Configuration lines appended after the base branch setting. */
  readonly config?: string;
}

async function reviewedErrand(
  carrier: "hosted" | "local",
  kind: BaseMovementKind,
  options: ReviewedErrandOptions = {},
) {
  const root = await createTempRepoCore({ prefix: "arc-errand-currency-", identity: "andrew" });
  roots.push(root);
  const record = TransientIdentityRecordV3Schema.parse({
    version: 3, kind: "errand", slug, claimId, purpose: "errand", origin: "description", originEntry: null,
    intent: "Review one exact Errand", branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
  });
  await writeFile(join(root, slug), serializeTransientIdentityRecord(record));
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "base and identity"]);
  await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  for (const [path, content] of Object.entries(options.seed ?? {})) {
    await mkdir(join(root, dirname(path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), `branch.base: main\n${options.config ?? ""}`);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "configure base"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const remote = join(root, ".arc-fixture", "origin.git");
  await mkdir(join(root, ".arc-fixture"), { recursive: true });
  await writeFile(join(root, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  const hostUrl = `git@github.com:${repository}.git`;
  await git(root, ["remote", "add", "origin", hostUrl]);
  await git(root, ["config", `url.${remote}.insteadOf`, hostUrl]);
  await git(root, ["push", "origin", "main"]);
  await git(root, ["switch", "-c", branch]);
  const paths = movementPaths(kind, slug);
  await arrangeBranchSide({ cwd: root, paths: paths.branch });
  const publish = await options.arrange?.(root);
  const headSha = await git(root, ["rev-parse", "HEAD"]);
  await git(root, ["push", "origin", branch]);
  const bin = await installHost(root, headSha, remote);
  await withHost(bin, async () => {
    if (carrier === "hosted") await recordHostedReview(root, base, headSha, options.outcome ?? "clean");
    else await recordLocalReview(root);
  });
  const target = { repository, headRef: branch, headSha };
  const status = async (
    wrap: (exec: GitExecLike) => GitExecLike = (exec) => exec,
    current: typeof target = target,
    options: { additionalPass?: string } = {},
  ) => withHost(bin, async () => {
    const output: string[] = [];
    const exits: number[] = [];
    await handleReviewStatus({ target: JSON.stringify(current), ...options }, undefined, {
      resolveRoot: () => root,
      resolve: (_root, request) => resolveReviewStatus(request, createReviewStatusPort({ cwd: root, exec: wrap(makeGitExec(root)) })),
      write: (text) => output.push(text), setExitCode: (code) => exits.push(code),
    });
    expect(exits, output.join("")).toEqual([]);
    return ReviewStatusCommandResultSchema.parse(JSON.parse(output.join("")));
  });
  /** Merge the published base into the branch, as the approved append-only reconcile does, and publish it. */
  const reconcile = async (): Promise<typeof target> => {
    await git(root, ["fetch", "origin", "main"]);
    await git(root, ["-c", "core.hooksPath=/dev/null", "merge", "--no-edit", "refs/remotes/origin/main"]);
    const reconciled = await git(root, ["rev-parse", "HEAD"]);
    await git(root, ["push", "origin", branch]);
    await installHost(root, reconciled, remote);
    return { ...target, headSha: reconciled };
  };
  return { root, base, target, paths, status, publish, reconcile };
}

describe("Errand review currency across base movement", () => {
  it.each([
    ["hosted", "disjoint"], ["local", "disjoint"],
    ["hosted", "overlapping-regenerable-only"], ["local", "overlapping-regenerable-only"],
  ] as const)("keeps %s review settled after %s movement", async (carrier, kind) => {
    const fixture = await reviewedErrand(carrier, kind);
    const before = await fixture.status();
    expect(before, JSON.stringify(before)).toMatchObject({ routedObligation: { state: "settled" } });
    const advanced = await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    await expect(git(fixture.root, ["merge-base", "--is-ancestor", advanced.head, fixture.target.headSha])).rejects.toThrow();
    expect(await fixture.status()).toMatchObject({
      routedObligation: { state: "settled" }, currentBaseOid: advanced.head, movement: "disjoint",
    });
  });

  it.each(["hosted", "local"] as const)("keeps overlapping %s review on the review path", async (carrier) => {
    const fixture = await reviewedErrand(carrier, "overlapping-substantive");
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const status = await fixture.status();
    expect(status).toMatchObject({
      routedObligation: { state: "review-required" },
      baseMovement: { overlap: { status: "available", substantivePaths: fixture.paths.base } },
    });
  });

  it("refuses to carry review when overlap cannot be read", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint");
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    expect(await fixture.status(withUnreadableMergeBases)).toMatchObject({
      routedObligation: { state: "review-required" },
      baseMovement: { overlap: { status: "unavailable", reason: "merge-base-failed" } },
    });
  });

  it("refuses to carry review over an unrelated base", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint");
    await arrangeUnrelatedBase({ cwd: fixture.root });
    expect(await fixture.status()).toMatchObject({
      routedObligation: { state: "review-required" }, baseMovement: { overlap: { status: "unrelated" } },
    });
  });

  it("refuses to carry review over ambiguous comparison ancestry", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint", { arrange: async (root) => {
      const arranged = await arrangeAmbiguousMergeBase({ cwd: root, publishBase: "on-request" });
      return arranged.publish;
    } });
    if (fixture.publish === undefined) throw new Error("base publication missing");
    expect(await fixture.status()).toMatchObject({ routedObligation: { state: "settled" } });
    await fixture.publish();
    expect(await fixture.status()).toMatchObject({
      routedObligation: { state: "review-required" }, baseMovement: { overlap: { status: "ambiguous" } },
    });
  });

  it.each(["repository", "change-request", "base", "head", "absent"] as const)(
    "refuses noncontained-base review with %s movement binding", async (mismatch) => {
      const fixture = await reviewedErrand("hosted", "disjoint");
      const advanced = await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
      const observed = await fixture.status();
      if (!("baseMovement" in observed) || observed.baseMovement == null) throw new Error("movement missing");
      const coordinates = observed.baseMovement.coordinates;
      const movement = BaseMovementObservationSchema.parse({ ...observed.baseMovement, coordinates: {
        ...coordinates,
        ...(mismatch === "repository" ? { repository: "other/repo" } : {}),
        ...(mismatch === "change-request" ? { changeRequest: 43 } : {}),
        ...(mismatch === "base" ? { base: fixture.base } : {}),
        ...(mismatch === "head" ? { head: fixture.base } : {}),
      } });
      expect(await readErrandRoutedObligation({
        cwd: fixture.root, exec: makeGitExec(fixture.root), rawExec: createRawGitExec(fixture.root),
        target: fixture.target, pullRequest,
        currentBaseOid: advanced.head, ...(mismatch === "absent" ? {} : { baseMovement: movement }),
      })).toMatchObject({ state: "review-required" });
    },
  );
});

/** Read the claim's standard-review progress as projected onto one head. */
async function standardProgress(root: string, headSha: string) {
  const exec = makeGitExec(root);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  return readLaneProgress(new LocalReviewOperationStateStore(publisher), {
    lane: "standard", repositoryId: await resolveRepositoryIdentity(publisher), headSha,
    lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: claimId, headSha },
  });
}

/** Publish one base-side edit to an existing file through a scratch worktree, leaving the checkout untouched. */
async function advanceBaseFile(root: string, path: string, content: string): Promise<string> {
  const scratch = join(root, ".arc-fixture", "base-edit");
  await git(root, ["fetch", "origin", "main"]);
  await git(root, ["worktree", "add", "--detach", scratch, "refs/remotes/origin/main"]);
  try {
    await writeFile(join(scratch, path), content);
    await git(scratch, ["add", "--", path]);
    await git(scratch, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "edit the base side"]);
    await git(scratch, ["push", "origin", "HEAD:refs/heads/main"]);
    return await git(scratch, ["rev-parse", "HEAD"]);
  } finally {
    await git(root, ["worktree", "remove", "--force", scratch]);
  }
}

describe("Errand review carry across an approved base merge", () => {
  it.each(["hosted", "local"] as const)("carries settled %s review onto a mechanical base merge", async (carrier) => {
    const fixture = await reviewedErrand(carrier, "disjoint");
    const advanced = await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    const status = await fixture.status(undefined, reconciled);
    expect(status, JSON.stringify(status)).toMatchObject({
      routedObligation: {
        state: "settled",
        detail: expect.stringContaining(`review of ${fixture.target.headSha} carries to this head`),
      },
      currentBaseOid: advanced.head,
    });
    expect(await standardProgress(fixture.root, reconciled.headSha))
      .toMatchObject({ status: "recorded", completedPasses: 1, attempts: [] });
  });

  it("withholds the carry when an additional pass is authorized at the reconciled head", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint");
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    expect(await fixture.status(undefined, reconciled)).toMatchObject({ routedObligation: { state: "settled" } });
    const prior = await standardProgress(fixture.root, fixture.target.headSha);
    const producer = prior.status === "recorded" ? prior.attempts.at(-1)?.attemptId : undefined;
    expect(producer).toBeDefined();
    const additionalPass = JSON.stringify({
      target: { repository, pullRequest, headSha: reconciled.headSha }, lane: "standard",
      precedingProducerId: producer, completedPasses: 1, nextPass: 2,
    });
    const authorized = await fixture.status(undefined, reconciled, { additionalPass });
    expect(authorized, JSON.stringify(authorized)).toMatchObject({ routedObligation: { state: "review-required" } });
  });

  it("settles a carried head after the claim spends its pass ceiling", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint", { config: "review.standard_max_passes: 1\n" });
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    expect(await fixture.status(undefined, reconciled)).toMatchObject({ routedObligation: { state: "settled" } });
  });

  it("keeps a merge that combined edits to one reviewed file on the review path", async () => {
    const path = "lint-baseline.json";
    const lines = Array.from({ length: 12 }, (_, line) => `entry ${String(line)}`);
    const edit = (line: number, side: string) =>
      `${lines.map((entry, index) => index === line ? `${entry} removed by ${side}` : entry).join("\n")}\n`;
    const fixture = await reviewedErrand("hosted", "disjoint", {
      seed: { [path]: `${lines.join("\n")}\n` },
      arrange: async (root) => {
        await writeFile(join(root, path), edit(1, "branch"));
        await git(root, ["add", "--", path]);
        await git(root, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "remove a branch-side baseline entry"]);
        return undefined;
      },
    });
    const advanced = await advanceBaseFile(fixture.root, path, edit(10, "base"));
    const reconciled = await fixture.reconcile();
    // The merge reapplies the reviewed change exactly; only the overlapping base movement withholds the carry.
    const contribution = await projectGitReviewContributionApplicability({
      selector: {
        schemaVersion: 1, repositoryId: "repository-1", repository, pullRequest, lane: "standard",
        sourceId: "codex-pr", priorAttemptId: "attempt-1", priorHead: fixture.target.headSha,
        currentHead: reconciled.headSha, priorBase: fixture.base, currentBase: advanced,
      },
      exec: createRawGitExec(fixture.root),
      observeEndpoints: () => Promise.resolve({ head: reconciled.headSha, base: advanced }),
    });
    expect(contribution).toMatchObject({ state: "applicable" });
    expect(await fixture.status(undefined, reconciled)).toMatchObject({
      routedObligation: { state: "review-required" },
    });
  });

  it("does not carry review onto a change that moved after review", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint");
    await writeFile(join(fixture.root, fixture.paths.branch[0] ?? ""), "corrected after review\n");
    await git(fixture.root, ["add", "--", ...fixture.paths.branch]);
    await git(fixture.root, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "correct the change after review"]);
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    expect(await fixture.status(undefined, reconciled)).toMatchObject({
      routedObligation: { state: "review-required" },
    });
  });

  it("does not carry an earlier review that left findings", async () => {
    const fixture = await reviewedErrand("hosted", "disjoint", { outcome: "findings" });
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    expect(await fixture.status(undefined, reconciled)).toMatchObject({
      routedObligation: { state: "review-required" },
    });
  });

  it.each([
    ["disjoint", "settled"], ["overlapping", "review-required"],
  ] as const)("judges %s base movement since the merge against the reconciled head", async (shape, state) => {
    const fixture = await reviewedErrand("hosted", "disjoint");
    await advanceBase({ cwd: fixture.root, paths: fixture.paths.base });
    const reconciled = await fixture.reconcile();
    const later = await advanceBase({
      cwd: fixture.root, generation: 1,
      paths: shape === "disjoint" ? ["src/later-base-surface.ts"] : fixture.paths.branch,
    });
    expect(await fixture.status(undefined, reconciled)).toMatchObject({
      routedObligation: { state }, currentBaseOid: later.head,
    });
  });
});
