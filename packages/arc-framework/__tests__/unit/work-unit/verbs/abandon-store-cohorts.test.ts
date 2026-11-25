/** Landed abandonments report retirement commands only from complete surviving holdings. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences, type Store } from "../../../../src/lib/store/index.js";
import { createUserIOContext } from "../../../../src/lib/io-context.js";
import { buildExecutorContext } from "../../../../src/lib/work-unit/executor-context.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";

async function fixture() {
  const h = createLifecycleHarness();
  const group = await h.seed(recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "group" })),
    "# Cohort: `group`\n\n**Purpose:** Coordinate.\n");
  const subject = await h.seedMeta("subject", { state: "Planning", currentWorkflow: null, cohort: "group" },
    { kind: "backlog", commitment: "planned" });
  return { ...h, group, subject };
}

function abandon(store: Store) {
  const io = { ...createUserIOContext(), exec: async () => { throw new Error("No Git operation for an unheld branchless stub."); } };
  const executor = buildExecutorContext({ cwd: "/repo", io, store, identity: "test-user", teamMode: false, internalTemplateDir: "/templates",
    locusPorts: { ...createDefaultLocusPorts(), findHoldingCheckout: async () => ({ kind: "none" as const }) } });
  return runStoreAbandon({ executor }, { name: "subject", confirmed: true });
}

it("omits retirement commands while a surviving open record holds the cohort", async () => {
  const h = await fixture(), keeper = await h.seedMeta("keeper", { cohort: "group" });
  const result = await abandon(h.store);
  expect(result).toMatchObject({ status: "abandoned", notices: [] });
  expect(await h.store.read({ reference: h.subject.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: keeper.reference }))).toEqual(keeper);
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(h.group);
});

it.each([false, true])("keeps abandonment successful when its post-batch membership read fails, throws=%s", async throws => {
  const h = await fixture();
  let landed = false;
  const store: Store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") {
      const batch: Store["batch"] = async input => { const result = await target.batch(input); landed = result.status === "ok"; return result; };
      return batch;
    }
    if (key === "list") {
      const list: Store["list"] = async input => {
        if (!landed || input.kind !== "work-item/meta") return target.list(input);
        if (throws) throw new Error("Membership transport is down.");
        return { status: "ok", result: { status: "unreadable", condition: "Membership transport is down.", remedy: { text: "Restore the transport." } } };
      };
      return list;
    }
    const value: unknown = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await abandon(store);
  expect(result).toMatchObject({ status: "abandoned", notices: [expect.stringContaining("Membership transport is down.")] });
  expect(await h.store.read({ reference: h.subject.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.group.reference }))).toEqual(h.group);
});
