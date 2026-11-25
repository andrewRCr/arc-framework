import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryPlanStore } from "../../src/lib/delivery/local-stores.js";
import type { DeliveryPlanPayloadCodec } from "../../src/lib/delivery/ports.js";
import { atomicWriteFile } from "../../src/lib/fs.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  RepositoryGitCommonStatePublisher,
  type GitCommonStatePublisher,
  type GitCommonStatePublisherIO,
} from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const roots: string[] = [];
const PLAN_ID_1 = "00000000-0000-4000-8000-000000000001";
const PLAN_ID_2 = "00000000-0000-4000-8000-000000000002";
const PLAN_ID_A = "10000000-0000-4000-8000-000000000001";
const PLAN_ID_B = "20000000-0000-4000-8000-000000000001";

const PlanValueSchema = z.strictObject({
  planId: z.string(),
  planDigest: z.string(),
  body: z.string(),
});
type PlanValue = z.infer<typeof PlanValueSchema>;

const planCodec: DeliveryPlanPayloadCodec<PlanValue> = {
  decode: (value) => {
    const parsed = PlanValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
  digest: (value) => canonicalDigest({ planDigest: value.planDigest }),
  isValidSuccessor: () => true,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function planStore(io: Partial<GitCommonStatePublisherIO> = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-delivery-plan-store-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root, io);
  return {
    commonDir,
    publisher,
    store: new RepositoryDeliveryPlanStore(publisher, planCodec),
  };
}

function plan(planId: string, body: string): PlanValue {
  return {
    planId,
    planDigest: canonicalDigest({ planId, body }),
    body,
  };
}

describe("repository delivery plan store", () => {
  it("refuses noncanonical addresses before repository-common access", async () => {
    const forbidden = new Error("repository-common storage must not be reached");
    const publisher: GitCommonStatePublisher = {
      read: async () => { throw forbidden; },
      list: async () => { throw forbidden; },
      snapshot: async () => { throw forbidden; },
      update: async () => { throw forbidden; },
    };
    const store = new RepositoryDeliveryPlanStore(publisher, planCodec);

    await expect(store.readCurrent("not-a-plan-id"))
      .resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
    await expect(store.publishCurrent("not-a-plan-id", plan("not-a-plan-id", "value"), null))
      .resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
  });

  it("canonicalizes UUID addresses and publishes only against the current digest", async () => {
    const records = await planStore();
    const uppercasePlanId = PLAN_ID_1.toUpperCase();
    const first = plan(PLAN_ID_1, "first");
    const second = plan(PLAN_ID_1, "second");
    const stale = plan(PLAN_ID_1, "stale");

    await expect(records.store.publishCurrent(uppercasePlanId, first, null)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(first) },
    });
    await expect(records.store.publishCurrent(
      PLAN_ID_1,
      second,
      planCodec.digest(first),
    )).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(second) },
    });
    await expect(records.store.publishCurrent(
      PLAN_ID_1,
      stale,
      planCodec.digest(first),
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(records.store.publishCurrent(PLAN_ID_1, second, null)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(second) },
    });
  });

  it("applies predecessor-aware validation to first and successor publication", async () => {
    const records = await planStore();
    const predecessorAwareCodec = {
      ...planCodec,
      isValidSuccessor: (current: PlanValue | null, proposed: PlanValue) => current === null
        ? proposed.body === "first"
        : proposed.body === `${current.body}-successor`,
    };
    const store = new RepositoryDeliveryPlanStore(records.publisher, predecessorAwareCodec);

    await expect(store.publishCurrent(PLAN_ID_1, plan(PLAN_ID_1, "later"), null))
      .resolves.toEqual({ status: "refused", reason: "record-malformed" });
    const first = plan(PLAN_ID_1, "first");
    await expect(store.publishCurrent(PLAN_ID_1, first, null)).resolves.toMatchObject({ status: "ok" });
    await expect(store.publishCurrent(
      PLAN_ID_1,
      plan(PLAN_ID_1, "unrelated"),
      planCodec.digest(first),
    )).resolves.toEqual({ status: "refused", reason: "record-malformed" });
  });

  it("restores a self-valid exact current plan without predecessor history", async () => {
    const records = await planStore();
    const predecessorAwareCodec = {
      ...planCodec,
      isValidSuccessor: (current: PlanValue | null, proposed: PlanValue) => current === null
        ? proposed.body === "first"
        : proposed.body === `${current.body}-successor`,
    };
    const store = new RepositoryDeliveryPlanStore(records.publisher, predecessorAwareCodec);
    const later = plan(PLAN_ID_1, "later");

    await expect(store.restoreExact(PLAN_ID_1, later)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(later) },
    });
    await expect(store.restoreExact(PLAN_ID_1, later)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(later) },
    });
    await expect(store.restoreExact(PLAN_ID_1, plan(PLAN_ID_1, "different")))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
  });

  it("allows only one concurrent successor under the namespace lock", async () => {
    const records = await planStore({
      writeFile: async (path, content) => {
        if (typeof content === "string" && /"body":"(?:second|third)"/u.test(content)) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await atomicWriteFile(path, content);
      },
    });
    const first = plan(PLAN_ID_1, "first");
    const second = plan(PLAN_ID_1, "second");
    const third = plan(PLAN_ID_1, "third");
    await records.store.publishCurrent(PLAN_ID_1, first, null);

    const results = await Promise.all([
      records.store.publishCurrent(PLAN_ID_1, second, planCodec.digest(first)),
      records.store.publishCurrent(PLAN_ID_1, third, planCodec.digest(first)),
    ]);

    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused"))
      .toEqual([{ status: "refused", reason: "version-conflict" }]);
  });

  it("removes only the exact current plan and adopts prior exact removal", async () => {
    const records = await planStore();
    const current = plan(PLAN_ID_1, "current");
    await records.store.publishCurrent(PLAN_ID_1, current, null);

    await expect(records.store.removeCurrent(
      PLAN_ID_1,
      planCodec.digest(plan(PLAN_ID_1, "stale")),
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(records.store.readCurrent(PLAN_ID_1)).resolves.toEqual({ status: "ok", value: current });

    await expect(records.store.removeCurrent(PLAN_ID_1, planCodec.digest(current)))
      .resolves.toEqual({ status: "ok", value: { removed: true } });
    await expect(records.store.removeCurrent(PLAN_ID_1, planCodec.digest(current)))
      .resolves.toEqual({ status: "ok", value: { removed: false } });
  });

  it("leaves no partial plan when publication fails after locking", async () => {
    const crash = new Error("simulated publication crash");
    const records = await planStore({ writeFile: async () => { throw crash; } });

    await expect(records.store.publishCurrent(PLAN_ID_1, plan(PLAN_ID_1, "first"), null))
      .rejects.toBe(crash);
    await expect(records.store.readCurrent(PLAN_ID_1)).resolves.toEqual({ status: "ok", value: null });
  });

  it("enumerates validated current plans in canonical plan-id order", async () => {
    const records = await planStore();
    const second = plan(PLAN_ID_B, "second");
    const first = plan(PLAN_ID_A, "first");
    await records.store.publishCurrent(PLAN_ID_B, second, null);
    await records.store.publishCurrent(PLAN_ID_A, first, null);

    await expect(records.store.enumerateCurrent()).resolves.toEqual({
      status: "ok",
      value: [first, second],
    });
  });

  it("distinguishes malformed payloads from addressed-plan identity mismatches", async () => {
    const records = await planStore();
    await records.publisher.update(
      { root: "delivery", namespace: "plans" },
      `${PLAN_ID_1}.json`,
      () => ({ kind: "write", content: "{", result: undefined }),
    );
    await records.publisher.update(
      { root: "delivery", namespace: "plans" },
      `${PLAN_ID_2}.json`,
      () => ({
        kind: "write",
        content: `${JSON.stringify(plan(PLAN_ID_1, "wrong-address"))}\n`,
        result: undefined,
      }),
    );

    await expect(records.store.readCurrent(PLAN_ID_1))
      .resolves.toEqual({ status: "refused", reason: "record-malformed" });
    await expect(records.store.readCurrent(PLAN_ID_2))
      .resolves.toEqual({ status: "refused", reason: "identity-mismatch" });
  });

  it("refuses a plan namespace containing an invalid entry", async () => {
    const records = await planStore();
    const directory = join(records.commonDir, "arc", "delivery", "plans");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "INVALID.json"), "{}\n", "utf8");

    await expect(records.store.enumerateCurrent())
      .resolves.toEqual({ status: "refused", reason: "namespace-corrupt" });
  });
});
