/** Both merge-lock composition roots bind lifecycle readiness to current stored records. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import type { Links } from "../../src/lib/store/links.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { formatErrandMergeResult } from "../../src/handlers/errand-merge.js";
import { defaultMergeLockPort, handleReviewReadiness } from "../../src/handlers/review.js";
import { MergeLockTransitionRequestSchema, releaseMergeLock } from "../../src/scripts/review-gate/merge-lock.js";
import { createIntegrationMergeDependencies } from "../../src/scripts/integration/merge-composition.js";
import { IntegrationMergeTargetSchema } from "../../src/scripts/integration/merge.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";
import { createErrandMergeDependencies } from "../../src/scripts/integration/errand-merge-composition.js";
import { ErrandMergeRequestSchema, mergeErrand } from "../../src/scripts/integration/errand-merge.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";

async function lockFixture(root: "command" | "integration", cadence: "manual" | "with-integration", project = true) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, branch = "topic/opaque";
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), `branch.base: main\nmerge.lock: draft\narchive.cadence: ${cadence}\n`);
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure readiness fixture"], { cwd });
  await exec("git", ["switch", "-c", branch], { cwd });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  const manual = cadence === "manual";
  if (project) await h.reference.seedProject(projectId);
  const content = makeMetaFixture("example", { state: manual ? "Integrating" : "Shipped", branch: null,
    currentWorkflow: manual ? "integrate-work-unit" : null });
  const record = await h.reference.seed(recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
    `${content}\n## Completion Notes\n\nThe exact implementation is ready.\n`, manual ? { kind: "active" }
      : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
  let locked = true;
  const runner: HostedProcessRunner = { run: async args => {
    if (args[0] === "repo") return { stdout: JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } }), stderr: "" };
    if (args[0] === "api") return { stdout: JSON.stringify({ number: 42, state: "open", draft: locked,
      head: { ref: branch, sha: head }, base: { repo: { full_name: "owner/repo" } } }), stderr: "" };
    if (args[0] === "pr" && args[1] === "ready") { locked = false; return { stdout: "", stderr: "" }; }
    throw new Error(`Unexpected host call: ${args.join(" ")}`);
  } };
  const invocation = { ...h.native, workItem: record.reference.owner };
  const target = IntegrationMergeTargetSchema.parse({ repository: "owner/repo", pullRequest: 42,
    baseRef: "main", headRef: branch, headSha: head });
  const request = MergeLockTransitionRequestSchema.parse({ schemaVersion: 1, treeRoot: cwd,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head },
    vehicle: { kind: "work-unit", slug: "example", archiveCadence: cadence } });
  const bindRelease = (readProjectId = h.reference.projectId) => {
    const bound = { ...invocation, projectId: readProjectId };
    const dependencies = createIntegrationMergeDependencies({ ...bound, workUnit: "example", hostedRunner: runner });
    const port = defaultMergeLockPort(cwd, exec, runner, bound);
    return async () => {
      locked = true;
      return root === "command" ? releaseMergeLock(request, port) : dependencies.releaseLock(target);
    };
  };
  return { h, cwd, branch, head, content, record, invocation, request, release: bindRelease(), bindRelease };
}

it.each([
  ["command", "manual"], ["command", "with-integration"],
  ["integration", "manual"], ["integration", "with-integration"],
] as const)("%s lock reads stored readiness under %s cadence and retries after each lifecycle repair", async (root, cadence) => {
  const { h, cwd, branch, head, content, invocation, request, release, ...fixture } = await lockFixture(root, cadence);
  let record = fixture.record;
  if (root === "command") {
    let output = "";
    await handleReviewReadiness("request.json", { resolveRoot: () => cwd,
      readText: async () => JSON.stringify({ ...request, pullRequest: {
        repository: "owner/repo", number: 42, state: "open", headBranch: branch, headSha: head,
      } }), write: text => { output += text; }, setExitCode: () => undefined }, undefined, invocation);
    expect(JSON.parse(output)).toMatchObject({ state: "ready" });
  }
  expect(await release()).toMatchObject({ state: "released" });
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(record, { content }), provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
  expect(await release()).toMatchObject({ state: "blocked", payload: { reason: "readiness-failed" },
    diagnostics: expect.arrayContaining([expect.objectContaining({ code: "missing-completion-notes" })]) });
  record = lifecycleSuccess(await h.reference.store.read({ reference: record.reference }));
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(record, {
    content: `${content}\n## Completion Notes\n\nThe repaired notes are ready.\n`,
  }), provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
  expect(await release()).toMatchObject({ state: "released" });
  const repaired = lifecycleSuccess(await h.reference.store.read({ reference: record.reference }));
  const refuseUntilRestored = async (code: string, broken: { content?: string; links?: Links }) => {
    const current = lifecycleSuccess(await h.reference.store.read({ reference: record.reference }));
    lifecycleSuccess(await h.reference.store.write({ ...recordPut(current, broken), provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
    expect(await release()).toMatchObject({ state: "blocked", payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code })]) });
    const restored = lifecycleSuccess(await h.reference.store.read({ reference: record.reference }));
    lifecycleSuccess(await h.reference.store.write({ ...recordPut(restored, { content: repaired.content, links: repaired.links }),
      provenance: { verb: "integrate", lifecycleAction: "integrate" } }));
    expect(await release()).toMatchObject({ state: "released" });
  };
  await refuseUntilRestored("wrong-cadence", { content: `${makeMetaFixture("example", cadence === "manual"
    ?{ state: "Active", branch: null, currentWorkflow: "process-task-loop" }
    : { state: "Integrating", branch: null, currentWorkflow: "integrate-work-unit" })}\n## Completion Notes\n\nThe repaired notes are ready.\n` });
  await refuseUntilRestored("vehicle-branch-mismatch", { links: { ...repaired.links,
    branches: [{ repository: projectId, ref: "topic/other", linkedAs: "adopted", excluded: [] }] } });
  if (cadence === "with-integration") await refuseUntilRestored("pr-url-mismatch", { links: { ...repaired.links,
    changeRequest: { repository: projectId, number: 99 } } });
}, 60_000);

it.each(["command", "integration"] as const)("%s lock releases its bound Shipped work unit after an Active unit takes its slug",
  async root => {
    const { h, record, release } = await lockFixture(root, "with-integration");
    expect(await release()).toMatchObject({ state: "released", diagnostics: [] });

    const slug = record.reference.owner.name;
    const active = await h.reference.seedMeta(slug);
    const holder = lifecycleSuccess(await h.reference.store.lookup({ kind: "slug", slug }));
    expect(holder.reference).toEqual(active.reference);
    expect(holder.reference).not.toEqual(record.reference);
    expect(lifecycleSuccess(await h.reference.store.read({ reference: record.reference }))).toEqual(record);

    expect(await release()).toMatchObject({ state: "released", diagnostics: [] });
  }, 30_000);

it.each(["command", "integration"] as const)("%s lock retains the invocation's missing project ID and a fresh invocation sees the repair",
  async root => {
    const { h, release, bindRelease } = await lockFixture(root, "manual", false);
    const list = vi.spyOn(h.reference.store, "list");
    await expect(h.reference.projectId()).rejects.toThrow("Project identity record is missing.");
    expect(await release()).toMatchObject({ state: "blocked", payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "project-identity-unavailable",
        message: expect.stringContaining("Restore the project's unique, valid identity record") })]) });
    await h.reference.seedProject(projectId);
    const retained = await release();
    const registryReads = list.mock.calls.filter(([input]) => input.kind === "project-registry/identity").length;
    expect(await bindRelease(createProjectIdentityReader(h.reference.store))()).toMatchObject({ state: "released" });
    expect(retained).toMatchObject({ state: "blocked", diagnostics: expect.arrayContaining([
      expect.objectContaining({ code: "project-identity-unavailable" }),
    ]) });
    expect(registryReads, "project identity observations in the original invocation").toBe(1);
  }, 30_000);

async function errandLockFixture(root: "command" | "integration", linked: string, draft = true) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native, slug = "fix-thing", branch = "chore/fix-thing-0a1b2c3d";
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nmerge.lock: draft\n");
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure readiness fixture"], { cwd });
  await exec("git", ["switch", "-c", branch], { cwd });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  await h.reference.seedProject(projectId);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug, claimId: "1".repeat(32),
    intent: "Fix the thing", owner: "test-user", origin: "description", originEntry: null, branch, state: "open", savedHead: null,
    changeRequest: null, createdAt: "2026-11-13T12:00:00Z", updatedAt: "2026-11-13T12:00:00Z" });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  const primary = await h.reference.seedErrand(record, { branches: [{ repository: projectId, ref: linked, linkedAs: "created", excluded: [] }] });
  const runner: HostedProcessRunner = { run: async args => {
    if (args[0] === "repo") return { stdout: JSON.stringify({ nameWithOwner: "owner/repo", defaultBranchRef: { name: "main" } }), stderr: "" };
    if (args[0] === "api") return { stdout: JSON.stringify({ number: 42, state: "open", draft,
      head: { ref: branch, sha: head }, base: { repo: { full_name: "owner/repo" } } }), stderr: "" };
    if (args[0] === "pr" && args[1] === "ready") {
      draft = args.includes("--undo");
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected host call: ${args.join(" ")}`);
  } };
  const target = IntegrationMergeTargetSchema.parse({ repository: "owner/repo", pullRequest: 42, baseRef: "main",
    headRef: branch, headSha: head });
  const request = MergeLockTransitionRequestSchema.parse({ schemaVersion: 1, treeRoot: cwd,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head }, vehicle: { kind: "errand", slug } });
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: record.createdAt,
    createdFor: { kind: "errand", slug: record.slug, claimId: record.claimId }, provisioning: "ready" });
  const store = h.reference.store;
  const dependencies = createErrandMergeDependencies({ cwd, exec, identity: "test-user", slug, hostedRunner: runner, store });
  return { cwd, record, primary, store, target, dependencies,
    release: () => root === "command" ? releaseMergeLock(request, defaultMergeLockPort(cwd, exec, runner, h.native))
      : dependencies.readCurrentIdentity().then(identity => dependencies.releaseLock(target, identity)) };
}

it.each(["command", "integration"] as const)("%s lock releases a suffixed Errand whose head branch is its record's branch link",
  async root => {
    expect(await (await errandLockFixture(root, "chore/fix-thing-0a1b2c3d")).release()).toMatchObject({ state: "released" });
  }, 30_000);

it.each(["command", "integration"] as const)("%s lock refuses an Errand whose head branch differs from its record's branch link",
  async root => {
    expect(await (await errandLockFixture(root, "chore/fix-thing-ffffffff")).release()).toMatchObject({ state: "blocked",
      payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([expect.objectContaining({ code: "errand-branch-mismatch" })]) });
  }, 30_000);

type ErrandLockFixture = Awaited<ReturnType<typeof errandLockFixture>>;

async function errandMergeAttempt({ target, dependencies }: ErrandLockFixture) {
  const request = ErrandMergeRequestSchema.parse({ schemaVersion: 1, identity: await dependencies.readCurrentIdentity(),
    approvedTarget: target, lane: "reviewed", mergeMethod: { method: "merge", policyFingerprint: `sha256:${"d".repeat(64)}` } });
  const holdLock = vi.fn(dependencies.holdLock);
  const mergePinned = vi.fn<typeof dependencies.mergePinned>().mockResolvedValue({ state: "merged", target, providerMergeId: "merge-42" });
  const base = "b".repeat(40);
  const merge = (releaseLock = dependencies.releaseLock) => mergeErrand(request, {
    ...dependencies, holdLock, mergePinned,
    releaseLock,
    readMerged: async () => ({ merged: false, providerMergeId: null }),
    refreshTarget: async () => target,
    observeChecks: async () => ({ schemaVersion: 1, mode: "review-checks-observe", state: "not-required", nextAction: "complete",
      repository: target.repository, pullRequest: target.pullRequest, headSha: target.headSha, checks: [] }),
    resolveMergeMethod: async repository => ({ schemaVersion: 1, mode: "review-merge-method-resolve", state: "validated", nextAction: "use-method",
      repository, stackPosition: "non-delivery", ...request.mergeMethod, allowedMethods: ["merge"] }),
    readFinalPlan: async () => ({ status: "available", target, baseOid: base, plan: { state: "proceed" },
      observation: { movement: "disjoint", integrationEvidenceComplete: true, feasibility: { state: "clean", base, head: target.headSha },
        admission: { state: "mergeable", repository: target.repository, changeRequest: target.pullRequest,
          baseRef: target.baseRef, base, head: target.headSha } },
      reviewApplicability: { verdict: "carries", residual: null, reason: "base-movement-disjoint", judgmentRequired: false } }),
  });
  return { request, merge, holdLock, mergePinned };
}

it("reports the stored branch mismatch at Errand merge and accepts the same request after relinking", async () => {
  const fixture = await errandLockFixture("integration", "chore/fix-thing-ffffffff");
  const { record, primary, store, target } = fixture;
  const { request, merge, holdLock, mergePinned } = await errandMergeAttempt(fixture);
  const refused = await merge();
  expect(holdLock).toHaveBeenCalledExactlyOnceWith(target);
  expect(mergePinned).not.toHaveBeenCalled();
  lifecycleSuccess(await store.write({ ...recordPut(primary, { links: { ...primary.links,
    branches: [{ repository: projectId, ref: target.headRef, linkedAs: "created", excluded: [] }] } }),
    provenance: { verb: "relink", lifecycleAction: "integrate" } }));
  expect(await merge()).toMatchObject({ state: "merged" });
  expect(mergePinned).toHaveBeenCalledExactlyOnceWith(target, "merge");

  const formatted = formatErrandMergeResult(refused, false);
  expect(formatted.text).toContain(`errand-branch-mismatch: pullRequest.headBranch:`);
  expect(formatted.text).toContain(target.headRef);
  expect(formatted.text).toContain("Correct the Errand's project branch link");
  expect(refused).toMatchObject({ state: "operation-failed", nextAction: "retry",
    diagnostics: expect.arrayContaining([expect.objectContaining({ code: "errand-branch-mismatch",
      message: expect.stringContaining(target.headRef) })]),
    continuation: { kind: "remedy", remedy: {
      text: expect.stringMatching(/correct.*branch link/iu), argv: ["arc", "errand", "merge", record.slug, "-", "--json"], stdin: request,
    } },
  });
}, 30_000);

async function capturePrimaryConflict({ store, primary, record }: ErrandLockFixture) {
  const { reference, content, version, formatVersion, placement, links } = lifecycleSuccess(await store.read({ reference: primary.reference }));
  const conflict = recordReferences["work-item/conflict-record"](reference.owner, "subject-conflict");
  const time = record.createdAt;
  lifecycleSuccess(await store.write({ action: "put", reference: conflict, expected: null,
    content: JSON.stringify({ record: reference, location: { kind: "record" }, base: null,
      current: { value: { reference, content, version, formatVersion, placement, links }, label: { actor: "alice", time } },
      incoming: { value: null, label: { actor: "bob", time } } }),
    provenance: { verb: "merge", lifecycleAction: "capture" } }));
}

it("re-holds the approved target and retries the same Errand merge after a late primary conflict is resolved", async () => {
  const fixture = await errandLockFixture("integration", "chore/fix-thing-0a1b2c3d", false);
  const { primary: { reference, links }, store, target, dependencies } = fixture;
  const { request, merge, holdLock, mergePinned } = await errandMergeAttempt(fixture);
  const releaseLock = vi.fn(dependencies.releaseLock).mockImplementationOnce(async (exactTarget, identity) => {
    await capturePrimaryConflict(fixture);
    return dependencies.releaseLock(exactTarget, identity);
  });

  const refused = await merge(releaseLock);
  expect(releaseLock).toHaveBeenCalledExactlyOnceWith(target, request.identity);
  expect(holdLock).toHaveBeenCalledExactlyOnceWith(target);
  expect(await holdLock.mock.results[0]?.value).toMatchObject({ state: "held", payload: { headSha: target.headSha } });
  expect(mergePinned).not.toHaveBeenCalled();
  const conflicted = lifecycleSuccess(await store.read({ reference }));
  const conflict = recordReferences["work-item/conflict-record"](reference.owner, "subject-conflict");
  expect(conflicted.conflicts).toEqual([conflict]);
  lifecycleSuccess(await store.write({ ...recordPut(conflicted, { links }), resolves: [conflict],
    provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await merge()).toMatchObject({ state: "merged" });
  expect(mergePinned).toHaveBeenCalledExactlyOnceWith(target, "merge");

  expect(refused).toMatchObject({ state: "operation-failed", reason: "lock-operation-failed", nextAction: "retry",
    continuation: { kind: "remedy", remedy: { argv: ["arc", "errand", "merge", fixture.record.slug, "-", "--json"], stdin: request } },
  });
  expect(formatErrandMergeResult(refused, false).text).toContain(JSON.stringify(conflict));
  expect(formatErrandMergeResult(refused, false).text).toContain("Resolve the named conflict records");
}, 30_000);

it("re-holds an Errand merge for a late ownerless conflict and requires fresh approval", async () => {
  const fixture = await errandLockFixture("integration", "chore/fix-thing-0a1b2c3d", false);
  const { primary, record, store, target, dependencies } = fixture;
  const { request, merge, holdLock, mergePinned } = await errandMergeAttempt(fixture);
  const releaseLock = vi.fn(dependencies.releaseLock).mockImplementationOnce(async (exactTarget, identity) => {
    lifecycleSuccess(await store.write({ ...recordPut(primary, { content: JSON.stringify({ ...record, owner: undefined }) }),
      provenance: { verb: "seed", lifecycleAction: "update" } }));
    await capturePrimaryConflict(fixture);
    return dependencies.releaseLock(exactTarget, identity);
  });

  const refused = await merge(releaseLock);
  expect(releaseLock).toHaveBeenCalledExactlyOnceWith(target, request.identity);
  expect(holdLock).toHaveBeenCalledExactlyOnceWith(target);
  expect(await holdLock.mock.results[0]?.value).toMatchObject({ state: "held", payload: { headSha: target.headSha } });
  expect(mergePinned).not.toHaveBeenCalled();
  const conflict = recordReferences["work-item/conflict-record"](primary.reference.owner, "subject-conflict");
  const formatted = formatErrandMergeResult(refused, false);
  expect(formatted.text).toContain(JSON.stringify(conflict));
  expect(formatted.text).toMatch(/no owner.*restore.*owner/iu);
  expect(refused).toMatchObject({ state: "operation-failed", reason: "lock-operation-failed", nextAction: "stop",
    continuation: { kind: "terminal-explanation", terminalExplanation: expect.stringMatching(/fresh approval/iu) } });
}, 30_000);
