/** Reused member names settle prior-generation stub edges against the before-state. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { planDecomposeSlugSettlements } from "../../../../src/lib/decompose/slug-settlement.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

it.each(["shipped", "abandoned", "decomposed"] as const)("plans a %s provider's prior stub edge without writing records", async ended => {
  const h = await createDecomposePlanFixture();
  const prior = await h.seedStub("reused");
  const dependent = await h.seedMeta("consumer", { state: "Planning", currentWorkflow: null, dependsOn: ["reused"] },
    { kind: "backlog", commitment: "planned" });
  const replacement = await h.seedStub("replacement");
  const old = prior.reference.owner, consumer = dependent.reference.owner, target = replacement.reference.owner;
  if (old.type !== "work-item" || consumer.type !== "work-item" || target.type !== "work-item"
    || old.uid === undefined || consumer.uid === undefined || target.uid === undefined) throw new Error("Expected generations.");
  if (ended === "shipped") lifecycleSuccess(await h.store.write({ ...recordPut(prior, {
    content: renderMetaFile("reused", { state: "Shipped", owner: h.ctx.identity, currentWorkflow: null,
      completed: "2026-10-19", prUrl: "https://example.test/pull/1" }), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  else await h.seedRetiredWorkUnit(prior, ended === "abandoned" ? { kind: "abandon", successors: [] } : {
    kind: "decompose", successors: [{ name: target.name, uid: target.uid }], incoming: [{ dependent: { name: consumer.name, uid: consumer.uid },
      disposition: { kind: "replace", replacementTargets: [{ name: target.name, uid: target.uid }] } }],
  });
  const member = h.map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "reused";
  h.map.authoring.internalEdges = [{ from: "member-a", to: "reused" }];
  for (const entry of h.map.authoring.outgoingDispositions) entry.disposition = { kind: "targets", targets: ["reused"] };
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const version = lifecycleSuccess(await h.store.version());
  const result = await planDecomposeSlugSettlements(h.ctx, h.map, fresh.result.acquired);
  expect(result).toMatchObject({ status: "ok", result: { settlements: [{ primary: dependent, edge: "reused",
    priorTarget: { name: "reused", uid: old.uid }, disposition: ended === "decomposed"
      ? { kind: "replace", replacementTargets: ["replacement"] } : { kind: "drop" } }] } });
  expect(lifecycleSuccess(await h.store.version())).toEqual(version);
});
