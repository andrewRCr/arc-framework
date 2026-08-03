import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";

import {
  RepositoryDeliveryAssignmentStore,
  RepositoryDeliveryObservationStore,
  RepositoryDeliveryPlanStore,
} from "../../src/lib/delivery/local-stores.js";
import type {
  DeliveryPayloadCodec,
  DeliveryPlanPayloadCodec,
} from "../../src/lib/delivery/ports.js";
import { atomicWriteFile } from "../../src/lib/fs.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  RepositoryGitCommonStatePublisher,
  type GitCommonStatePublisherIO,
} from "../../src/lib/git-common-state.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

const roots: string[] = [];

const PlanValueSchema = z.strictObject({
  planId: z.string(),
  planDigest: z.string(),
  body: z.string(),
});
type PlanValue = z.infer<typeof PlanValueSchema>;

const RevisionedValueSchema = z.strictObject({
  planId: z.string(),
  body: z.string(),
});
type RevisionedValue = z.infer<typeof RevisionedValueSchema>;

const planCodec: DeliveryPlanPayloadCodec<PlanValue> = {
  decode: (value) => {
    const parsed = PlanValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
  digest: (value) => canonicalDigest({ planDigest: value.planDigest }),
};

const revisionedCodec: DeliveryPayloadCodec<RevisionedValue> = {
  decode: (value) => {
    const parsed = RevisionedValueSchema.safeParse(value);
    return parsed.success
      ? { status: "decoded", value: parsed.data }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function stores(io: Partial<GitCommonStatePublisherIO> = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-delivery-local-stores-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  const publisher = new RepositoryGitCommonStatePublisher(exec, root, io);
  return {
    root,
    commonDir,
    publisher,
    plans: new RepositoryDeliveryPlanStore(publisher, planCodec),
    assignments: new RepositoryDeliveryAssignmentStore(publisher, revisionedCodec),
    observations: new RepositoryDeliveryObservationStore(publisher, revisionedCodec),
  };
}

function plan(planId: string, body: string): PlanValue {
  return {
    planId,
    planDigest: canonicalDigest({ planId, body }),
    body,
  };
}

describe("repository delivery record stores", () => {
  it("publishes a first plan and only accepts a successor naming the current digest", async () => {
    const records = await stores();
    const first = plan("plan-1", "first");
    const second = plan("plan-1", "second");
    const stale = plan("plan-1", "stale");

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "ok",
      value: null,
    });
    await expect(records.plans.publishCurrent("plan-1", first, null)).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(first) },
    });
    await expect(records.plans.publishCurrent(
      "plan-1",
      second,
      planCodec.digest(first),
    )).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(second) },
    });
    await expect(records.plans.publishCurrent(
      "plan-1",
      stale,
      planCodec.digest(first),
    )).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "ok",
      value: second,
    });
  });

  it.each(["assignments", "observations"] as const)(
    "increments %s under an expected integer revision",
    async (kind) => {
      const records = await stores();
      const store = records[kind];
      const first = { planId: "plan-1", body: "first" };
      const second = { planId: "plan-1", body: "second" };

      await expect(store.read("plan-1")).resolves.toEqual({ status: "ok", value: null });
      await expect(store.publish("plan-1", first, 0)).resolves.toEqual({
        status: "ok",
        value: { revision: 1, value: first },
      });
      await expect(store.publish("plan-1", second, 1)).resolves.toEqual({
        status: "ok",
        value: { revision: 2, value: second },
      });
      await expect(store.publish("plan-1", { planId: "plan-1", body: "stale" }, 1))
        .resolves.toEqual({ status: "refused", reason: "version-conflict" });
      await expect(store.read("plan-1")).resolves.toEqual({
        status: "ok",
        value: { revision: 2, value: second },
      });
    },
  );

  it("treats byte-identical republishes as idempotent before version checks", async () => {
    const records = await stores();
    const firstPlan = plan("plan-1", "first");
    const revisioned = { planId: "plan-1", body: "first" };
    await records.plans.publishCurrent("plan-1", firstPlan, null);
    await records.assignments.publish("plan-1", revisioned, 0);
    await records.observations.publish("plan-1", revisioned, 0);

    const paths = [
      join(records.commonDir, "arc", "delivery", "plans", "plan-1.json"),
      join(records.commonDir, "arc", "delivery", "assignments", "plan-1.json"),
      join(records.commonDir, "arc", "delivery", "observations", "plan-1.json"),
    ];
    const before = await Promise.all(paths.map(async (path) => readFile(path, "utf8")));

    await expect(records.plans.publishCurrent(
      "plan-1",
      firstPlan,
      canonicalDigest({ stale: true }),
    )).resolves.toEqual({
      status: "ok",
      value: { currentDigest: planCodec.digest(firstPlan) },
    });
    await expect(records.assignments.publish("plan-1", revisioned, 99)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: revisioned },
    });
    await expect(records.observations.publish("plan-1", revisioned, 99)).resolves.toEqual({
      status: "ok",
      value: { revision: 1, value: revisioned },
    });
    await expect(Promise.all(paths.map(async (path) => readFile(path, "utf8")))).resolves.toEqual(before);
  });

  it("allows only one of two concurrent plan successors to become current", async () => {
    const records = await stores({
      writeFile: async (path, content) => {
        if (typeof content === "string" && /"body":"(?:second|third)"/u.test(content)) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await atomicWriteFile(path, content);
      },
    });
    const first = plan("plan-1", "first");
    const second = plan("plan-1", "second");
    const third = plan("plan-1", "third");
    await records.plans.publishCurrent("plan-1", first, null);

    const results = await Promise.all([
      records.plans.publishCurrent("plan-1", second, planCodec.digest(first)),
      records.plans.publishCurrent("plan-1", third, planCodec.digest(first)),
    ]);

    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(results.filter((result) => result.status === "refused")).toEqual([
      { status: "refused", reason: "version-conflict" },
    ]);
    const current = await records.plans.readCurrent("plan-1");
    expect(current).toMatchObject({ status: "ok" });
    if (current.status !== "ok" || current.value === null) return;
    expect([second, third]).toContainEqual(current.value);
  });

  it.each(["assignments", "observations"] as const)(
    "allows only one concurrent %s successor under the namespace lock",
    async (kind) => {
      const records = await stores({
        writeFile: async (path, content) => {
          if (typeof content === "string" && /"body":"(?:second|third)"/u.test(content)) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          await atomicWriteFile(path, content);
        },
      });
      const store = records[kind];
      await store.publish("plan-1", { planId: "plan-1", body: "first" }, 0);

      const results = await Promise.all([
        store.publish("plan-1", { planId: "plan-1", body: "second" }, 1),
        store.publish("plan-1", { planId: "plan-1", body: "third" }, 1),
      ]);

      expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
      expect(results.filter((result) => result.status === "refused")).toEqual([
        { status: "refused", reason: "version-conflict" },
      ]);
    },
  );

  it("leaves no partial record when publication fails after locking", async () => {
    const crash = new Error("simulated publication crash");
    const records = await stores({
      writeFile: async () => {
        throw crash;
      },
    });

    await expect(records.plans.publishCurrent("plan-1", plan("plan-1", "first"), null))
      .rejects.toBe(crash);
    await expect(records.assignments.publish(
      "plan-2",
      { planId: "plan-2", body: "first" },
      0,
    )).rejects.toBe(crash);
    await expect(records.observations.publish(
      "plan-3",
      { planId: "plan-3", body: "first" },
      0,
    )).rejects.toBe(crash);

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({ status: "ok", value: null });
    await expect(records.assignments.read("plan-2")).resolves.toEqual({ status: "ok", value: null });
    await expect(records.observations.read("plan-3")).resolves.toEqual({ status: "ok", value: null });
  });

  it("enumerates validated current plans in canonical plan-id order", async () => {
    const records = await stores();
    const second = plan("plan-b", "second");
    const first = plan("plan-a", "first");
    await records.plans.publishCurrent("plan-b", second, null);
    await records.plans.publishCurrent("plan-a", first, null);

    await expect(records.plans.enumerateCurrent()).resolves.toEqual({
      status: "ok",
      value: [first, second],
    });
  });

  it("distinguishes malformed payloads from addressed-plan identity mismatches", async () => {
    const records = await stores();
    await records.publisher.update(
      { root: "delivery", namespace: "plans" },
      "plan-1.json",
      () => ({ kind: "write", content: "{", result: undefined }),
    );
    await records.publisher.update(
      { root: "delivery", namespace: "assignments" },
      "plan-2.json",
      () => ({
        kind: "write",
        content: `${JSON.stringify({
          schemaVersion: 1,
          semanticsVersion: "delivery-assignment-store/v1",
          planId: "plan-2",
          revision: 1,
          value: { planId: "other-plan", body: "assignment" },
        })}\n`,
        result: undefined,
      }),
    );
    await records.publisher.update(
      { root: "delivery", namespace: "observations" },
      "plan-3.json",
      () => ({
        kind: "write",
        content: `${JSON.stringify({
          schemaVersion: 1,
          semanticsVersion: "delivery-observation-store/v1",
          planId: "plan-3",
          revision: 1,
          value: { planId: "plan-3", body: 3 },
        })}\n`,
        result: undefined,
      }),
    );

    await expect(records.plans.readCurrent("plan-1")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
    await expect(records.assignments.read("plan-2")).resolves.toEqual({
      status: "refused",
      reason: "identity-mismatch",
    });
    await expect(records.observations.read("plan-3")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
  });

  it("refuses a plan namespace containing an invalid record entry", async () => {
    const records = await stores();
    const directory = join(records.commonDir, "arc", "delivery", "plans");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "INVALID.json"), "{}\n", "utf8");

    await expect(records.plans.enumerateCurrent()).resolves.toEqual({
      status: "refused",
      reason: "namespace-corrupt",
    });
  });
});
