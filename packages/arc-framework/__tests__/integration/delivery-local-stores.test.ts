import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryAssuranceStore } from "../../src/lib/delivery/assurance-store.js";
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
    assurance: new RepositoryDeliveryAssuranceStore(publisher, revisionedCodec),
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

function okValue<T>(
  result: { readonly status: "ok"; readonly value: T } | { readonly status: "refused"; readonly reason: string },
): T {
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error(`expected ok result, received ${result.reason}`);
  return result.value;
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

  it("appends assurance entries against the current predecessor digest", async () => {
    const records = await stores();
    const first = { planId: "plan-1", body: "first" };
    const second = { planId: "plan-1", body: "second" };

    const firstResult = await records.assurance.append("plan-1", first, null);
    expect(firstResult).toMatchObject({
      status: "ok",
      value: { predecessorDigest: null, value: first },
    });
    const firstEntry = okValue(firstResult);
    const secondResult = await records.assurance.append(
      "plan-1",
      second,
      firstEntry.entryDigest,
    );
    expect(secondResult).toMatchObject({
      status: "ok",
      value: { predecessorDigest: firstEntry.entryDigest, value: second },
    });
    await expect(records.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "stale" },
      firstEntry.entryDigest,
    )).resolves.toEqual({ status: "refused", reason: "predecessor-conflict" });
  });

  it("binds assurance entry digests to both payload and predecessor", async () => {
    const firstRecords = await stores();
    const secondRecords = await stores();
    const thirdRecords = await stores();
    const target = { planId: "plan-1", body: "target" };

    const withoutPredecessor = await firstRecords.assurance.append("plan-1", target, null);
    const differentPayload = await secondRecords.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "different" },
      null,
    );
    const prefix = await thirdRecords.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "prefix" },
      null,
    );
    const withoutPredecessorEntry = okValue(withoutPredecessor);
    const differentPayloadEntry = okValue(differentPayload);
    const prefixEntry = okValue(prefix);
    const withPredecessor = await thirdRecords.assurance.append(
      "plan-1",
      target,
      prefixEntry.entryDigest,
    );
    const withPredecessorEntry = okValue(withPredecessor);

    expect(withoutPredecessorEntry.entryDigest).not.toBe(differentPayloadEntry.entryDigest);
    expect(withoutPredecessorEntry.entryDigest).not.toBe(withPredecessorEntry.entryDigest);
  });

  it("treats an identical assurance append replay as idempotent", async () => {
    const records = await stores();
    const value = { planId: "plan-1", body: "first" };
    const first = await records.assurance.append("plan-1", value, null);
    const replay = await records.assurance.append("plan-1", value, null);

    expect(replay).toEqual(first);
    await expect(records.assurance.read("plan-1")).resolves.toMatchObject({
      status: "ok",
      value: { entries: [expect.objectContaining({ value })] },
    });
  });

  it("exports and imports an assurance chain without changing its entries", async () => {
    const source = await stores();
    const destination = await stores();
    const first = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "first" },
      null,
    );
    const firstEntry = okValue(first);
    await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "second" },
      firstEntry.entryDigest,
    );
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");

    await expect(destination.assurance.importChain("plan-1", exportedChain)).resolves.toEqual(exported);
    await expect(destination.assurance.exportChain("plan-1")).resolves.toEqual(exported);
  });

  it("refuses an invalid assurance import without partially applying it", async () => {
    const source = await stores();
    const destination = await stores();
    const first = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "first" },
      null,
    );
    okValue(first);
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");
    const invalid = {
      ...exportedChain,
      entries: [{ ...exportedChain.entries[0]!, predecessorDigest: canonicalDigest("wrong") }],
    };

    await expect(destination.assurance.importChain("plan-1", invalid)).resolves.toEqual({
      status: "refused",
      reason: "chain-invalid",
    });
    await expect(destination.assurance.read("plan-1")).resolves.toEqual({ status: "ok", value: null });
  });

  it("refuses assurance import when the destination already has a chain", async () => {
    const source = await stores();
    const destination = await stores();
    const sourceEntry = await source.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "source" },
      null,
    );
    const destinationEntry = await destination.assurance.append(
      "plan-1",
      { planId: "plan-1", body: "destination" },
      null,
    );
    okValue(sourceEntry);
    okValue(destinationEntry);
    const exported = await source.assurance.exportChain("plan-1");
    const exportedChain = okValue(exported);
    expect(exportedChain).not.toBeNull();
    if (exportedChain === null) throw new Error("expected exported assurance chain");

    await expect(destination.assurance.importChain("plan-1", exportedChain)).resolves.toEqual({
      status: "refused",
      reason: "import-nonempty",
    });
    await expect(destination.assurance.read("plan-1")).resolves.toMatchObject({
      status: "ok",
      value: { entries: [{ value: { planId: "plan-1", body: "destination" } }] },
    });
  });

  it("distinguishes malformed, mismatched, and invalid persisted assurance chains", async () => {
    const records = await stores();
    const assuranceLocation = { root: "delivery", namespace: "assurance" } as const;
    await records.publisher.update(assuranceLocation, "plan-1.json", () => ({
      kind: "write",
      content: "{",
      result: undefined,
    }));
    await records.publisher.update(assuranceLocation, "plan-2.json", () => ({
      kind: "write",
      content: `${JSON.stringify({
        schemaVersion: 1,
        semanticsVersion: "delivery-assurance-store/v1",
        planId: "other-plan",
        entries: [],
        tailDigest: null,
      })}\n`,
      result: undefined,
    }));
    const validEntry = okValue(await records.assurance.append(
      "plan-3",
      { planId: "plan-3", body: "value" },
      null,
    ));
    await records.publisher.update(assuranceLocation, "plan-3.json", (raw) => {
      if (raw === null) throw new Error("expected persisted assurance chain");
      const envelope = JSON.parse(raw) as Record<string, unknown>;
      return {
        kind: "write",
        content: `${JSON.stringify({ ...envelope, tailDigest: canonicalDigest("wrong") })}\n`,
        result: undefined,
      };
    });

    await expect(records.assurance.read("plan-1")).resolves.toEqual({
      status: "refused",
      reason: "record-malformed",
    });
    await expect(records.assurance.read("plan-2")).resolves.toEqual({
      status: "refused",
      reason: "identity-mismatch",
    });
    await expect(records.assurance.read("plan-3")).resolves.toEqual({
      status: "refused",
      reason: "chain-invalid",
    });
    expect(validEntry.entryDigest).not.toBe(canonicalDigest("wrong"));
  });
});
