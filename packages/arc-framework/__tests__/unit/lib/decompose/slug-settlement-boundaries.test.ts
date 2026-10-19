/** Settlement leaves protected recipients untouched and preserves unavailable observations. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { planDecomposeSlugSettlements } from "../../../../src/lib/decompose/slug-settlement.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

it.each(["origin", "started", "stored-cut"] as const)("leaves a %s recipient's edge for the slug guard", async protectedKind => {
  const h = await createDecomposePlanFixture();
  const consumer = protectedKind === "origin" ? h.primary : await h.seedMeta("consumer", {
    state: "Planning", currentWorkflow: protectedKind === "started" ? "draft-design" : null,
    dependsOn: ["provider"], design: ["draft-consumer.md"],
  }, protectedKind === "started" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  if (protectedKind === "stored-cut") {
    await h.seed(recordReferences["work-item/draft"](consumer.reference.owner), "# Consumer\n\n## Scope\n\nWork.\n");
    const own = await prepareDecomposePreflight(h.ctx, "consumer");
    if (own.status === "refused") throw new Error(JSON.stringify(own));
    await h.seed(recordReferences["work-item/cut-map"](consumer.reference.owner), writeCutMapRecord(completeCutMapFixture(own.result.machine)));
  }
  await h.seedRetiredWorkUnit(h.provider);
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "provider";
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect(await planDecomposeSlugSettlements(h.ctx, h.map, fresh.result.acquired)).toMatchObject({ status: "ok", result: { settlements: [] } });
});

it("preserves a failed dependent read and plans the edge after the store recovers", async () => {
  const h = await createDecomposePlanFixture();
  const consumer = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["provider"] },
    { kind: "backlog", commitment: "planned" });
  await h.seedRetiredWorkUnit(h.provider);
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "provider";
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const refusal: StoreRefusal = { code: "lock-held", class: "recoverable", lock: "consumer", condition: "Consumer is unavailable.",
    remedy: { text: "Release the consumer lock.", argv: ["repair", "consumer"] } };
  const read = h.store.read.bind(h.store);
  h.store.read = async input => input.reference.kind === "work-item/meta" && input.reference.owner.name === "consumer"
    ? { status: "refused", refusal } : read(input);
  expect(await planDecomposeSlugSettlements(h.ctx, h.map, fresh.result.acquired)).toMatchObject({ status: "refused",
    reason: "store", class: refusal.class, remedy: refusal.remedy, storeRefusal: refusal });
  h.store.read = read;
  expect(await planDecomposeSlugSettlements(h.ctx, h.map, fresh.result.acquired)).toMatchObject({ status: "ok", result: {
    settlements: [{ primary: consumer, edge: "provider", disposition: { kind: "drop" } }],
  } });
});
