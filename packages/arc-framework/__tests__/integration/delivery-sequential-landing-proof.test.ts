import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { RawGitExec } from "../../src/lib/change-facts.js";
import { projectDeliveryContributionEndpoints } from "../../src/lib/delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../../src/lib/delivery/git-contribution-proof.js";
import { observeDeliveryEligibilityRef } from "../../src/lib/delivery/git-eligibility.js";
import { observeGitDeliveryLandingResult } from "../../src/lib/delivery/git-landing-result.js";
import { applyDeliveryLanding, prepareDeliveryLanding } from "../../src/lib/delivery/landing.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { deliveryThreeMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => removeGitBackedDir(root)));
});

describe("sequential delivery landing proof", () => {
  it("preserves unrelated base work when the second member lands", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-sequential-landing-" });
    roots.push(repository);
    const run = async (args: string[]): Promise<string> => (
      await execFileAsync("git", args, { cwd: repository })
    ).stdout.trim();
    const coordinate = async (head: string) => ({ head, tree: await run(["rev-parse", `${head}^{tree}`]) });
    const exec: GitExec = async (command, args, options) => {
      const result = await execFileAsync(command, [...args], { cwd: options?.cwd ?? repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const rawExec: RawGitExec = async (args) => {
      const result = await execFileAsync("git", args, { cwd: repository, encoding: "buffer" });
      return { stdout: new Uint8Array(result.stdout), stderr: new Uint8Array(result.stderr) };
    };
    const commitFile = async (name: string, value: string) => {
      await writeFile(join(repository, name), `${value}\n`, "utf8");
      await run(["add", name]);
      await run(["commit", "-m", name]);
      return run(["rev-parse", "HEAD"]);
    };
    const land = async (member: string, predecessor: string, ordinal: number) => {
      await run(["checkout", "-B", "main", predecessor]);
      await run(["merge", "--no-ff", "-m", `land ${ordinal}`, member]);
      return run(["rev-parse", "HEAD"]);
    };

    const base = await commitFile("base.txt", "base");
    await run(["checkout", "-b", "member-1"]);
    const firstHead = await commitFile("first.txt", "first");
    await run(["checkout", "-b", "member-2"]);
    const secondHead = await commitFile("second.txt", "second");
    await run(["checkout", "-b", "member-3"]);
    const topHead = await commitFile("top.txt", "top");
    await run(["checkout", "-B", "main", base]);
    const ambient = await commitFile("ambient.txt", "ambient");
    const firstLanded = await land(firstHead, ambient, 1);

    const plan = deliveryThreeMemberStackPlanFixture();
    const fixture = deliveryStateFixture(plan);
    const state = DeliveryStateV1Schema.parse({
      ...fixture,
      target: { ref: "refs/heads/main", coordinates: await coordinate(firstLanded) },
      members: [
        { ...fixture.members[0], changeRequest: null,
          coordinates: { base, ...await coordinate(firstHead) } },
        { ...fixture.members[1], changeRequest: { providerId: "github", changeRequestId: "402" },
          coordinates: { base: firstHead, ...await coordinate(secondHead) } },
        { ...fixture.members[2], coordinates: { base: secondHead, ...await coordinate(topHead) } },
      ],
    });
    const selected = state.members[1]!;
    const positionFacts = {
      target: state.target,
      members: state.members.map((member) => ({
        deliverableId: member.deliverableId,
        ref: member.ref,
        changeRequest: member.changeRequest,
        coordinates: member.coordinates,
      })),
      landedDeliverableIds: [state.members[0]!.deliverableId],
    };
    const repositoryName = "andrewRCr/arc-framework";
    const mergePolicy = {
      repository: repositoryName,
      stackPosition: "intermediate" as const,
      method: "merge" as const,
      allowedMethods: ["merge"] as Array<"merge" | "rebase" | "squash">,
      policyFingerprint: `sha256:${"a".repeat(64)}`,
    };
    let current = { revision: 7, value: state };
    const stateStore = {
      publish: async (_planId: string, value: typeof state) => {
        current = { revision: current.revision + 1, value };
        return { status: "ok" as const, value: current };
      },
    };
    let mergedHead: string | null = null;
    const host = {
      observeRequest: async () => ({ status: "absent" as const }),
      openRequest: async () => ({ status: "submitted" as const }),
      readRequest: async () => ({
        status: "observed" as const,
        request: {
          binding: selected.changeRequest!,
          repository: repositoryName,
          headRepository: repositoryName,
          headRef: "member-2",
          headSha: secondHead,
          baseRef: "main",
          state: mergedHead === null ? "open" as const : "merged" as const,
          draft: true,
          mergeCommitSha: mergedHead,
        },
      }),
      mergeRequest: async () => {
        mergedHead = await land(secondHead, firstLanded, 2);
        return { status: "submitted" as const };
      },
      observeTarget: async () => ({ status: "observed" as const, coordinates: await coordinate(firstLanded) }),
    };
    const readiness = { assess: async () => ({ status: "ready" as const, settledReviewState: "settled" }) };
    const prepared = await prepareDeliveryLanding({
      plan,
      current,
      facts: positionFacts,
      selectedDeliverableId: selected.deliverableId,
      repository: repositoryName,
      baseRef: "refs/heads/main",
      targetRef: "refs/heads/main",
      mergePolicy,
      releaseMergeLock: false,
      stateStore,
      host,
      readiness,
    });
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    const observation = {
      revalidateMergePolicy: async () => ({ status: "exact" as const }),
      observeSelection: async () => ({
        status: "observed" as const,
        facts: positionFacts,
        snapshot: { target: state.target, members: [selected] },
      }),
      observeLandedResult: ({ mergeCommitSha, beforeMember }: {
        mergeCommitSha: string;
        beforeMember: NonNullable<typeof selected.coordinates>;
      }) => observeGitDeliveryLandingResult({
        exec, cwd: repository, remote: ".", resultHead: mergeCommitSha, strategy: "merge", beforeMember,
      }),
      readMemberBase: (head: string) => observeDeliveryEligibilityRef(exec, head),
      proveLandedContribution: (endpoints: Parameters<typeof projectDeliveryContributionEndpoints>[0]) => (
        proveGitDeliveryContribution({ exec: rawExec, ...projectDeliveryContributionEndpoints(endpoints) })
      ),
    };
    const applied = await applyDeliveryLanding({
      plan,
      current,
      approved: prepared.presentation,
      stateStore,
      host,
      readiness,
      lock: { release: async () => ({ status: "not-configured" as const }) },
      observation,
    });
    if (applied.status !== "landed") throw new Error(JSON.stringify(applied));
    expect(applied.state.value.target?.coordinates?.head).toBe(mergedHead);
    expect(await run(["show", `${mergedHead}:ambient.txt`])).toBe("ambient");
    expect(await run(["show", `${mergedHead}:second.txt`])).toBe("second");
  });
});
