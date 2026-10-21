/** Protected prior-generation edges refuse atomically and retain an actionable continuation. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { runPause } from "../../../../src/lib/work-unit/verbs/pause-handover.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import type { LocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import type { DecomposeContext } from "../../../../src/lib/decompose/context.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";

function retargetMember(map: CutMap, slug: string): void {
  const member = map.authoring.destinations[1];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = slug;
  map.authoring.internalEdges = [{ from: "member-a", to: slug }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: [slug] };
}

async function holdOwnCut(ctx: DecomposeContext, consumer: StoreRecord): Promise<void> {
  const fresh = await prepareDecomposePreflight(ctx, consumer.reference.owner.name);
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  for (const member of map.authoring.destinations) if (member.kind === "new-member") member.slug = `own-${member.slug}`;
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target")
    allocation.disposition.targetLocator.artifact = allocation.disposition.targetLocator.artifact.replace("member-a", "own-member-a");
  map.authoring.internalEdges = [{ from: "own-member-a", to: "own-member-b" }];
  for (const outgoing of map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["own-member-b"] };
  map.authoring.placement = { kind: "cohort", cohort: "own-group", purpose: "Coordinate the held cut." };
  expect(await runStoreDecomposeAdditive(ctx, consumer.reference.owner.name, "execute", { cutMap: map, cutMapPath: "own-cut.json" }))
    .toMatchObject({ status: "ok" });
}

it.each(["started", "stored-cut", "unmapped", "pause-only"] as const)("leaves a %s edge untouched on refusal and admits its repair", async kind => {
  const h = await createDecomposePlanFixture();
  const prior = await h.seedStub("reused");
  const consumer = await h.seedMeta("consumer", { state: kind === "started" || kind === "pause-only" ? "Active" : "Planning",
    currentWorkflow: kind === "started" || kind === "pause-only" ? "process-task-loop" : null,
    dependsOn: kind === "pause-only" ? [] : ["reused"], ...(kind === "stored-cut" ? { design: ["draft-consumer.md"] } : {}) },
  kind === "started" || kind === "pause-only" ? { kind: "active" } : { kind: "backlog", commitment: "planned" });
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => null,
    writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  const pauseContext = { store: h.store, cwd: "/checkout", baseBranch: "main", locusPorts,
    now: () => new Date("2026-10-19T00:00:00Z"), exec: scriptGitExec([{ match: ["remote"], responses: [{ stdout: "" }, { stdout: "" }] }]).exec };
  if (kind === "pause-only") expect(await runPause(pauseContext, { name: "consumer", identity: h.ctx.identity,
    reason: "Waiting for provider.", waitsOn: "reused" })).toMatchObject({ status: "paused" });
  if (kind === "stored-cut") {
    await h.seed(recordReferences["work-item/draft"](consumer.reference.owner), "# Consumer\n\n## Scope\n\nWork.\n");
    await holdOwnCut(h.ctx, consumer);
  }
  if (kind === "unmapped") {
    const successor = await h.seedStub("successor");
    const owner = successor.reference.owner;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected generation.");
    await h.seedRetiredWorkUnit(prior, { kind: "decompose", successors: [{ name: owner.name, uid: owner.uid }] });
  } else await h.seedRetiredWorkUnit(prior);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  retargetMember(map, "reused");
  const before = lifecycleSuccess(await h.store.version());
  const records = structuredClone([...h.store.state.records.entries()]);
  const result = await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" });
  expect(lifecycleSuccess(await h.store.version())).toEqual(before);
  expect([...h.store.state.records.entries()]).toEqual(records);
  expect(result).toMatchObject({ status: "refused", reason: "store", class: "recoverable", storeRefusal: {
    code: "record-malformed", rule: "work-item.slug-edges",
  } });
  if (result.status !== "refused") throw new Error("Expected refusal.");
  expect(result.remedy.text).toContain(kind === "pause-only" ? "arc pause consumer" : "another slug");
  if (kind === "pause-only") expect(await runPause(pauseContext, { name: "consumer", identity: h.ctx.identity, waitsOn: false }))
    .toMatchObject({ status: "paused" });
  else retargetMember(map, "member-b");
  expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});
