import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultMergeLockPort, handleReviewReadiness } from "../../src/handlers/review.js";
import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import type { HostedProcessRunner } from "../../src/scripts/review-gate/hosted/gh-process.js";
import {
  MergeLockTransitionRequestSchema,
  releaseMergeLock,
  type MergeLockTransitionRequest,
} from "../../src/scripts/review-gate/merge-lock.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const HEAD = "a".repeat(40);
const BASE = "c".repeat(40);
const TREE = "b".repeat(40);
const WORK_UNIT = "delivery-plan-record";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

function state(): DeliveryStateV1 {
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId: PLAN_ID,
    workUnitId: WORK_UNIT,
    boundPlan: { planRevision: 1, planDigest: canonicalDigest({ planId: PLAN_ID, revision: 1 }) },
    target: null,
    members: [
      {
        deliverableId: canonicalDigest({ member: 0, planId: PLAN_ID }),
        ref: "opaque-member-0",
        changeRequest: null,
        coordinates: { base: BASE, head: HEAD, tree: TREE },
      },
      {
        deliverableId: canonicalDigest({ member: 1, planId: PLAN_ID }),
        ref: "opaque-member-1",
        changeRequest: null,
        coordinates: { base: HEAD, head: "d".repeat(40), tree: TREE },
      },
    ],
    activeOperation: null,
    pendingReviewFixVerification: null,
  });
}

const DELIVERABLE_ID = state().members[0]!.deliverableId;

/** A repository whose Git-common delivery state binds {@link HEAD} to a member. */
async function boundRepository(): Promise<string> {
  const cwd = await createTempRepo("arc-review-readiness-binding-");
  roots.push(cwd);
  const store = new RepositoryDeliveryStateStore(
    new RepositoryGitCommonStatePublisher(makeGitExec(cwd), cwd),
  );
  const published = await store.publish(PLAN_ID, state(), 0);
  expect(published.status).toBe("ok");
  return cwd;
}

/** A repository with no delivery state at all — every head resolves unbound. */
async function unboundRepository(): Promise<string> {
  const cwd = await createTempRepo("arc-review-readiness-unbound-");
  roots.push(cwd);
  return cwd;
}

function memberRequest(treeRoot: string) {
  return {
    schemaVersion: 1,
    treeRoot,
    target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
    pullRequest: {
      repository: "owner/repo",
      number: 42,
      state: "open",
      headBranch: "delivery/plan/00",
      headSha: HEAD,
    },
    vehicle: {
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: DELIVERABLE_ID,
      workUnitSlug: WORK_UNIT,
    },
  };
}

function transitionRequest(treeRoot: string): MergeLockTransitionRequest {
  return MergeLockTransitionRequestSchema.parse({
    schemaVersion: 1,
    treeRoot,
    target: { repository: "owner/repo", pullRequest: 42, headSha: HEAD },
    vehicle: {
      kind: "delivery-member",
      planId: PLAN_ID,
      deliverableId: DELIVERABLE_ID,
      workUnitSlug: WORK_UNIT,
    },
  });
}

async function runReadinessHandler(
  resolvedRoot: string,
  suppliedTreeRoot: string,
): Promise<{ state: string; diagnostics: { code: string }[] }> {
  let written = "";
  await handleReviewReadiness("request.json", {
    resolveRoot: () => resolvedRoot,
    readText: async () => JSON.stringify(memberRequest(suppliedTreeRoot)),
    write: (text) => {
      written += text;
    },
    setExitCode: () => undefined,
  });
  return JSON.parse(written) as { state: string; diagnostics: { code: string }[] };
}

async function writeLockConfig(root: string): Promise<void> {
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "merge.lock: draft\n", "utf8");
}

function ghRunner(): HostedProcessRunner {
  return {
    run: async (args) => {
      if (args[0] === "repo") {
        return {
          stdout: JSON.stringify({
            nameWithOwner: "owner/repo",
            defaultBranchRef: { name: "main" },
          }),
          stderr: "",
        };
      }
      if (args[0] === "api") {
        return {
          stdout: JSON.stringify({
            number: 42,
            state: "open",
            draft: true,
            head: { ref: "delivery/plan/00", sha: HEAD },
            base: { repo: { full_name: "owner/repo" } },
          }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    },
  };
}

describe("readiness delivery binding at its composition roots", () => {
  it("binds the readiness handler's port to the root it resolves, not the supplied tree root", async () => {
    const bound = await boundRepository();
    const unbound = await unboundRepository();

    const resolvedFromBound = await runReadinessHandler(bound, unbound);
    const resolvedFromUnbound = await runReadinessHandler(unbound, bound);

    expect(resolvedFromBound.state).toBe("ready");
    expect(resolvedFromUnbound).toMatchObject({
      state: "invalid",
      diagnostics: [{ code: "delivery-member-unbound" }],
    });
  });

  it("authenticates a merge-lock release against the repository its port was constructed with", async () => {
    const bound = await boundRepository();
    const unbound = await unboundRepository();
    await writeLockConfig(bound);
    await writeLockConfig(unbound);
    const runner = ghRunner();

    const releasedFromBound = await releaseMergeLock(
      transitionRequest(unbound),
      defaultMergeLockPort(bound, runner),
    );
    const releasedFromUnbound = await releaseMergeLock(
      transitionRequest(bound),
      defaultMergeLockPort(unbound, runner),
    );

    expect(releasedFromBound).toMatchObject({ state: "released", nextAction: "proceed" });
    expect(releasedFromUnbound).toMatchObject({
      state: "blocked",
      payload: { reason: "readiness-failed" },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "delivery-member-unbound" }),
      ]),
    });
  });

  it("leaves neither reaching path's port unbound for want of wiring", async () => {
    const bound = await boundRepository();
    await writeLockConfig(bound);

    const readiness = await runReadinessHandler(bound, bound);
    const release = await releaseMergeLock(
      transitionRequest(bound),
      defaultMergeLockPort(bound, ghRunner()),
    );

    expect(JSON.stringify(readiness)).not.toContain("delivery-state-unavailable");
    expect(JSON.stringify(release)).not.toContain("delivery-state-unavailable");
  });
});
