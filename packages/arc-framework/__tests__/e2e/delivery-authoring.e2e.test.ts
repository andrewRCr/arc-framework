/** Built-CLI coverage for the typed delivery authoring write verbs. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcWithStdin } from "./helpers.js";

interface AuthoringFixture {
  readonly planId: string;
  readonly deliverableId: string;
  readonly candidateRef: string;
  readonly gatePath: string;
  readonly memberRef: string;
  readonly memberHead: string;
  readonly memberTree: string;
}

describe("delivery authoring write verbs", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-delivery-authoring-");
    const init = await runArc(["init", "--yes", "--name", "delivery-authoring"], repository);
    expect(init.exitCode, init.stderr).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  async function installFixture(): Promise<AuthoringFixture> {
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

    const located = await runArcWithStdin(
      ["delivery", "authoring", "locate", "-", "--json"],
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
      candidateRef: first.candidateRef,
      gatePath: first.gatePath,
      memberRef: "refs/heads/delivery/first",
      memberHead: firstHead,
      memberTree: firstTree,
    };
  }

  function rematerializeRequest(fixture: AuthoringFixture, expectedStateRevision = 1): string {
    return `${JSON.stringify({
      planId: fixture.planId,
      selectedDeliverableId: fixture.deliverableId,
      expectedStateRevision,
      ref: fixture.candidateRef,
      checkoutPath: fixture.gatePath,
      beforeHead: null,
      beforeTree: null,
      requestedHead: fixture.memberHead,
      requestedTree: fixture.memberTree,
    })}\n`;
  }

  async function rematerialize(fixture: AuthoringFixture, expectedStateRevision = 1) {
    return runArcWithStdin(
      ["delivery", "authoring", "rematerialize", "-", "--json"],
      repository,
      rematerializeRequest(fixture, expectedStateRevision),
    );
  }

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
      ...overrides,
    })}\n`;
    const rebind = (input: string) => runArcWithStdin(
      ["delivery", "authoring", "rebind", "-", "--json"],
      repository,
      input,
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
