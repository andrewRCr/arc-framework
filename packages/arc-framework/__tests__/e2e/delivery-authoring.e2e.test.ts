/** Built-CLI coverage for the typed delivery authoring write verbs. */

import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

interface AuthoringFixture {
  readonly planId: string;
  readonly deliverableId: string;
  readonly otherDeliverableId: string;
  readonly affectedDeliverableIds: readonly string[];
  readonly candidateRef: string;
  readonly gatePath: string;
  readonly memberRef: string;
  readonly memberHead: string;
  readonly memberTree: string;
  readonly derivedFrom: {
    readonly kind: "open-task";
    readonly taskId: string;
    readonly leafTaskId: string;
  };
  readonly requiredAncestorHeads: readonly string[];
  readonly requiredFindingPaths: readonly string[];
  readonly env: Record<string, string>;
}

describe("delivery authoring write verbs", () => {
  let repository: string;
  let auxiliaryRoots: string[];

  beforeEach(async () => {
    auxiliaryRoots = [];
    repository = await createTempRepo("arc-delivery-authoring-");
    const init = await runArc(["init", "--yes", "--name", "delivery-authoring"], repository);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    await Promise.all([repository, ...auxiliaryRoots].map((root) => cleanupTempDir(root)));
  });

  async function installFixture(authorized = true): Promise<AuthoringFixture> {
    const plan = deliveryStackPlanFixture();
    const targetHead = await git(repository, ["rev-parse", "HEAD"]);
    const targetTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    await writeFile(join(repository, "member-one.txt"), "member one\n");
    await git(repository, ["add", "member-one.txt"]);
    await git(repository, ["commit", "-m", "member one"]);
    const firstHead = await git(repository, ["rev-parse", "HEAD"]);
    const firstTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    await git(repository, ["branch", "delivery/first", firstHead]);
    await writeFile(join(repository, "member-two.txt"), "member two\n");
    await git(repository, ["add", "member-two.txt"]);
    await git(repository, ["commit", "-m", "member two"]);
    const secondHead = await git(repository, ["rev-parse", "HEAD"]);
    const secondTree = await git(repository, ["rev-parse", "HEAD^{tree}"]);
    await git(repository, ["branch", "delivery/second", secondHead]);

    const activeDir = join(repository, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    if (authorized) {
      await writeFile(join(activeDir, `tasks-${plan.workUnitId}.md`), [
        "# Task List",
        "",
        renderDeliveryPlanSection(plan).trimEnd(),
        "",
        "## **Phase 1:** Build",
        "",
        "### `[ ]` **1.1 Work**",
        "",
        "    - `[ ]` **1.1.R.a Repair the member**",
        "",
      ].join("\n"));
    }
    await writeFile(join(activeDir, `meta-${plan.workUnitId}.md`), [
      `# Metadata: ${plan.workUnitId}`,
      "",
      "- **State:** Integrating",
      "- **Owner:** test-user",
      "- **Branch:** delivery/second",
      `- **Task List:** \`tasks-${plan.workUnitId}.md\``,
      "- **Candidate:** [none]",
      "- **Current Workflow:** `integrate-work-unit`",
      "- **Last Completed:** [none]",
      "- **Next Task:** [none]",
      "- **Next Action:** Finish the correction",
      "",
    ].join("\n"));
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "install authoring fixture"]);

    const state = DeliveryStateV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-state/v1",
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest },
      target: { ref: "refs/heads/main", coordinates: { head: targetHead, tree: targetTree } },
      members: plan.members.map((member, index) => ({
        deliverableId: member.deliverableId,
        ref: index === 0 ? "refs/heads/delivery/first" : "refs/heads/delivery/second",
        changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
        coordinates: index === 0
          ? { base: targetHead, head: firstHead, tree: firstTree }
          : { base: firstHead, head: secondHead, tree: secondTree },
      })),
      activeOperation: null,
      pendingReviewFixVerification: null,
    });
    const deliveryRoot = join(repository, ".git", "arc", "delivery");
    await Promise.all([
      mkdir(join(deliveryRoot, "plans"), { recursive: true }),
      mkdir(join(deliveryRoot, "state"), { recursive: true }),
    ]);
    await writeFile(join(deliveryRoot, "plans", `${plan.planId}.json`), `${JSON.stringify(plan)}\n`);
    await writeFile(join(deliveryRoot, "state", `${plan.planId}.json`), `${JSON.stringify({
      schemaVersion: 1,
      semanticsVersion: "delivery-state-store/v1",
      planId: plan.planId,
      revision: 1,
      value: state,
    })}\n`);

    const remoteRoot = await mkdtemp(join(tmpdir(), "arc-delivery-authoring-origin-"));
    auxiliaryRoots.push(remoteRoot);
    await git(remoteRoot, ["init", "--bare"]);
    await git(repository, ["remote", "add", "origin", remoteRoot]);
    await git(repository, ["push", "origin", `HEAD:refs/heads/main`]);
    await git(repository, ["push", "origin", "refs/heads/delivery/first", "refs/heads/delivery/second"]);

    const fakeBin = await mkdtemp(join(tmpdir(), "arc-delivery-authoring-fake-bin-"));
    auxiliaryRoots.push(fakeBin);
    const fakeGh = join(fakeBin, "gh");
    const request = (number: number, headRef: string, headSha: string, baseRef: string) => JSON.stringify({
      number,
      state: "open",
      merged: false,
      draft: true,
      head: { ref: headRef, sha: headSha, repo: { full_name: "owner/repo" } },
      base: { ref: baseRef, repo: { full_name: "owner/repo" } },
      merge_commit_sha: null,
    });
    const stack = JSON.stringify([{
      number: 901,
      base: { ref: "main" },
      pull_requests: [
        JSON.parse(request(401, "delivery/first", firstHead, "main")) as unknown,
        JSON.parse(request(402, "delivery/second", secondHead, "delivery/first")) as unknown,
      ],
    }]);
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "case \"$2\" in",
      "  repos/owner/repo/git/ref/heads/main)",
      `    printf '%s\\n' '${JSON.stringify({ object: { sha: targetHead } })}' ;;`,
      `  repos/owner/repo/git/commits/${targetHead})`,
      `    printf '%s\\n' '${JSON.stringify({ tree: { sha: targetTree } })}' ;;`,
      "  repos/owner/repo/pulls/401)",
      `    printf '%s\\n' '${request(401, "delivery/first", firstHead, "main")}' ;;`,
      "  repos/owner/repo/pulls/402)",
      `    printf '%s\\n' '${request(402, "delivery/second", secondHead, "delivery/first")}' ;;`,
      "  repos/owner/repo/stacks)",
      `    printf '%s\\n' '${stack}' ;;`,
      "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
      "esac",
      "",
    ].join("\n"));
    await chmod(fakeGh, 0o755);

    const located = await runArcWithStdin(
      ["delivery", "authoring", "locate", "-"],
      repository,
      `${JSON.stringify({ planId: plan.planId })}\n`,
    );
    expect(located.exitCode, `${located.stderr}\n${located.stdout}`).toBe(0);
    const locators = (JSON.parse(located.stdout) as {
      locators: ReadonlyArray<{ deliverableId: string; candidateRef: string; gatePath: string }>;
    }).locators;
    const first = locators.find(({ deliverableId }) => deliverableId === plan.members[0]!.deliverableId);
    if (first === undefined) throw new Error("first member locator missing");
    return {
      planId: plan.planId,
      deliverableId: first.deliverableId,
      otherDeliverableId: plan.members[1]!.deliverableId,
      affectedDeliverableIds: [first.deliverableId],
      candidateRef: first.candidateRef,
      gatePath: first.gatePath,
      memberRef: "refs/heads/delivery/first",
      memberHead: firstHead,
      memberTree: firstTree,
      derivedFrom: { kind: "open-task", taskId: "1.1", leafTaskId: "1.1.R.a" },
      requiredAncestorHeads: [firstHead],
      requiredFindingPaths: [],
      env: { PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ""}` },
    };
  }

  function rematerializeRequest(
    fixture: AuthoringFixture,
    expectedStateRevision = 1,
    overrides: Record<string, unknown> = {},
  ): string {
    return `${JSON.stringify({
      repository: "owner/repo",
      remote: "origin",
      derivedFrom: fixture.derivedFrom,
      route: "provider-refresh",
      affectedDeliverableIds: fixture.affectedDeliverableIds,
      requiredAncestorHeads: fixture.requiredAncestorHeads,
      requiredFindingPaths: fixture.requiredFindingPaths,
      planId: fixture.planId,
      selectedDeliverableId: fixture.deliverableId,
      expectedStateRevision,
      ref: fixture.candidateRef,
      checkoutPath: fixture.gatePath,
      beforeHead: null,
      beforeTree: null,
      requestedHead: fixture.memberHead,
      requestedTree: fixture.memberTree,
      ...overrides,
    })}\n`;
  }

  async function rematerialize(
    fixture: AuthoringFixture,
    expectedStateRevision = 1,
    overrides: Record<string, unknown> = {},
  ) {
    return runArcWithStdin(
      ["delivery", "authoring", "rematerialize", "-"],
      repository,
      rematerializeRequest(fixture, expectedStateRevision, overrides),
      { env: fixture.env },
    );
  }

  it("refuses authoring mutation when no current correction action owns the member", async () => {
    const fixture = await installFixture(false);

    const result = await rematerialize(fixture);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: "delivery authoring rematerialize",
      status: "refused",
      reason: "authoring-rematerialize-authority-moved",
    });
    await expect(git(repository, ["rev-parse", "--verify", fixture.candidateRef])).rejects.toThrow();
  });

  it("refuses weakened or non-owning authoring envelopes before mutation", async () => {
    const fixture = await installFixture();

    for (const overrides of [
      { affectedDeliverableIds: [] },
      { requiredAncestorHeads: [] },
      { selectedDeliverableId: fixture.otherDeliverableId },
      { derivedFrom: { kind: "open-task", taskId: "1.2", leafTaskId: "1.2.R.a" } },
    ]) {
      const result = await rematerialize(fixture, 1, overrides);
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused" });
    }
    const omittedFindingPaths = JSON.parse(rematerializeRequest(fixture)) as Record<string, unknown>;
    delete omittedFindingPaths.requiredFindingPaths;
    const omitted = await runArcWithStdin(
      ["delivery", "authoring", "rematerialize", "-"],
      repository,
      `${JSON.stringify(omittedFindingPaths)}\n`,
      { env: fixture.env },
    );
    expect(omitted.exitCode).toBe(1);
    expect(JSON.parse(omitted.stdout)).toMatchObject({
      status: "refused",
      reason: "invalid-command-input",
    });
    await expect(git(repository, ["rev-parse", "--verify", fixture.candidateRef])).rejects.toThrow();
  });

  it("prepares the private candidate pair at the public member and replays idempotently", async () => {
    const fixture = await installFixture();

    const prepared = await rematerialize(fixture);
    expect(prepared.exitCode, `${prepared.stderr}\n${prepared.stdout}`).toBe(0);
    expect(JSON.parse(prepared.stdout)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rematerialize",
      status: "rematerialized",
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(fixture.memberHead);
    expect(await git(fixture.gatePath, ["rev-parse", "HEAD"])).toBe(fixture.memberHead);
    expect(await git(fixture.gatePath, ["symbolic-ref", "--quiet", "HEAD"]).catch(() => "detached")).toBe("detached");

    const replayed = await rematerialize(fixture);
    expect(replayed.exitCode, `${replayed.stderr}\n${replayed.stdout}`).toBe(0);
    expect(JSON.parse(replayed.stdout)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rematerialize",
      status: "already-rematerialized",
      replayed: true,
    });

    const stale = await rematerialize(fixture, 2);
    expect(stale.exitCode).toBe(1);
    expect(JSON.parse(stale.stdout)).toMatchObject({
      command: "delivery authoring rematerialize",
      status: "refused",
      reason: "authoring-rematerialize-authority-moved",
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(fixture.memberHead);
  });

  it("binds a clean detached authoring head to its candidate ref and keeps the executor's refusals", async () => {
    const fixture = await installFixture();
    const prepared = await rematerialize(fixture);
    expect(prepared.exitCode, `${prepared.stderr}\n${prepared.stdout}`).toBe(0);

    await writeFile(join(fixture.gatePath, "member-one.txt"), "member one\ncorrected\n");
    await git(fixture.gatePath, ["add", "member-one.txt"]);
    await git(fixture.gatePath, ["commit", "--no-verify", "-m", "author correction"]);
    const authoredHead = await git(fixture.gatePath, ["rev-parse", "HEAD"]);
    const authoredTree = await git(fixture.gatePath, ["rev-parse", "HEAD^{tree}"]);
    const request = (overrides: Record<string, unknown> = {}) => `${JSON.stringify({
      repository: "owner/repo",
      remote: "origin",
      derivedFrom: fixture.derivedFrom,
      route: "provider-refresh",
      affectedDeliverableIds: fixture.affectedDeliverableIds,
      planId: fixture.planId,
      selectedDeliverableId: fixture.deliverableId,
      expectedStateRevision: 1,
      ref: fixture.candidateRef,
      checkoutPath: fixture.gatePath,
      beforeHead: fixture.memberHead,
      beforeTree: fixture.memberTree,
      requestedHead: authoredHead,
      requestedTree: authoredTree,
      publishedHead: fixture.memberHead,
      publishedTree: fixture.memberTree,
      requiredAncestorHeads: [fixture.memberHead],
      requiredFindingPaths: fixture.requiredFindingPaths,
      ...overrides,
    })}\n`;
    const rebind = (input: string) => runArcWithStdin(
      ["delivery", "authoring", "rebind", "-"],
      repository,
      input,
      { env: fixture.env },
    );

    await writeFile(join(fixture.gatePath, "member-one.txt"), "member one\ndirty\n");
    const dirty = await rebind(request());
    expect(dirty.exitCode).toBe(1);
    expect(JSON.parse(dirty.stdout)).toMatchObject({
      command: "delivery authoring rebind",
      status: "refused",
      reason: "authoring-locus-dirty",
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(fixture.memberHead);
    await git(fixture.gatePath, ["checkout", "--", "member-one.txt"]);

    const rebound = await rebind(request());
    expect(rebound.exitCode, `${rebound.stderr}\n${rebound.stdout}`).toBe(0);
    expect(JSON.parse(rebound.stdout)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rebind",
      status: "rebound",
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(authoredHead);

    const replayed = await rebind(request());
    expect(replayed.exitCode, `${replayed.stderr}\n${replayed.stdout}`).toBe(0);
    expect(JSON.parse(replayed.stdout)).toEqual({
      schemaVersion: 1,
      command: "delivery authoring rebind",
      status: "already-rebound",
      replayed: true,
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(authoredHead);

    const staleAuthority = await rebind(request({ expectedStateRevision: 2 }));
    expect(staleAuthority.exitCode).toBe(1);
    expect(JSON.parse(staleAuthority.stdout)).toMatchObject({
      status: "refused",
      reason: "authoring-rebind-authority-moved",
    });

    const wrongLocator = await rebind(request({ checkoutPath: `${fixture.gatePath}-other` }));
    expect(wrongLocator.exitCode).toBe(1);
    expect(JSON.parse(wrongLocator.stdout)).toMatchObject({
      status: "refused",
      reason: "authoring-rebind-coordinate-mismatch",
    });

    await git(repository, ["update-ref", fixture.memberRef, authoredHead, fixture.memberHead]);
    const publicMoved = await rebind(request());
    expect(publicMoved.exitCode).toBe(1);
    expect(JSON.parse(publicMoved.stdout)).toMatchObject({
      status: "refused",
      reason: "authoring-rebind-public-moved",
    });
    await git(repository, ["update-ref", fixture.memberRef, fixture.memberHead, authoredHead]);

    await writeFile(join(fixture.gatePath, "member-one.txt"), "member one\ncorrected twice\n");
    await git(fixture.gatePath, ["add", "member-one.txt"]);
    await git(fixture.gatePath, ["commit", "--no-verify", "-m", "author a second correction"]);
    const advancedHead = await git(fixture.gatePath, ["rev-parse", "HEAD"]);
    const advancedTree = await git(fixture.gatePath, ["rev-parse", "HEAD^{tree}"]);
    const moved = await rebind(request({ requestedHead: advancedHead, requestedTree: advancedTree }));
    expect(moved.exitCode).toBe(1);
    expect(JSON.parse(moved.stdout)).toMatchObject({ status: "refused", reason: "authoring-rebind-moved" });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(authoredHead);

    await git(fixture.gatePath, ["checkout", "--detach", fixture.memberHead]);
    const notDescendant = await rebind(request({
      beforeHead: authoredHead,
      beforeTree: authoredTree,
      requestedHead: fixture.memberHead,
      requestedTree: fixture.memberTree,
    }));
    expect(notDescendant.exitCode).toBe(1);
    expect(JSON.parse(notDescendant.stdout)).toMatchObject({
      status: "refused",
      reason: "authoring-rebind-not-descendant",
    });
    expect(await git(repository, ["rev-parse", fixture.candidateRef])).toBe(authoredHead);
  });
});
