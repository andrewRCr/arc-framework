/** Paused clashes offer repair without selecting a holder or executable lifecycle exit. */
import { expect, it } from "vitest";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../../helpers/store/clash-double.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { runPausedWork } from "../../../src/lib/session-init/paused-work.js";

const now = new Date("2026-10-16T12:00:00.000Z");
async function fixture(other: "unpaused" | "paused" | "backlog" | "both-held" = "unpaused", reviewDue = false) {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("paused", { state: "Planning", owner: "andrew", currentWorkflow: "draft-design" });
  const pause = MetaPauseSchema.parse({ pausedBy: "andrew", since: reviewDue ? "2026-09-01T12:00:00.000Z" : now.toISOString(),
    reason: "Waiting", waitsOn: null, resumeNotes: null, open: false });
  lifecycleSuccess(await h.store.write({ ...recordPut(first, { content: writeMetaPause(first.content, pause) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const second = await h.seedMeta("other", { state: "Planning", owner: "andrew", currentWorkflow: other === "backlog" ? null : "draft-design" },
    other === "backlog" ? { kind: "backlog", commitment: "planned" } : { kind: "active" });
  if (other === "paused" || other === "both-held") lifecycleSuccess(await h.store.write({ ...recordPut(second, {
    content: writeMetaPause(second.content, pause) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const store = createClashDouble(h.store, { slug: "paused", holders: [first.reference, second.reference] });
  return { ...h, store, first, second };
}

it.each(["unpaused", "paused", "backlog", "both-held"] as const)("offers repair alone with the other holder %s", async other => {
  const h = await fixture(other);
  const result = await runPausedWork({ store: h.store, identity: "andrew", reviewAfterDays: 14, now,
    findHoldingCheckout: async () => {
      if (other === "both-held") throw new Error("Two holding checkouts cannot be selected by name");
      return other === "backlog" ? { kind: "none" } : { kind: "held", path: "/holder" };
    } });
  expect(result.items).toHaveLength(other === "paused" || other === "both-held" ? 2 : 1);
  for (const item of result.items) {
    expect(item).toMatchObject({ slug: "paused", marks: [], actions: [{ argv: ["arc", "status", "--json"] }] });
    expect(item.actions).toHaveLength(1);
    expect(item).not.toHaveProperty("reviewPrompt");
    if (h.first.reference.owner.type === "person" || h.second.reference.owner.type === "person") throw new Error("Expected holder identities");
    expect(item.actions[0]?.text).toContain(`arc rename ${h.first.reference.owner.uid} <new-slug>`);
    expect(item.actions[0]?.text).toContain(`arc rename ${h.second.reference.owner.uid} <new-slug>`);
  }
});

it("keeps review-due marks while replacing review prompts and actions with the clash repair", async () => {
  const h = await fixture("unpaused", true);
  const result = await runPausedWork({ store: h.store, identity: "andrew", reviewAfterDays: 14, now, findHoldingCheckout: async () => ({ kind: "none" as const }) });
  expect(result.items).toMatchObject([{ marks: ["review-due"], actions: [{ argv: ["arc", "status", "--json"] }] }]);
  expect(result.items[0]?.actions).toHaveLength(1);
  expect(result.items[0]).not.toHaveProperty("reviewPrompt");
});

it.each(["refused", "missed"] as const)("refuses an unavailable complete clash view and retries after repair, mode=%s", async mode => {
  const h = await fixture(), list = h.store.list.bind(h.store);
  let broken = true;
  h.store.list = async input => {
    if (!broken || input.kind !== "work-item/meta" || input.filter?.locations !== undefined) return list(input);
    if (mode === "refused") return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Whole lifecycle view unavailable.", remedy: { text: "Restore the lifecycle view and retry." } } };
    const result = await list(input);
    return result.status === "ok" && result.result.status === "complete" ? { status: "ok", result: { ...result.result, missed: true } } : result;
  };
  const options = { store: h.store, identity: "andrew", reviewAfterDays: 14, now, findHoldingCheckout: async () => ({ kind: "none" as const }) };
  await expect(runPausedWork(options)).rejects.toThrow(mode === "refused" ? "Whole lifecycle view unavailable" : "missed records");
  broken = false;
  expect((await runPausedWork(options)).items[0]?.actions).toMatchObject([{ argv: ["arc", "status", "--json"] }]);
});
