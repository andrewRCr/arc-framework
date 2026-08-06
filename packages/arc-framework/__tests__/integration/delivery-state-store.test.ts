import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import {
  DeliveryStateV1Schema,
  type DeliveryStateV1,
} from "../../src/lib/delivery/schema.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const roots: string[] = [];
const PLAN_ID = "8ddfd842-4c92-4ccb-9958-ae47b43e2c44";
const OTHER_PLAN_ID = "f7f35d3f-8d46-4443-b36b-c4e7d463d5b8";
const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function stateStore() {
  const root = await mkdtemp(join(tmpdir(), "arc-delivery-state-store-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  return {
    commonDir,
    publisher,
    store: new RepositoryDeliveryStateStore(publisher),
  };
}

function state(options: {
  readonly changeRequestId?: string;
  readonly head?: string;
  readonly memberLabel?: string;
  readonly planId?: string;
  readonly ref?: string | null;
  readonly workUnitId?: string;
} = {}): DeliveryStateV1 {
  const planId = options.planId ?? PLAN_ID;
  return DeliveryStateV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-state/v1",
    planId,
    workUnitId: options.workUnitId ?? "delivery-plan-record",
    boundPlan: {
      planRevision: 1,
      planDigest: canonicalDigest({ planId, revision: 1 }),
    },
    target: null,
    members: [{
      deliverableId: canonicalDigest({ member: options.memberLabel ?? "first" }),
      ref: options.ref === undefined ? "opaque-member-binding" : options.ref,
      changeRequest: options.changeRequestId === undefined
        ? null
        : { providerId: "github", changeRequestId: options.changeRequestId },
      coordinates: options.ref === null
        ? null
        : { base: "c".repeat(40), head: options.head ?? HEAD, tree: TREE },
    }],
    activeOperation: null,
  });
}

describe("repository delivery state store", () => {
  it("publishes state by expected revision and treats an equal replay as idempotent", async () => {
    const records = await stateStore();
    const first = state();
    const second = state({ changeRequestId: "pull/401" });

    await expect(records.store.read(PLAN_ID)).resolves.toEqual({ status: "ok", value: null });
    await expect(records.store.publish(PLAN_ID, first, 0)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: first },
    });
    await expect(records.store.publish(PLAN_ID, first, 99)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: first },
    });
    await expect(records.store.publish(PLAN_ID, second, 0)).resolves.toEqual({
      status: "refused",
      reason: "version-conflict",
    });
    await expect(records.store.publish(PLAN_ID, second, 1)).resolves.toEqual({
      status: "ok",
      value: { revision: 2, value: second },
    });
  });

  it("refuses malformed records and addressed-plan identity mismatches", async () => {
    const records = await stateStore();

    await expect(records.store.publish(PLAN_ID, state({ planId: OTHER_PLAN_ID }), 0)).resolves.toEqual({
      status: "refused",
      reason: "identity-mismatch",
    });
    await records.publisher.update(
      { root: "delivery", namespace: "state" },
      `${PLAN_ID}.json`,
      () => ({ kind: "write", content: "{}\n", result: undefined }),
    );
    await expect(records.store.read(PLAN_ID)).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
  });

  it("resolves a member by exact head or by its exact stored ref and head", async () => {
    const records = await stateStore();
    const current = state();
    await records.store.publish(PLAN_ID, current, 0);
    const expected = {
      status: "ok",
      value: {
        planId: PLAN_ID,
        deliverableId: current.members[0]!.deliverableId,
        workUnitId: current.workUnitId,
        state: current,
      },
    };

    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
    })).resolves.toEqual(expected);
    await expect(records.store.resolveMember({
      selector: {
        kind: "ref",
        ref: "opaque-member-binding",
        observedHeadObjectId: HEAD,
      },
    })).resolves.toEqual(expected);
    await expect(records.store.resolveMember({
      selector: {
        kind: "ref",
        ref: "another-binding",
        observedHeadObjectId: HEAD,
      },
    })).resolves.toEqual({ status: "ok", value: null });
  });

  it("detects global ambiguity even when an owning-unit pointer names one match", async () => {
    const records = await stateStore();
    const first = state();
    const second = state({
      memberLabel: "second",
      planId: OTHER_PLAN_ID,
      workUnitId: "another-work-unit",
    });
    await records.store.publish(PLAN_ID, first, 0);
    await records.store.publish(OTHER_PLAN_ID, second, 0);

    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
      owningUnit: { planId: PLAN_ID, workUnitId: first.workUnitId },
    })).resolves.toEqual({ status: "refused", reason: "ambiguous-match" });
  });

  it("validates an owning-unit pointer against the unique stored subject", async () => {
    const records = await stateStore();
    const current = state();
    await records.store.publish(PLAN_ID, current, 0);

    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
      owningUnit: { planId: PLAN_ID, workUnitId: current.workUnitId },
    })).resolves.toMatchObject({ status: "ok", value: { planId: PLAN_ID } });
    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
      owningUnit: { planId: PLAN_ID, workUnitId: "wrong-work-unit" },
    })).resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
      owningUnit: { planId: PLAN_ID, workUnitId: "INVALID" },
    })).resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
  });

  it("refuses a corrupt state namespace even when a valid pointer and match exist", async () => {
    const records = await stateStore();
    const current = state();
    await records.store.publish(PLAN_ID, current, 0);
    const directory = join(records.commonDir, "arc", "delivery", "state");
    await mkdir(join(directory, "unexpected-directory"), { recursive: true });
    await writeFile(join(directory, "INVALID.json"), "{}\n", "utf8");

    await expect(records.store.resolveMember({
      selector: { kind: "head", objectId: HEAD },
      owningUnit: { planId: PLAN_ID, workUnitId: current.workUnitId },
    })).resolves.toEqual({ status: "refused", reason: "namespace-corrupt" });
  });
});
