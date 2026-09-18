/** Built-CLI coverage for the delivery authoring command group. */

import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCandidateAttestation, type CandidateManagedRecordV1 } from
  "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import { writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { createGitExec } from "../../src/lib/io-context.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../src/lib/delivery/public-review-continuation.js";
import {
  createStandardReviewReservation,
  IntegrationBoundaryLocusSchema,
  projectCorrectiveDeliveryStatusBoundary,
  projectPublicationBoundary,
} from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";
import {
  ROLLING_FIELD_RUN,
  SEVEN_MEMBER_FIELD_RUN,
  adjacentFieldSeams,
  type DeliveryFieldRun,
} from "../fixtures/delivery-field-runs.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliverySingleMemberStackPlanFixture,
} from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";

const DIGEST = `sha256:${"1".repeat(64)}`;
const SUBPROCESS_HEAVY_TIMEOUT = 60_000;

describe("arc delivery", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "delivery-test"], repository);
    expect(init.exitCode).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it("registers compose and plan abandon from the built entry point", async () => {
    const entryHelp = await runArc(["delivery", "entry", "inspect", "--help"], repository);
    expect(entryHelp).toMatchObject({ exitCode: 0 });
    expect(entryHelp.stdout).toContain("Strict JSON request path, or - for standard input");
    await writeFile(join(repository, "invalid-entry.json"), "{}\n");
    const invalidEntry = await runArc([
      "delivery", "entry", "inspect", "invalid-entry.json", "--json",
    ], repository);
    expect(invalidEntry.exitCode).toBe(1);
    expect(JSON.parse(invalidEntry.stdout)).toMatchObject({
      command: "delivery entry inspect",
      status: "refused",
      reason: "invalid-command-input",
    });
    await expect(runArc(["delivery", "plan", "from-tasks", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0, stdout: expect.stringContaining("--task-list <path>") });
    const branchHelp = await runArc(["delivery", "plan", "from-branch", "--help"], repository);
    expect(branchHelp).toMatchObject({ exitCode: 0 });
    expect(branchHelp.stdout).toContain("--base <commit-ish>");
    const composeHelp = await runArc(["delivery", "compose", "--help"], repository);
    expect(composeHelp).toMatchObject({ exitCode: 0 });
    expect(composeHelp.stdout).toContain("--landed-prefix <json>");
    const malformedPrefix = await runArc([
      "delivery", "compose", "--landed-prefix", "not-json", "--json",
    ], repository);
    expect(malformedPrefix.exitCode).toBe(1);
    expect(JSON.parse(malformedPrefix.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "invalid-command-input",
    });
    await expect(runArc(["delivery", "plan", "abandon", "--help"], repository))
      .resolves.toMatchObject({ exitCode: 0 });
    for (const command of [
      ["eligibility", "prepare"], ["eligibility", "close"], ["publish"],
      ["position"], ["land", "prepare"], ["land", "apply"], ["reconcile"], ["rewrite"], ["rematerialize"],
      ["teardown"], ["top-remedy"], ["closeout"],
    ]) {
      const help = await runArc(["delivery", ...command, "--help"], repository);
      expect(help.exitCode, help.stderr).toBe(0);
      expect(help.stdout).toContain("<input>");
    }
    await writeFile(join(repository, "invalid-execution.json"), "{}\n");
    const invalidExecution = await runArc([
      "delivery", "position", "invalid-execution.json", "--json",
    ], repository);
    expect(invalidExecution.exitCode).toBe(1);
    expect(JSON.parse(invalidExecution.stdout)).toMatchObject({
      command: "delivery position",
      status: "refused",
      reason: "invalid-command-input",
    });
    const inventorySchema = await runArc([
      "delivery", "plan", "inventory", "schema", "--json",
    ], repository);
    expect(inventorySchema.exitCode, inventorySchema.stderr).toBe(0);
    expect(JSON.parse(inventorySchema.stdout)).toMatchObject({
      command: "delivery plan inventory schema",
      status: "ok",
      value: {
        id: "delivery-design-inventory-input",
        version: 1,
        schema: {
          $id: "delivery-design-inventory-input.schema.json",
          additionalProperties: false,
          required: ["artifacts"],
        },
      },
    });
  });

  it("reaps refs and retires records through the destructive closeout verb", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const closeoutWorkUnitId = "renamed-delivery-plan-record";
    const transitions = join(repository, ".arc", "system", ".internal", "transitions");
    await mkdir(transitions, { recursive: true });
    await writeFile(join(transitions, `${plan.workUnitId}.json`), `${JSON.stringify({
      schemaVersion: 1,
      origin: plan.workUnitId,
      kind: "rename",
      successors: [closeoutWorkUnitId],
      edges: [],
    })}\n`);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "record closeout rename"]);
    const head = await git(repository, ["rev-parse", "HEAD"]);
    const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    const initial = deliveryStateFixture(plan);
    const state = {
      ...initial,
      target: { ref: "refs/heads/main", coordinates: { head, tree } },
      members: initial.members.map((member, index) => ({
        ...member,
        ref: index === initial.members.length - 1
          ? "refs/heads/main"
          : `refs/heads/delivery/${plan.workUnitId}/${plan.members[index]!.chunkKey}`,
        changeRequest: index === initial.members.length - 1
          ? { providerId: "github", changeRequestId: "401" }
          : null,
        coordinates: { base: head, head, tree },
      })),
    };
    const nonterminalRefs = state.members.slice(0, -1).map((member) => member.ref);
    for (const ref of nonterminalRefs) await git(repository, ["update-ref", ref, head]);
    const staleRefreshCandidate =
      `refs/arc/delivery-refresh-candidates/${plan.planId}/retired-member`;
    await git(repository, ["update-ref", staleRefreshCandidate, head]);
    const origin = join(repository, "origin.git");
    await git(repository, ["init", "--bare", origin]);
    await git(repository, ["remote", "add", "origin", origin]);
    await git(repository, ["push", "origin", ...nonterminalRefs.map((ref) => `${head}:${ref}`)]);

    const common = await gitCommonDir(repository);
    const planPath = join(common, "arc", "delivery", "plans", `${plan.planId}.json`);
    const statePath = join(common, "arc", "delivery", "state", `${plan.planId}.json`);
    await mkdir(resolve(planPath, ".."), { recursive: true });
    await mkdir(resolve(statePath, ".."), { recursive: true });
    await writeFile(planPath, `${JSON.stringify(plan)}\n`);
    await writeFile(statePath, `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision: 7,
      value: state,
    })}\n`);
    await writeFile(join(repository, "delivery-closeout.json"), `${JSON.stringify({
      workUnitId: closeoutWorkUnitId,
      repository: "owner/repo",
      remote: "origin",
    })}\n`);

    const fakeBin = join(repository, "fake-closeout-bin");
    const fakeGh = join(fakeBin, "gh");
    await mkdir(fakeBin);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "case \"$2\" in",
      "  repos/owner/repo/pulls/401)",
      `    printf '%s\\n' '${JSON.stringify({
        number: 401,
        state: "closed",
        merged: true,
        draft: false,
        head: { ref: "main", sha: head, repo: { full_name: "owner/repo" } },
        base: { ref: "main", repo: { full_name: "owner/repo" } },
        merge_commit_sha: head,
      })}'`,
      "    ;;",
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };

    const closed = await runArc([
      "delivery", "closeout", "delivery-closeout.json", "--json",
    ], repository, { env });
    expect(closed.exitCode, closed.stderr).toBe(0);
    expect(JSON.parse(closed.stdout)).toMatchObject({
      command: "delivery closeout",
      status: "closed-out",
      workUnitId: closeoutWorkUnitId,
      planIds: [plan.planId],
    });
    await expect(readFile(planPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(statePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    for (const ref of nonterminalRefs) {
      await expect(git(repository, ["rev-parse", "--verify", ref])).rejects.toBeDefined();
      expect(await git(repository, ["ls-remote", "--refs", "origin", ref])).toBe("");
    }
    await expect(git(repository, ["rev-parse", "--verify", staleRefreshCandidate])).rejects.toBeDefined();
    expect(await git(repository, ["rev-parse", "--verify", "refs/heads/main"])).toBe(head);

    const replay = await runArc([
      "delivery", "closeout", "delivery-closeout.json", "--json",
    ], repository, { env });
    expect(replay.exitCode, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout)).toMatchObject({ status: "closed-out", planIds: [] });
  });

  it("refuses incomplete lifecycle paths before returning a gate-bearing snapshot", async () => {
    const plan = deliverySingleMemberStackPlanFixture();
    const branch = await git(repository, ["branch", "--show-current"]);
    const metaPath = `.arc/active/meta-${plan.workUnitId}.md`;
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, metaPath), [
      `# Metadata: ${plan.workUnitId}`,
      "",
      "- **State:** Active",
      `- **Branch:** ${branch}`,
      "",
    ].join("\n"));
    await git(repository, ["add", metaPath]);
    await git(repository, ["commit", "-m", "add delivery work unit"]);

    const ref = `refs/heads/${branch}`;
    const canonicalPaths = [
      metaPath,
      ".arc/backlog/ROADMAP.md",
      `.arc/system/.internal/candidates/${plan.workUnitId}.boundary.json`,
      `.arc/system/.internal/candidates/${plan.workUnitId}.json`,
    ].sort();
    const request = {
      plan,
      protectedBaseRef: ref,
      topRef: ref,
      candidates: [{ deliverableId: plan.members[0]!.deliverableId, ref }],
      lifecyclePaths: canonicalPaths.filter((path) => path !== ".arc/backlog/ROADMAP.md"),
    };

    const incomplete = await runArcWithStdin([
      "delivery", "eligibility", "prepare", "-", "--json",
    ], repository, `${JSON.stringify(request)}\n`);
    expect(incomplete.exitCode, incomplete.stderr).toBe(1);
    expect(JSON.parse(incomplete.stdout)).toMatchObject({
      command: "delivery eligibility prepare",
      status: "refused",
      reason: "lifecycle-paths-moved",
    });

    const canonical = await runArcWithStdin([
      "delivery", "eligibility", "prepare", "-", "--json",
    ], repository, `${JSON.stringify({ ...request, lifecyclePaths: canonicalPaths })}\n`);
    expect(canonical.exitCode, canonical.stderr).toBe(0);
    expect(JSON.parse(canonical.stdout)).toMatchObject({
      command: "delivery eligibility prepare",
      status: "prepared",
      snapshot: { lifecyclePaths: canonicalPaths },
    });
  });

  it.skipIf(process.platform === "win32")(
    "closes eligibility from read-only delivery state without acquiring a publication lock",
    async () => {
      const plan = deliveryFourMemberStackPlanFixture();
      const branch = await git(repository, ["branch", "--show-current"]);
      const head = await git(repository, ["rev-parse", "HEAD"]);
      const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
      const topRef = "refs/heads/delivery-control";
      const candidateRef = "refs/heads/delivery-candidate";
      await git(repository, ["update-ref", topRef, head]);
      await git(repository, ["update-ref", candidateRef, head]);
      const metaPath = `.arc/active/meta-${plan.workUnitId}.md`;
      await mkdir(join(repository, ".arc", "active"), { recursive: true });
      await writeFile(join(repository, metaPath), [
        `# Metadata: ${plan.workUnitId}`,
        "",
        "- **State:** Integrating",
        "- **Owner:** test-user",
        `- **Branch:** ${branch}`,
        "- **Candidate:** [none]",
        "- **Current Workflow:** `integrate-work-unit`",
        "- **Last Completed:** [none]",
        "- **Next Task:** [none]",
        "- **Next Action:** Close delivery eligibility",
        "",
      ].join("\n"));
      const lifecyclePaths = [
        metaPath,
        ".arc/backlog/ROADMAP.md",
        `.arc/system/.internal/candidates/${plan.workUnitId}.boundary.json`,
        `.arc/system/.internal/candidates/${plan.workUnitId}.json`,
      ];

      const deliveryRoot = join(repository, ".git", "arc", "delivery");
      const planDirectory = join(deliveryRoot, "plans");
      const stateDirectory = join(deliveryRoot, "state");
      await mkdir(planDirectory, { recursive: true });
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(join(planDirectory, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`);
      await writeFile(join(repository, "eligibility-close.json"), `${JSON.stringify({
        snapshot: {
          planId: plan.planId,
          workUnitId: plan.workUnitId,
          planRevision: plan.planRevision,
          planDigest: plan.planDigest,
          protectedBase: { ref: `refs/heads/${branch}`, head, tree },
          chainBase: { head, tree },
          predecessorRelation: { kind: "exact", observedTip: head, chainBase: head },
          top: { ref: topRef, head, tree },
          members: [{
            deliverableId: plan.members[0]!.deliverableId,
            ref: candidateRef,
            head,
            tree,
          }],
          lifecyclePaths,
          regenerablePaths: [".arc/backlog/ROADMAP.md"],
        },
        gateResults: [{ deliverableId: plan.members[0]!.deliverableId, head, tree, status: "passed" }],
      })}\n`);

      await chmod(stateDirectory, 0o500);
      try {
        const result = await runArc([
          "delivery", "eligibility", "close", "eligibility-close.json", "--json",
        ], repository);
        expect(result.exitCode, result.stderr || result.stdout).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          command: "delivery eligibility close",
          status: "eligible",
        });
        expect(await readdir(stateDirectory)).toEqual([]);
      } finally {
        await chmod(stateDirectory, 0o700);
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "refuses corrupt read-only delivery state with typed unavailable evidence",
    async () => {
      const plan = deliveryFourMemberStackPlanFixture();
      const branch = await git(repository, ["branch", "--show-current"]);
      const head = await git(repository, ["rev-parse", "HEAD"]);
      const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
      const topRef = "refs/heads/delivery-control";
      const candidateRef = "refs/heads/delivery-candidate";
      await git(repository, ["update-ref", topRef, head]);
      await git(repository, ["update-ref", candidateRef, head]);

      const deliveryRoot = join(repository, ".git", "arc", "delivery");
      const planDirectory = join(deliveryRoot, "plans");
      const stateDirectory = join(deliveryRoot, "state");
      await mkdir(planDirectory, { recursive: true });
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(join(planDirectory, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`);
      await writeFile(join(stateDirectory, "INVALID.json"), "{}\n");
      await writeFile(join(repository, "eligibility-close.json"), `${JSON.stringify({
        snapshot: {
          planId: plan.planId,
          workUnitId: plan.workUnitId,
          planRevision: plan.planRevision,
          planDigest: plan.planDigest,
          protectedBase: { ref: `refs/heads/${branch}`, head, tree },
          chainBase: { head, tree },
          predecessorRelation: { kind: "exact", observedTip: head, chainBase: head },
          top: { ref: topRef, head, tree },
          members: [{
            deliverableId: plan.members[0]!.deliverableId,
            ref: candidateRef,
            head,
            tree,
          }],
          lifecyclePaths: [`.arc/active/meta-${plan.workUnitId}.md`],
          regenerablePaths: [],
        },
        gateResults: [{ deliverableId: plan.members[0]!.deliverableId, head, tree, status: "passed" }],
      })}\n`);

      await chmod(stateDirectory, 0o500);
      try {
        const result = await runArc([
          "delivery", "eligibility", "close", "eligibility-close.json", "--json",
        ], repository);
        expect(result.exitCode, result.stderr).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({
          command: "delivery eligibility close",
          status: "refused",
          reason: "evidence-unavailable",
        });
        expect(await readdir(stateDirectory)).not.toContain(".write.lock");
      } finally {
        await chmod(stateDirectory, 0o700);
      }
    },
  );

  it("parses every documented delivery invocation through the built CLI", async () => {
    const workflows = await Promise.all([
      readFile(resolve(import.meta.dirname, "../../arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(
        import.meta.dirname,
        "../../arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ), "utf8"),
    ]);
    const invocationsByWorkflow = workflows.map(
      (workflow) => workflow.match(/^arc delivery .+ --json$/gmu) ?? [],
    );
    expect(invocationsByWorkflow[0]?.length).toBeGreaterThan(0);
    expect(invocationsByWorkflow[1]).toEqual(["arc delivery closeout - --json"]);
    const invocations = invocationsByWorkflow.flat();
    for (const invocation of invocations) {
      const args = invocation.split(" ").slice(1);
      expect(invocation).not.toContain("--input");
      expect(args).toContain("-");
      const result = await runArcWithStdin(args, repository, "{}\n");
      expect(result.stderr).not.toMatch(/unknown option|missing required argument/iu);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "refused",
        reason: "invalid-command-input",
      });
    }
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("selects exact native arms and degrades through the built CLI", async () => {
    const plan = deliveryFourMemberStackPlanFixture();
    const initial = deliveryStateFixture(plan);
    const baseHead = await git(repository, ["rev-parse", "HEAD"]);
    const baseTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    const topBranch = `feat/${plan.workUnitId}`;
    await git(repository, ["checkout", "-b", topBranch]);
    let predecessor = baseHead;
    const boundMembers: (typeof initial.members)[number][] = [];
    for (const [index, member] of plan.members.entries()) {
      await writeFile(join(repository, `member-${index + 1}.txt`), `${member.title}\n`);
      await git(repository, ["add", `member-${index + 1}.txt`]);
      await git(repository, ["commit", "-m", `member ${index + 1}`]);
      const head = await git(repository, ["rev-parse", "HEAD"]);
      const tree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
      const headRef = index === plan.members.length - 1
        ? topBranch
        : `delivery/${plan.workUnitId}/${member.chunkKey}`;
      if (index < plan.members.length - 1) await git(repository, ["branch", headRef, head]);
      boundMembers.push({
        ...initial.members[index]!,
        ref: `refs/heads/${headRef}`,
        changeRequest: { providerId: "github" as const, changeRequestId: String(41 + index) },
        coordinates: { base: predecessor, head, tree },
      });
      predecessor = head;
    }
    const state = {
      ...initial,
      target: { ref: "refs/heads/main", coordinates: { head: baseHead, tree: baseTree } },
      members: boundMembers,
    };
    const nativeMembers = state.members.slice(0, -1).map((member, index) => ({
      deliverableId: member.deliverableId,
      changeRequestId: member.changeRequest!.changeRequestId,
      headRef: member.ref!.replace(/^refs\/heads\//u, ""),
      headSha: member.coordinates!.head,
      baseRef: index === 0 ? "main" : state.members[index - 1]!.ref!.replace(/^refs\/heads\//u, ""),
      headRepository: "owner/repo",
    }));
    const highestNativeMember = state.members.at(-2)!;
    const landedTargetHead = await git(repository, [
      "commit-tree", highestNativeMember.coordinates!.tree,
      "-p", baseHead,
      "-p", highestNativeMember.coordinates!.head,
      "-m", "native stack merge",
    ]);
    const landedTargetTree = state.members.at(-2)!.coordinates!.tree;
    await git(repository, ["update-ref", "refs/heads/native-landing-result", landedTargetHead]);
    await git(repository, ["remote", "add", "origin", "https://github.com/owner/repo.git"]);
    await git(repository, ["config", `url.file://${repository}/.insteadOf`, "https://github.com/owner/repo.git"]);
    await git(repository, ["fetch", "origin", "main"]);
    const common = await gitCommonDir(repository);
    const plans = join(common, "arc", "delivery", "plans");
    const states = join(common, "arc", "delivery", "state");
    await Promise.all([mkdir(plans, { recursive: true }), mkdir(states, { recursive: true })]);
    await Promise.all([
      writeFile(join(plans, `${plan.planId}.json`), `${JSON.stringify(plan)}\n`),
      writeFile(join(states, `${plan.planId}.json`), `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-state-store/v1",
        planId: plan.planId,
        revision: 1,
        value: state,
      })}\n`),
    ]);
    const stackResponse = JSON.stringify([{
      number: 7,
      base: { ref: nativeMembers[0]!.baseRef },
      pull_requests: nativeMembers.map((member) => ({
        number: Number(member.changeRequestId),
        head: { ref: member.headRef, sha: member.headSha },
        base: { ref: member.baseRef },
      })),
    }]);
    const flattenedStackResponse = JSON.stringify([{
      number: 7,
      base: { ref: nativeMembers[0]!.baseRef },
      pull_requests: nativeMembers.map((member) => ({
        number: Number(member.changeRequestId),
        head: { ref: member.headRef, sha: member.headSha },
        base: { ref: "main" },
      })),
    }]);
    const requestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: member.baseRef, repo: { full_name: "owner/repo" } },
    }));
    const landedRequestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "closed",
      merged: true,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: member.baseRef, repo: { full_name: "owner/repo" } },
      merge_commit_sha: landedTargetHead,
    }));
    const divergentLandedRequestResponses = nativeMembers.map((member, index) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "closed",
      merged: true,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: member.baseRef, repo: { full_name: "owner/repo" } },
      merge_commit_sha: index === 0 ? member.headSha : landedTargetHead,
    }));
    const settledRequestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "closed",
      merged: true,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: member.baseRef, repo: { full_name: "owner/repo" } },
      merge_commit_sha: landedTargetHead,
    }));
    const terminal = state.members.at(-1)!;
    const terminalRequestResponse = JSON.stringify({
      number: Number(terminal.changeRequest!.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: {
        ref: terminal.ref!.replace(/^refs\/heads\//u, ""),
        sha: terminal.coordinates!.head,
        repo: { full_name: "owner/repo" },
      },
      base: {
        ref: nativeMembers.at(-1)!.headRef,
        repo: { full_name: "owner/repo" },
      },
    });
    const settledTerminalRequestResponse = JSON.stringify({
      number: Number(terminal.changeRequest!.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: {
        ref: terminal.ref!.replace(/^refs\/heads\//u, ""),
        sha: terminal.coordinates!.head,
        repo: { full_name: "owner/repo" },
      },
      base: { ref: "main", repo: { full_name: "owner/repo" } },
    });
    const listResponses = nativeMembers.map((member) => JSON.stringify([{
      number: Number(member.changeRequestId),
      url: `https://github.com/owner/repo/pull/${member.changeRequestId}`,
      state: "OPEN",
      baseRefName: member.baseRef,
      headRefName: member.headRef,
      headRefOid: member.headSha,
    }]));
    const flattenedRequestResponses = nativeMembers.map((member) => JSON.stringify({
      number: Number(member.changeRequestId),
      state: "open",
      merged: false,
      draft: false,
      head: { ref: member.headRef, sha: member.headSha, repo: { full_name: "owner/repo" } },
      base: { ref: "main", repo: { full_name: "owner/repo" } },
    }));
    const mergeResponse = JSON.stringify({
      status: "pending",
      details: {
        uuid: "native-effect-1",
        expected_head_sha: nativeMembers.at(-1)!.headSha,
        merge_method: "merge",
        merge_action: "direct_merge",
      },
    });
    const fakeBin = join(repository, "fake-bin");
    const fakeGh = join(fakeBin, "gh");
    const counter = join(repository, "fake-gh-counter");
    await mkdir(fakeBin);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "if [ \"${ARC_FAKE_FAIL_HOST_ACCESS:-0}\" = \"1\" ]; then echo 'unexpected host access' >&2; exit 97; fi",
      "if [ \"${ARC_FAKE_GH_MODE:-registered}\" = \"degrade\" ]; then",
      "  case \"$*\" in *unstack*) printf '{}\\n'; exit 0;; esac",
      "  if [ ! -f \"$ARC_FAKE_GH_COUNTER\" ]; then",
      "    : > \"$ARC_FAKE_GH_COUNTER\"",
      `    printf '%s\\n' '${stackResponse}'`,
      "  else",
      "    printf '[]\\n'",
      "  fi",
      "  exit 0",
      "fi",
      "case \"$*\" in",
      "  *\"pr checks \"*) printf '[]\\n'; exit 0 ;;",
      "  *\"rules/branches/\"*) printf '[[]]\\n'; exit 0 ;;",
      ...nativeMembers.map((member, index) => (
        `  *"pr list "*"--head ${member.headRef}"*) printf '%s\\n' '${listResponses[index]}'; exit 0 ;;`
      )),
      "esac",
      "case \"$2\" in",
      "  view)",
      "    printf '%s\\n' '{\"nameWithOwner\":\"owner/repo\",\"defaultBranchRef\":{\"name\":\"main\"}}'",
      "    ;;",
      "  repos/owner/repo)",
      "    printf '%s\\n' '{\"allow_merge_commit\":true,\"allow_rebase_merge\":true,\"allow_squash_merge\":true}'",
      "    ;;",
      "  repos/owner/repo/branches/*)",
      "    printf '%s\\n' '{\"protection\":null}'",
      "    ;;",
      "  repos/owner/repo/git/ref/heads/main)",
      `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "settled" ]; then printf '%s\\n' '{"object":{"sha":"${landedTargetHead}"}}'; else printf '%s\\n' '{"object":{"sha":"${baseHead}"}}'; fi`,
      "    ;;",
      `  repos/owner/repo/git/commits/${baseHead})`,
      `    printf '%s\\n' '{"tree":{"sha":"${baseTree}"}}'`,
      "    ;;",
      `  repos/owner/repo/git/commits/${landedTargetHead})`,
      `    printf '%s\\n' '{"tree":{"sha":"${landedTargetTree}"}}'`,
      "    ;;",
      "  repos/owner/repo/stacks)",
      "    if [ \"${ARC_FAKE_GH_MODE:-registered}\" = \"unsupported\" ]; then echo 'HTTP 404' >&2; exit 1; fi",
      `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "flattened" ]; then printf '%s\\n' '${flattenedStackResponse}'; else printf '%s\\n' '${stackResponse}'; fi`,
      "    ;;",
      ...nativeMembers.flatMap((member, index) => [
        `  repos/owner/repo/pulls/${member.changeRequestId})`,
        `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "flattened" ]; then printf '%s\\n' '${flattenedRequestResponses[index]}'; elif [ "\${ARC_FAKE_GH_MODE:-registered}" = "landed" ]; then printf '%s\\n' '${landedRequestResponses[index]}'; elif [ "\${ARC_FAKE_GH_MODE:-registered}" = "divergent-landed" ]; then printf '%s\\n' '${divergentLandedRequestResponses[index]}'; elif [ "\${ARC_FAKE_GH_MODE:-registered}" = "settled" ]; then printf '%s\\n' '${settledRequestResponses[index]}'; else printf '%s\\n' '${requestResponses[index]}'; fi`,
        "    ;;",
      ]),
      `  repos/owner/repo/pulls/${terminal.changeRequest!.changeRequestId})`,
      `    if [ "\${ARC_FAKE_GH_MODE:-registered}" = "settled" ]; then printf '%s\\n' '${settledTerminalRequestResponse}'; elif [ -n "\${ARC_FAKE_TERMINAL_HEAD:-}" ]; then printf '%s\\n' '${terminalRequestResponse}' | sed "s/${terminal.coordinates!.head}/$ARC_FAKE_TERMINAL_HEAD/"; else printf '%s\\n' '${terminalRequestResponse}'; fi`,
      "    ;;",
      `  repos/owner/repo/pulls/${nativeMembers.at(-1)!.changeRequestId}/merge-async)`,
      `    printf '%s\\n' '${mergeResponse}'`,
      "    ;;",
      `  repos/owner/repo/pulls/${nativeMembers.at(-1)!.changeRequestId}/merge-async/native-effect-1)`,
      `    printf '%s\\n' '{"status":"merged"}'`,
      "    ;;",
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    const env = { PATH: `${fakeBin}:${process.env.PATH ?? ""}` };
    const request = {
      planId: plan.planId,
      repository: "owner/repo",
      remote: "origin",
      mergeAction: "direct",
      explicitAtomic: false,
    };

    const nativeRefreshDefault = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        trigger: { kind: "operator-choice" },
        remote: "origin",
      })}\n`,
      { env },
    );
    expect(nativeRefreshDefault.exitCode, `${nativeRefreshDefault.stderr}\n${nativeRefreshDefault.stdout}`).toBe(0);
    expect(JSON.parse(nativeRefreshDefault.stdout)).toMatchObject({
      status: "refresh-required",
      mechanics: "provider-invoked",
      plannedSuffix: nativeMembers.map(({ deliverableId }) => deliverableId),
    });

    const externalFallback = await runArcWithStdin(
      ["delivery", "refresh", "plan", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: plan.planId,
        repository: "owner/repo",
        trigger: { kind: "operator-choice" },
        mechanics: "operator-initiated",
        remote: "origin",
      })}\n`,
      { env },
    );
    expect(externalFallback.exitCode, `${externalFallback.stderr}\n${externalFallback.stdout}`).toBe(0);
    expect(JSON.parse(externalFallback.stdout)).toMatchObject({
      status: "refresh-required",
      mechanics: "operator-initiated",
      plannedSuffix: nativeMembers.map(({ deliverableId }) => deliverableId),
    });

    const singleton = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify(request)}\n`,
      { env },
    );
    expect(singleton.exitCode, `${singleton.stderr}\n${singleton.stdout}`).toBe(0);
    expect(JSON.parse(singleton.stdout)).toMatchObject({
      status: "selected",
      arm: "linked-single",
      members: nativeMembers.slice(0, 1).map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const atomic = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify({ ...request, explicitAtomic: true })}\n`,
      { env },
    );
    expect(atomic.exitCode, atomic.stderr).toBe(0);
    const atomicResult = JSON.parse(atomic.stdout) as {
      status: "selected";
      arm: "linked-atomic";
      members: { deliverableId: string; changeRequestId: string; headSha: string }[];
      recommendedActionText: string;
    };
    expect(atomicResult).toMatchObject({
      status: "selected",
      arm: "linked-atomic",
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const unsupported = await runArcWithStdin(
      ["delivery", "native", "land-select", "-", "--json"],
      repository,
      `${JSON.stringify({ ...request, explicitAtomic: true })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "unsupported" } },
    );
    expect(unsupported.exitCode, unsupported.stderr).toBe(1);
    expect(JSON.parse(unsupported.stdout)).toMatchObject({ status: "blocked", reason: "unsupported" });

    const unreviewedSequential = await runArcWithStdin(
      ["delivery", "land", "prepare", "-", "--json"],
      repository,
      `${JSON.stringify({
        planId: plan.planId,
        selectedDeliverableId: nativeMembers[0]!.deliverableId,
        repository: "owner/repo",
        remote: "origin",
        baseRef: "refs/heads/main",
        targetRef: "refs/heads/main",
        releaseMergeLock: false,
        treeRoot: repository,
      })}\n`,
      { env },
    );
    expect(unreviewedSequential.exitCode, unreviewedSequential.stderr).toBe(1);
    expect(JSON.parse(unreviewedSequential.stdout)).toMatchObject({ status: "refused" });

    const operationId = "native-operation-1";
    const prepareRequest = {
      planId: plan.planId,
      operationId,
      selection: {
        status: atomicResult.status,
        arm: atomicResult.arm,
        members: atomicResult.members,
        recommendedActionText: atomicResult.recommendedActionText,
      },
      repository: "owner/repo",
      remote: "origin",
      baseRef: "main",
      targetRef: "refs/heads/main",
      treeRoot: repository,
    };
    const flattenedPrepare = await runArcWithStdin(
      ["delivery", "native", "land-prepare", "-", "--json"],
      repository,
      `${JSON.stringify(prepareRequest)}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "flattened" } },
    );
    expect(flattenedPrepare.exitCode, flattenedPrepare.stderr).toBe(1);
    expect(JSON.parse(flattenedPrepare.stdout)).toMatchObject({
      status: "blocked",
      reason: "member-not-ready",
      unreadyMembers: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const unreviewed = await runArcWithStdin(
      ["delivery", "native", "land-prepare", "-", "--json"],
      repository,
      `${JSON.stringify(prepareRequest)}\n`,
      { env },
    );
    expect(unreviewed.exitCode, unreviewed.stderr).toBe(1);
    expect(JSON.parse(unreviewed.stdout)).toMatchObject({
      status: "blocked",
      reason: "member-not-ready",
      unreadyMembers: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });

    const top = state.members.at(-1)!;
    const exec = createGitExec();
    const candidateTarget = await collectGitCandidateTarget({
      cwd: repository,
      name: plan.workUnitId,
      baseBranch: "main",
      baseRevision: baseHead,
      revision: top.coordinates!.head,
      exec,
    });
    const candidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: plan.workUnitId,
        subject: candidateTarget.subject,
        baseRevision: baseHead,
        attestedBy: "test-user",
        attestedAt: "2026-08-24T12:00:00.000Z",
        verificationEvidenceRef: "verification://native-landing-e2e",
      }),
      subject: candidateTarget.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(repository, plan.workUnitId, candidate, null);
    const reservation = createStandardReviewReservation({
      candidateId: candidate.attestation.candidateId,
      sourceId: "coderabbit-pr",
      target: {
        kind: "delivery",
        repository: "owner/repo",
        workUnitId: plan.workUnitId,
        planId: plan.planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"e".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });
    const sourceBoundary = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: topBranch,
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      reservation,
      changeRequest: { repository: "owner/repo", pullRequest: 44 },
    });
    const continuation = projectDeliveryPublicReviewContinuation({
      plan,
      state,
      stateRevision: 1,
    });
    if (continuation.status !== "projected") throw new Error("delivery continuation must project");
    const correctiveBoundary = projectCorrectiveDeliveryStatusBoundary({
      workUnit: plan.workUnitId,
      candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest,
      supersedesCandidateId: null,
      sourceBoundary,
      deliveryContinuation: continuation.continuation,
    });
    await writeSubmissionBoundary(repository, IntegrationBoundaryLocusSchema.parse({
      ...correctiveBoundary,
      deliveryReviewTermini: state.members.map((member) => ({
        vehicle: {
          kind: "delivery-member",
          planId: plan.planId,
          deliverableId: member.deliverableId,
          workUnitId: plan.workUnitId,
          head: member.coordinates!.head,
        },
        terminus: {
          schemaVersion: 1,
          semanticsVersion: "review-terminus/v1",
          kind: "owner-accepted",
          lane: "standard",
          acceptedBy: "test-user",
          completedPasses: 0,
        },
      })),
    }), null);

    const prepared = await runArcWithStdin(
      ["delivery", "native", "land-prepare", "-", "--json"],
      repository,
      `${JSON.stringify(prepareRequest)}\n`,
      { env },
    );
    expect(prepared.exitCode, `${prepared.stderr}\n${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout)).toMatchObject({
      status: "prepared",
      operationId,
      members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
        deliverableId, changeRequestId, headSha,
      })),
    });
    const ordinaryPreparedStatus = await runArc(
      [
        "review", "status",
        "--target", JSON.stringify({
          repository: "owner/repo",
          headRef: state.members[0]!.ref!.replace(/^refs\/heads\//u, ""),
          headSha: nativeMembers[0]!.headSha,
        }),
        "--json",
      ],
      repository,
      { env },
    );
    expect(ordinaryPreparedStatus.exitCode, ordinaryPreparedStatus.stderr).toBe(0);
    expect(JSON.parse(ordinaryPreparedStatus.stdout)).toMatchObject({
      state: "blocked",
      routedObligation: {
        state: "blocked",
        detail: "The public delivery continuation is not current.",
      },
    });

    const preparedStatePath = join(states, `${plan.planId}.json`);
    const preparedState = await readFile(preparedStatePath, "utf8");
    const recovered = await runArcWithStdin(
      ["delivery", "reconcile", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: plan.planId, repository: "owner/repo", remote: "origin" })}\n`,
      { env: { ...env, ARC_FAKE_FAIL_HOST_ACCESS: "1" } },
    );
    expect(recovered.exitCode, `${recovered.stderr}\n${recovered.stdout}`).toBe(0);
    const recoveredResult = JSON.parse(recovered.stdout) as {
      status: string;
      submitAction: { input: Record<string, unknown> };
    };
    const expectedSubmitRequest = {
      planId: plan.planId,
      operationId,
      request: {
        repository: "owner/repo",
        topChangeRequestId: nativeMembers.at(-1)!.changeRequestId,
        topHeadSha: nativeMembers.at(-1)!.headSha,
        mergeAction: "direct_merge",
        mergeMethod: "merge",
      },
      treeRoot: repository,
      remote: "origin",
    };
    expect(recoveredResult).toEqual({
      schemaVersion: 1,
      command: "delivery reconcile",
      status: "prepared",
      transition: "preserved",
      action: "delivery-native-land-submit",
      presentation: {
        operationId,
        members: nativeMembers.map(({ deliverableId, changeRequestId, headSha }) => ({
          deliverableId, changeRequestId, headSha,
        })),
        consequence:
          "Atomically land the displayed complete non-terminal remainder. A residual race remains between final "
          + "observation and the host prefix snapshot.",
      },
      submitAction: {
        command: "arc delivery native land-submit - --json",
        input: expectedSubmitRequest,
      },
      recommendedActionText:
        "Present the preserved native landing consequence and exact member heads, then obtain integration approval "
        + "before invoking the submit action unchanged.",
    });
    expect(await readFile(preparedStatePath, "utf8")).toBe(preparedState);
    const submitRequest = recoveredResult.submitAction.input;
    const flattenedSubmit = await runArcWithStdin(
      ["delivery", "native", "land-submit", "-", "--json"],
      repository,
      `${JSON.stringify(submitRequest)}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "flattened" } },
    );
    expect(flattenedSubmit.exitCode, flattenedSubmit.stderr).toBe(1);
    expect(JSON.parse(flattenedSubmit.stdout)).toMatchObject({
      status: "blocked",
      reason: "native-stack-moved",
    });

    await writeFile(join(repository, "terminal-residual.txt"), "post-prepare correction\n");
    await git(repository, ["add", "terminal-residual.txt"]);
    await git(repository, ["commit", "-m", "post-prepare correction"]);
    const terminalCorrectionHead = await git(repository, ["rev-parse", "HEAD"]);

    const submitted = await runArcWithStdin(
      ["delivery", "native", "land-submit", "-", "--json"],
      repository,
      `${JSON.stringify(submitRequest)}\n`,
      { env: { ...env, ARC_FAKE_TERMINAL_HEAD: terminalCorrectionHead } },
    );
    expect(submitted.exitCode, submitted.stderr).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      status: "pending",
      effectIdentity: "native-effect-1",
    });
    await git(repository, ["reset", "--hard", top.coordinates!.head]);

    const divergentLanding = await runArcWithStdin(
      ["delivery", "native", "land-status", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: plan.planId, request: expectedSubmitRequest.request, remote: "origin" })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "divergent-landed" } },
    );
    expect(divergentLanding.exitCode, divergentLanding.stderr).toBe(1);
    expect(JSON.parse(divergentLanding.stdout)).toMatchObject({
      status: "blocked",
      reason: "ambiguous-result",
    });

    await git(repository, ["update-ref", "refs/heads/main", landedTargetHead]);
    const landed = await runArcWithStdin(
      ["delivery", "native", "land-status", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: plan.planId, request: expectedSubmitRequest.request, remote: "origin" })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "landed" } },
    );
    expect(landed.exitCode, `${landed.stderr}\n${landed.stdout}`).toBe(0);
    expect(JSON.parse(landed.stdout)).toMatchObject({
      status: "applied",
      state: { value: { target: { coordinates: { head: landedTargetHead } }, activeOperation: null } },
    });

    const positionInput = { planId: plan.planId, repository: "owner/repo", remote: "origin" };
    const terminalPosition = await runArcWithStdin(
      ["delivery", "position", "-", "--json"],
      repository,
      `${JSON.stringify(positionInput)}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "settled" } },
    );
    expect(terminalPosition.exitCode, `${terminalPosition.stderr}\n${terminalPosition.stdout}`).toBe(0);
    const terminalPositionResult = JSON.parse(terminalPosition.stdout) as {
      status: string;
      selectedDeliverableId: string;
    };
    expect(terminalPositionResult).toMatchObject({
      status: "position",
      nextAction: "teardown-member",
      selectedDeliverableId: state.members.at(-2)!.deliverableId,
    });

    const terminalHandoff = await runArcWithStdin(
      ["delivery", "teardown", "-", "--json"],
      repository,
      `${JSON.stringify({
        ...positionInput,
        deliverableId: terminalPositionResult.selectedDeliverableId,
        protectedTargetRef: "refs/heads/main",
      })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "settled" } },
    );
    expect(terminalHandoff.exitCode, `${terminalHandoff.stderr}\n${terminalHandoff.stdout}`).toBe(0);
    expect(JSON.parse(terminalHandoff.stdout)).toMatchObject({
      status: "torn-down",
      nextAction: "terminal-checkpoint",
      top: { status: "ready" },
    });

    const degraded = await runArcWithStdin(
      ["delivery", "native", "unlink", "-", "--json"],
      repository,
      `${JSON.stringify({ planId: plan.planId, repository: "owner/repo", members: nativeMembers })}\n`,
      { env: { ...env, ARC_FAKE_GH_MODE: "degrade", ARC_FAKE_GH_COUNTER: counter } },
    );
    expect(degraded.exitCode, degraded.stderr).toBe(0);
    expect(JSON.parse(degraded.stdout)).toMatchObject({ status: "unlinked" });
  }, SUBPROCESS_HEAVY_TIMEOUT);

  it("validates design input before writing task-derived authoring state", async () => {
    await installTaskFixture(repository);
    const missing = await runArc(["delivery", "plan", "from-tasks", "--json"], repository);
    expect(missing.exitCode).toBe(1);

    await writeFile(join(repository, "design-inventory.json"), "{ invalid json\n");
    const invalid = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(invalid.exitCode).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      command: "delivery plan from-tasks",
      status: "refused",
      reason: "invalid-design-inventory",
    });
    const common = await gitCommonDir(repository);
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("inspects reviewed provisional entry without creating delivery records", async () => {
    await installTaskFixture(repository);
    await writeFile(join(repository, "delivery-entry.json"), `${JSON.stringify({
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "confirmed-reviewed",
    })}\n`);
    const common = await gitCommonDir(repository);
    const deliveryNamespace = join(common, "arc", "delivery");
    await expect(readdir(deliveryNamespace)).rejects.toMatchObject({ code: "ENOENT" });

    const inspected = await runArc([
      "delivery", "entry", "inspect", "delivery-entry.json", "--json",
    ], repository);
    expect(inspected.exitCode, inspected.stderr).toBe(0);
    expect(JSON.parse(inspected.stdout)).toMatchObject({
      command: "delivery entry inspect",
      status: "canonicalize-provisional",
      nextAction: "canonicalize-provisional",
      authoringMapId: null,
      laterEntryCostText: expect.stringContaining("later entry"),
    });
    await expect(readdir(deliveryNamespace)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts a coherent explicit task list before the meta pointer exists and refuses invalid loci", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const metaPath = join(repository, ".arc", "active", "meta-demo.md");
    const meta = await readFile(metaPath, "utf8");
    await writeFile(metaPath, meta.replace("`tasks-demo.md`", "[none]"));

    for (const candidate of [
      resolve(repository, ".arc/active/tasks-demo.md"),
      "../tasks-demo.md",
      ".arc/active/tasks-other.md",
    ]) {
      const refused = await runArc([
        "delivery", "plan", "from-tasks",
        "--task-list", candidate,
        "--design-inventory", "design-inventory.json",
        "--json",
      ], repository);
      expect(refused.exitCode).toBe(1);
      expect(JSON.parse(refused.stdout)).toMatchObject({
        command: "delivery plan from-tasks",
        status: "refused",
        reason: "task-list-path-invalid",
      });
    }
    const common = await gitCommonDir(repository);
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });

    const taskPath = join(repository, ".arc", "active", "tasks-demo.md");
    const taskList = await readFile(taskPath, "utf8");
    await writeFile(taskPath, taskList.replace("`spec-demo.md`", "`spec-other.md`"));
    const incoherent = await runArc([
      "delivery", "plan", "from-tasks",
      "--task-list", ".arc/active/tasks-demo.md",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(incoherent.exitCode).toBe(1);
    expect(JSON.parse(incoherent.stdout)).toMatchObject({
      status: "refused",
      reason: "task-list-design-incoherent",
    });
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(taskPath, taskList);
    const authored = await runArc([
      "delivery", "plan", "from-tasks",
      "--task-list", ".arc/active/tasks-demo.md",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(authored.exitCode, authored.stderr).toBe(0);
    expect(JSON.parse(authored.stdout)).toMatchObject({
      status: "ok",
      value: { taskListPath: ".arc/active/tasks-demo.md" },
    });
  });

  it("refuses a metadata-selected task list from another design", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const taskPath = join(repository, ".arc", "active", "tasks-demo.md");
    const taskList = await readFile(taskPath, "utf8");
    await writeFile(taskPath, taskList.replace("`spec-demo.md`", "`spec-other.md`"));

    const incoherent = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);

    expect(incoherent.exitCode).toBe(1);
    expect(JSON.parse(incoherent.stdout)).toMatchObject({
      status: "refused",
      reason: "task-list-design-incoherent",
    });
    const common = await gitCommonDir(repository);
    await expect(readdir(join(common, "arc", "delivery", "authoring")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("authors a branch-derived map from default and explicit coordinates", async () => {
    await installTaskFixture(repository);
    const missingDesign = await runArc([
      "delivery", "plan", "from-branch", "--json",
    ], repository);
    expect(missingDesign.exitCode).toBe(1);
    expect(JSON.parse(missingDesign.stdout)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
    await writeDesignInventory(repository);
    const base = await git(repository, ["rev-parse", "HEAD"]);
    await git(repository, ["checkout", "-b", "feature"]);
    await writeFile(join(repository, "contribution.txt"), "branch contribution\n");
    await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
      "# Metadata: demo",
      "",
      "- **State:** Active",
      "- **Branch:** feat/demo",
      "- **Task List:** `tasks-demo.md`",
      "- **Next Action:** Author delivery boundaries",
      "",
    ].join("\n"));
    await git(repository, ["add", "--", "contribution.txt", ".arc/active/meta-demo.md"]);
    await git(repository, ["commit", "-m", [
      "branch contribution",
      "",
      "Context: tasks-demo.md (Tasks 1.1, 9.9.a)",
    ].join("\n")]);
    const head = await git(repository, ["rev-parse", "HEAD"]);

    const author = await runArc([
      "delivery", "plan", "from-branch",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);
    expect(JSON.parse(author.stdout)).toMatchObject({
      command: "delivery plan from-branch",
      status: "ok",
      value: { base, head },
    });
    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    const snapshotPath = join(authoring, mapName.replace(/\.md$/u, ".json"));
    const recoverySnapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as {
      candidatePlanDigest: string | null;
      candidateProjectionDigest: string | null;
      candidateOutcome: { outcome: "accepted"; stateBinding: null } | null;
    };
    const map = await readFile(join(authoring, mapName), "utf8");
    expect(map).toContain('"entry": "from-branch"');
    expect(map).toContain('"classification": "contribution"');
    expect(map).toContain('"lifecycleArtifactTouches"');
    expect(map).toContain('".arc/active/meta-demo.md"');
    expect(map).toContain('"boundary": null');
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "stack-to-main" },
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "branch", sourceIds: [head] }],
      },
      members: [{
        chunkKey: "branch",
        title: "Branch contribution",
        contract: "Publish the inspected branch contribution",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });
    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode, compose.stdout + compose.stderr).toBe(0);
    const composition = JSON.parse(compose.stdout) as {
      value: { advisories: unknown[] };
    };
    expect(composition).toMatchObject({
      status: "ok",
      value: {
        advisories: [
          { kind: "unresolved-task-reference", commit: head, taskId: "9.9.a" },
        ],
      },
    });
    const plans = join(common, "arc", "delivery", "plans");
    const planName = (await readdir(plans))[0];
    expect(planName).toBeDefined();
    if (planName === undefined) return;
    const initialPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planDigest: string;
      planRevision: number;
    };
    await writeFile(snapshotPath, `${JSON.stringify({
      ...recoverySnapshot,
      candidatePlanDigest: initialPlan.planDigest,
      candidateProjectionDigest: DIGEST,
      candidateOutcome: { outcome: "accepted", stateBinding: null },
    })}\n`);
    const recovered = await runArc(["delivery", "compose", "--json"], repository);
    expect(recovered.exitCode, recovered.stdout + recovered.stderr).toBe(0);
    const recovery = JSON.parse(recovered.stdout) as {
      value: { advisories: unknown[] };
    };
    expect(recovery).toMatchObject({
      status: "ok",
      value: {
        planDigest: initialPlan.planDigest,
        recoveredCleanup: true,
        advisories: [
          { kind: "unresolved-task-reference", commit: head, taskId: "9.9.a" },
        ],
      },
    });
    expect(recovery.value.advisories).toEqual(composition.value.advisories);

    const explicit = await runArc([
      "delivery", "plan", "from-branch",
      "--design-inventory", "design-inventory.json",
      "--base", base,
      "--head", head,
      "--json",
    ], repository);
    expect(explicit.exitCode, explicit.stdout + explicit.stderr).toBe(0);
    expect(JSON.parse(explicit.stdout)).toMatchObject({
      status: "ok",
      value: { base, head },
    });
    const successorMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(successorMap).toBeDefined();
    if (successorMap === undefined) return;
    const successorSnapshot = JSON.parse(
      await readFile(join(authoring, successorMap.replace(/\.md$/u, ".json")), "utf8"),
    ) as { planId: string; expectedCurrentPlanDigest: string | null };
    expect(successorSnapshot).toMatchObject({
      planId: initialPlan.planId,
      expectedCurrentPlanDigest: initialPlan.planDigest,
    });
    await fillSlots(join(authoring, successorMap), {
      projection: { kind: "stack-to-main" },
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "branch", sourceIds: [head] }],
      },
      members: [{
        chunkKey: "branch",
        title: "Branch contribution",
        contract: "Publish the inspected branch contribution",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });
    const revise = await runArc(["delivery", "compose", "--json"], repository);
    expect(revise.exitCode, revise.stdout + revise.stderr).toBe(0);
    const revisedPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planRevision: number;
    };
    expect(revisedPlan).toMatchObject({
      planId: initialPlan.planId,
      planRevision: initialPlan.planRevision + 1,
    });
  });

  it.each([SEVEN_MEMBER_FIELD_RUN, ROLLING_FIELD_RUN])(
    "refuses the recorded $workUnitId plan without closing task evidence",
    async (run) => {
      await installTaskFixture(repository);
      await writeDesignInventory(repository);
      await git(repository, ["checkout", "-b", "field-reconstruction"]);
      const contributionIds: string[] = [];
      for (const [index, member] of run.members.entries()) {
        if (run.workUnitId === SEVEN_MEMBER_FIELD_RUN.workUnitId
          && index === run.members.length - 1) {
          await git(repository, ["checkout", "main"]);
          await writeFile(join(repository, "ambient-base-advance.txt"), "base advance\n");
          await git(repository, ["add", "--", "ambient-base-advance.txt"]);
          await git(repository, ["commit", "-m", "advance reconstructed base"]);
          await git(repository, ["checkout", "field-reconstruction"]);
          await git(repository, ["merge", "--no-ff", "main", "-m", "absorb reconstructed base"]);
        }
        const evidencePath = `field-${String(index + 1).padStart(2, "0")}-${member.chunkKey}.txt`;
        await writeFile(join(repository, evidencePath), [
          `pull request: ${member.pullRequest}`,
          `merge: ${member.mergeCommit}`,
          `base: ${member.base}`,
          `head: ${member.head}`,
          "",
        ].join("\n"));
        await git(repository, ["add", "--", evidencePath]);
        await git(repository, ["commit", "-m", `reconstruct ${member.chunkKey}`]);
        contributionIds.push(await git(repository, ["rev-parse", "HEAD"]));
      }

      const author = await runArc([
        "delivery", "plan", "from-branch",
        "--design-inventory", "design-inventory.json",
        "--base", "main",
        "--head", "HEAD",
        "--json",
      ], repository);
      expect(author.exitCode, author.stdout + author.stderr).toBe(0);
      const common = await gitCommonDir(repository);
      const authoring = join(common, "arc", "delivery", "authoring");
      const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
      expect(mapName).toBeDefined();
      if (mapName === undefined) return;
      const mapPath = join(authoring, mapName);
      const map = await readFile(mapPath, "utf8");
      if (run.workUnitId === SEVEN_MEMBER_FIELD_RUN.workUnitId) {
        expect(map).toContain('"classification": "ambient-base-absorb"');
      }
      await fillSlots(mapPath, fieldSlots(run, contributionIds));
      const filledMap = await readFile(mapPath, "utf8");
      const authorSlots = filledMap.slice(
        filledMap.indexOf("<!-- arc:delivery-authoring-slots:start -->"),
        filledMap.indexOf("<!-- arc:delivery-authoring-slots:end -->"),
      );
      expect(authorSlots).not.toMatch(/"status"\s*:/u);
      const compose = await runArc(["delivery", "compose", "--json"], repository);
      expect(compose.exitCode).toBe(1);
      expect(JSON.parse(compose.stdout)).toMatchObject({
        status: "refused",
        reason: "coverage-refused",
        issues: [
          {
            kind: "member-task-order",
            memberIndices: run.members.map((_, index) => index),
          },
          { kind: "member-verification-task-unbound", taskIds: ["1.1"] },
        ],
      });
    },
  );

  it("authors, fills, composes, publishes, and renders a task-derived plan", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);
    expect(JSON.parse(author.stdout)).toMatchObject({
      command: "delivery plan from-tasks",
      status: "ok",
    });

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "stack-to-main" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode, compose.stdout + compose.stderr).toBe(0);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "ok",
      value: { planDigest: expect.stringMatching(/^sha256:/u) },
    });
    expect(await readdir(join(common, "arc", "delivery", "plans")))
      .toHaveLength(1);
    await expect(readdir(authoring)).resolves.toEqual([]);
    const tasks = await readFile(join(repository, ".arc", "active", "tasks-demo.md"), "utf8");
    expect(tasks).toContain("<!-- arc:delivery-plan:start -->");
    expect(tasks).toMatch(/\| 1\s+\| Implementation\s+\| `implementation`\s+\|/u);
    expect(tasks).toMatch(/\| 1\s+\| `1\.1`\s+\| `detailed:deliverable-contract`\s+\|/u);
    const renderedPlan = tasks.slice(
      tasks.indexOf("<!-- arc:delivery-plan:start -->"),
      tasks.indexOf("<!-- arc:delivery-plan:end -->") + "<!-- arc:delivery-plan:end -->".length,
    );
    expect(renderedPlan).not.toContain("Status");

    const plans = join(common, "arc", "delivery", "plans");
    const planName = (await readdir(plans))[0];
    expect(planName).toBeDefined();
    if (planName === undefined) return;
    const initialPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planDigest: string;
      planRevision: number;
    };
    const successor = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(successor.exitCode, successor.stdout + successor.stderr).toBe(0);
    const successorMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(successorMap).toBeDefined();
    if (successorMap === undefined) return;
    const successorSnapshot = JSON.parse(
      await readFile(join(authoring, successorMap.replace(/\.md$/u, ".json")), "utf8"),
    ) as { planId: string; expectedCurrentPlanDigest: string | null };
    expect(successorSnapshot).toMatchObject({
      planId: initialPlan.planId,
      expectedCurrentPlanDigest: initialPlan.planDigest,
    });
    await fillSlots(join(authoring, successorMap), {
      projection: { kind: "stack-to-main" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });
    const revise = await runArc(["delivery", "compose", "--json"], repository);
    expect(revise.exitCode, revise.stdout + revise.stderr).toBe(0);
    const revisedPlan = JSON.parse(await readFile(join(plans, planName), "utf8")) as {
      planId: string;
      planRevision: number;
    };
    expect(revisedPlan).toMatchObject({
      planId: initialPlan.planId,
      planRevision: initialPlan.planRevision + 1,
    });
  });

  it("refuses composition when the task inventory changed after authoring", async () => {
    await installTaskFixture(repository);
    await writeDesignInventory(repository);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "stack-to-main" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });
    const authoringFiles = (await readdir(authoring)).sort();
    const taskListPath = join(repository, ".arc", "active", "tasks-demo.md");
    const changedTasks = (await readFile(taskListPath, "utf8"))
      .replace("Implement the delivery contract.", "Implement the revised delivery contract.");
    await writeFile(taskListPath, changedTasks);

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "task-inventory-drift",
    });
    await expect(readdir(authoring)).resolves.toEqual(authoringFiles);
    await expect(readdir(join(common, "arc", "delivery", "plans"))).resolves.toEqual([]);
    expect(await readFile(taskListPath, "utf8")).toBe(changedTasks);
    expect(changedTasks).not.toContain("<!-- arc:delivery-plan:start -->");
  });

  it("refuses phase-aligned composition when task phase membership changed", async () => {
    await installTaskFixture(repository, true);
    await writeDesignInventory(repository);
    const taskListPath = join(repository, ".arc", "active", "tasks-demo.md");
    const onePhaseTasks = await readFile(taskListPath, "utf8");
    const phaseHeading = [
      "## **Phase beta:** Companion",
      "",
    ].join("\n");
    const twoPhaseTasks = onePhaseTasks.replace(
      "### `[ ]` **1.2 Implement the companion** — validate criteria at member scope",
      `${phaseHeading}### \`[ ]\` **1.2 Implement the companion** — validate criteria at member scope`,
    );
    await writeFile(taskListPath, twoPhaseTasks);
    const author = await runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect(author.exitCode, author.stdout + author.stderr).toBe(0);

    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const mapName = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(mapName).toBeDefined();
    if (mapName === undefined) return;
    await fillSlots(join(authoring, mapName), {
      projection: { kind: "stack-to-main" },
      boundary: { kind: "phase-aligned" },
      members: [{
        chunkKey: "implementation",
        title: "Implementation",
        contract: "Publish the implementation contract",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }, {
        chunkKey: "companion",
        title: "Companion",
        contract: "Publish the companion contract",
        designElementIds: [],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    });
    const authoringFiles = (await readdir(authoring)).sort();
    await writeFile(taskListPath, onePhaseTasks);

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      command: "delivery compose",
      status: "refused",
      reason: "task-phase-drift",
    });
    await expect(readdir(authoring)).resolves.toEqual(authoringFiles);
    await expect(readdir(join(common, "arc", "delivery", "plans"))).resolves.toEqual([]);
    expect(await readFile(taskListPath, "utf8")).toBe(onePhaseTasks);
    expect(onePhaseTasks).not.toContain("<!-- arc:delivery-plan:start -->");
  });

  it("refuses uncovered implementation and verification membership at composition", async () => {
    await installTaskFixture(repository, true);
    await writeDesignInventory(repository);
    const author = async () => runArc([
      "delivery", "plan", "from-tasks",
      "--design-inventory", "design-inventory.json",
      "--json",
    ], repository);
    expect((await author()).exitCode).toBe(0);
    const common = await gitCommonDir(repository);
    const authoring = join(common, "arc", "delivery", "authoring");
    const firstMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(firstMap).toBeDefined();
    if (firstMap === undefined) return;
    const baseSlots = {
      projection: { kind: "stack-to-main" },
      members: [{
        chunkKey: "partial",
        title: "Partial member",
        contract: "Publish part of the implementation",
        designElementIds: ["detailed:deliverable-contract"],
        mainlineLandability: "independently-landable",
      }],
      seams: [],
    } as const;
    await fillSlots(join(authoring, firstMap), {
      ...baseSlots,
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "partial", sourceIds: ["1.1"] }],
      },
    });
    const uncovered = await runArc(["delivery", "compose", "--json"], repository);
    expect(uncovered.exitCode).toBe(1);
    expect(JSON.parse(uncovered.stdout)).toMatchObject({
      status: "refused",
      reason: "contribution-step-uncovered",
    });

    expect((await runArc(["delivery", "plan", "abandon", "--json"], repository)).exitCode).toBe(0);
    expect((await author()).exitCode).toBe(0);
    const secondMap = (await readdir(authoring)).find((name) => name.endsWith(".md"));
    expect(secondMap).toBeDefined();
    if (secondMap === undefined) return;
    await fillSlots(join(authoring, secondMap), {
      ...baseSlots,
      boundary: {
        kind: "explicit",
        segments: [{ chunkKey: "partial", sourceIds: ["2.1"] }],
      },
    });
    const verification = await runArc(["delivery", "compose", "--json"], repository);
    expect(verification.exitCode).toBe(1);
    expect(JSON.parse(verification.stdout)).toMatchObject({
      status: "refused",
      reason: "work-unit-verification-task-ineligible",
    });
  });

  it("emits a typed integrity refusal and abandons the pair idempotently", async () => {
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
      "# Metadata: demo",
      "",
      "- **State:** Active",
      "- **Branch:** feat/demo",
      "",
    ].join("\n"));
    const common = resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
    const authoring = join(common, "arc", "delivery", "authoring");
    await mkdir(authoring, { recursive: true });
    await writeFile(join(authoring, "authoring-map.json"), `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-authoring/v1",
      mapId: "authoring-map",
      originalWorkUnitId: "demo",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      expectedCurrentPlanDigest: null,
      candidatePlanDigest: null,
      candidateProjectionDigest: null,
      candidateOutcome: null,
      design: { artifacts: [{ artifactId: "spec.md", revisionDigest: DIGEST }], elements: [] },
      tasks: {
        inventoryDigest: DIGEST,
        parents: [
          { taskId: "1.1", semanticDigest: DIGEST, role: { kind: "implementation" } },
          {
            taskId: "2.1",
            semanticDigest: null,
            role: { kind: "verification", scope: "work-unit" },
          },
        ],
      },
      source: {
        entry: "from-tasks",
        inputs: { taskListPath: "tasks.md" },
        facts: {},
        identitySequence: ["task:1.1"],
      },
      identityOrder: {
        designArtifactIds: ["spec.md"],
        designElementIds: [],
        taskIds: ["1.1", "2.1"],
        sourceIds: ["task:1.1"],
      },
    })}\n`);
    await writeFile(join(authoring, "authoring-map.md"), "# malformed map\n");

    const compose = await runArc(["delivery", "compose", "--json"], repository);
    expect(compose.exitCode).toBe(1);
    expect(JSON.parse(compose.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "delivery compose",
      status: "refused",
      reason: "map-malformed",
    });

    const first = await runArc(["delivery", "plan", "abandon", "--json"], repository);
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({ status: "ok", value: { removed: true } });
    const second = await runArc(["delivery", "plan", "abandon", "--json"], repository);
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ status: "ok", value: { removed: false } });
  });
});

async function gitCommonDir(repository: string): Promise<string> {
  return resolve(repository, await git(repository, ["rev-parse", "--git-common-dir"]));
}

async function installTaskFixture(repository: string, includeSecondTask = false): Promise<void> {
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  await writeFile(join(repository, ".arc", "active", "meta-demo.md"), [
    "# Metadata: demo",
    "",
    "- **State:** Active",
    "- **Branch:** feat/demo",
    "- **Design:** `spec-demo.md`",
    "- **Task List:** `tasks-demo.md`",
    "",
  ].join("\n"));
  await writeFile(join(repository, ".arc", "active", "tasks-demo.md"), [
    "# Task List: Demo",
    "",
    "- **Design:** `spec-demo.md`",
    "",
    "---",
    "",
    "## Delivery Plan",
    "",
    "Plan pending authoring.",
    "",
    "## **Phase alpha:** Implementation",
    "",
    "### `[ ]` **1.1 Implement the contract** — validate criteria at member scope",
    "",
    "- _Goal:_ Implement the delivery contract.",
    "",
    ...(includeSecondTask ? [
      "### `[ ]` **1.2 Implement the companion** — validate criteria at member scope",
      "",
      "- _Goal:_ Implement the companion behavior.",
      "",
    ] : []),
    "## **Phase verify:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
    "",
  ].join("\n"));
}

async function writeDesignInventory(repository: string): Promise<void> {
  await writeFile(join(repository, "design-inventory.json"), `${JSON.stringify({
    artifacts: [{
      artifactId: "spec-demo.md",
      revisionDigest: DIGEST,
      form: "detailed",
      elements: [{ elementId: "deliverable-contract", semanticDigest: DIGEST }],
    }],
  })}\n`);
}

async function fillSlots(path: string, slots: unknown): Promise<void> {
  const current = await readFile(path, "utf8");
  const start = "<!-- arc:delivery-authoring-slots:start -->\n```json\n";
  const end = "\n```\n<!-- arc:delivery-authoring-slots:end -->";
  const from = current.indexOf(start);
  const to = current.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  await writeFile(path, `${current.slice(0, from + start.length)}${JSON.stringify(slots, null, 2)}${
    current.slice(to)
  }`);
}

function fieldSlots(run: DeliveryFieldRun, contributionIds: readonly string[]) {
  return {
    projection: { kind: "stack-to-main" },
    boundary: {
      kind: "explicit",
      segments: run.members.map((member, index) => {
        const contributionId = contributionIds[index];
        if (contributionId === undefined) throw new Error("expected contribution evidence");
        return {
          chunkKey: member.chunkKey,
          sourceIds: [contributionId],
        };
      }),
    },
    members: run.members.map((member, index) => ({
      chunkKey: member.chunkKey,
      title: member.title,
      contract: member.contract,
      designElementIds: index === 0 ? ["detailed:deliverable-contract"] : [],
      mainlineLandability: "independently-landable",
    })),
    seams: adjacentFieldSeams(run),
  };
}
