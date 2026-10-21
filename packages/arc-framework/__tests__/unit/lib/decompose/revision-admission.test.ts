/** Revised-map admission retains current-cut identity and repeats authoring checks. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { admitDecomposeRevision } from "../../../../src/lib/decompose/revision-admission.js";
import { completeCutMapFixture, rebindCutFixture } from "../../../fixtures/decompose-v4.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";
import { runStoreDecomposeRevisionStarter } from "../../../../src/lib/decompose/revision-starter.js";
import { DecomposeRevisionStarterReportSchema } from "../../../../src/lib/decompose/revision-starter-report.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";

it("admits authenticated retained member names and carries the cut-created cohort's Purpose without writing", async () => {
  const h = await createDecomposeTerminalFixture();
  const before = lifecycleSuccess(await h.store.version());
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "ok", result: { map: h.map, cohorts: { writes: [] }, ownedCohorts: [{ path: "group" }] } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

it.each(["decode", "version", "machine"] as const)("refuses a revised %s boundary and admits its correction", async kind => {
  const h = await createDecomposeTerminalFixture();
  const map = structuredClone(h.map);
  if (kind === "decode") map.authoring.sourceAllocations.pop();
  else if (kind === "machine") {
    const unit = map.machine.sourceUnits[0];
    if (unit === undefined) throw new Error("Expected source unit.");
    unit.contentDigest = `sha256:${"a".repeat(64)}`;
    rebindCutFixture(map);
  }
  const cutMap = kind === "version" ? { ...map, schemaVersion: 3 } : map;
  const before = lifecycleSuccess(await h.store.version());
  const refusal = await admitDecomposeRevision(h.ctx, "origin", { cutMap, cutMapPath: "revised.json" });
  expect(refusal).toMatchObject({ status: "refused", reason: kind === "decode" ? "authoring-identity"
    : kind === "version" ? "unsupported-version" : "stale-machine", class: "recoverable", locus: expect.any(String) });
  if (refusal.status === "refused" && kind !== "decode") expect(refusal.remedy.text).toContain("--revise");
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
});

it("names both additive modes when a revision has no stored map", async () => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: completeCutMapFixture(fresh.result.machine), cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "no-stored-map", remedy: { text: expect.stringContaining("--execute <cut-map> or --extract <cut-map>") } });
});

it.each(["work-item", "open-cohort", "former-slug", "completed-cohort", "map-collision", "origin-cohort"] as const)(
  "repeats revision name admission for a %s and admits a corrected map", async kind => {
    const h = await createDecomposeTerminalFixture();
    const map = structuredClone(h.map);
    if (kind === "work-item") await h.seedStub("taken");
    else if (kind === "open-cohort") await h.seedCohort("taken");
    else if (kind === "former-slug") await h.seedRenamedWorkUnit("taken", "holder");
    else if (kind === "completed-cohort") await h.seedCohort("taken", true);
    if (kind === "map-collision") {
      map.authoring.destinations.push({ kind: "new-member", destinationId: "z-new", slug: "new-group", workClass: "Light" });
      map.authoring.placement = { kind: "cohort", cohort: "new-group", purpose: "Coordinate the revised cut." };
    } else if (kind === "completed-cohort" || kind === "origin-cohort") {
      map.authoring.placement = { kind: "cohort", cohort: kind === "completed-cohort" ? "taken" : "origin", purpose: "Coordinate the revised cut." };
    } else map.authoring.destinations.push({ kind: "new-member", destinationId: "z-new", slug: "taken", workClass: "Light" });
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
      .toMatchObject({ status: "refused", reason: kind === "origin-cohort" ? "cohort-origin-name" : "name-collision", class: "recoverable" });
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
  });

it.each(["ownership", "locator", "purpose-new", "purpose-reused", "placement", "provider"] as const)(
  "repeats the revised map's %s rule and admits its repair", async kind => {
    const h = await createDecomposeTerminalFixture();
    const map = structuredClone(h.map);
    const allocation = map.authoring.sourceAllocations[0];
    if (allocation?.disposition.kind !== "target") throw new Error("Expected allocation.");
    if (kind === "ownership") allocation.ownership = "cohort-shared";
    else if (kind === "locator") allocation.disposition.targetLocator.artifact = "draft-unrelated.md";
    else if (kind === "purpose-new") map.authoring.placement = { kind: "cohort", cohort: "new-group" };
    else if (kind === "purpose-reused") {
      await h.seedCohort("existing-group");
      map.authoring.placement = { kind: "cohort", cohort: "existing-group", purpose: "An existing document." };
    } else if (kind === "placement") {
      map.authoring.destinations.push({ kind: "cohort-coordination", destinationId: "z-coordination", cohort: "elsewhere" });
    } else if (kind === "provider") map.authoring.externalEdges = [{ from: "member-a", to: "missing-provider" }];
    const reason = { ownership: "incompatible-source-ownership", locator: "incompatible-allocation-locator", "purpose-new": "purpose",
      "purpose-reused": "purpose", placement: "unexpected-coordination-location", provider: "unknown-external-target" }[kind];
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
      .toMatchObject({ status: "refused", reason, class: "recoverable" });
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
  });

function addHome(map: CutMap, target: Extract<CutMap["authoring"]["destinations"][number], { kind: "existing-home" }>["target"], artifact = "draft-home.md") {
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.push({ kind: "existing-home", destinationId: "z-home", target });
  const allocation = map.authoring.sourceAllocations[0];
  if (allocation?.disposition.kind !== "target") throw new Error("Expected allocation.");
  allocation.disposition.destinationId = "z-home";
  allocation.disposition.targetLocator.artifact = artifact;
}

it.each(["absent", "completed", "errand", "document", "own-meta", "own-tasks", "foreign-draft"] as const)(
  "refuses a revision's %s home and admits a corrected destination", async kind => {
    const h = await createDecomposeTerminalFixture();
    if (kind === "completed") await h.seedCompletedWorkUnit("home");
    else if (kind === "errand") await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "home" })),
      JSON.stringify({ version: 3, slug: "home", claimId: "a".repeat(32), createdAt: "2026-10-19T00:00:00Z",
        updatedAt: "2026-10-19T00:00:00Z", owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work",
        branch: "chore/home", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }), { kind: "active" });
    else if (kind.startsWith("own-") || kind === "foreign-draft") await h.seedMeta("home", { owner: kind === "foreign-draft" ? "another-owner" : h.ctx.identity });
    const map = structuredClone(h.map);
    addHome(map, kind === "document" ? { kind: "document", path: "design/shared.md" } : { kind: "work-unit", slug: "home" },
      kind === "own-meta" ? "meta-home.md" : kind === "own-tasks" ? "tasks-home.md" : kind === "document" ? "shared.md" : "draft-home.md");
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" })).toMatchObject({ status: "refused",
      reason: kind === "document" ? "document-home" : kind.startsWith("own-") || kind === "foreign-draft" ? "unwritable-target" : "existing-home" });
    expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
  });

async function freshMap(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>): Promise<CutMap> {
  const result = await runStoreDecomposeRevisionStarter(h.ctx, "origin");
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  const report = DecomposeRevisionStarterReportSchema.parse(JSON.parse(result.result));
  return report.status === "carried" ? report.map : completeCutMapFixture(report.starter.machine);
}

it("refuses a revision's ended provider and admits dropping the written edge", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  const map = await freshMap(h);
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "provider", remedy: { text: expect.stringContaining("drop") } });
  for (const disposition of map.authoring.outgoingDispositions) disposition.disposition = { kind: "drop", reason: "Ended provider." };
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
});

it("refuses a revision's new edge on a started home and admits leaving it to its owner", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  await h.seedMeta("home");
  const map = structuredClone(h.map);
  addHome(map, { kind: "work-unit", slug: "home" });
  for (const disposition of map.authoring.outgoingDispositions) disposition.disposition = { kind: "targets", targets: ["home"] };
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }))
    .toMatchObject({ status: "refused", reason: "started-edge", remedy: { text: expect.stringContaining("owner") } });
  for (const disposition of map.authoring.outgoingDispositions) disposition.disposition = { kind: "drop", reason: "Owner will add the edge." };
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
});

it("refuses adding a member under the origin's own provider slug until that edge is settled and rebound", async () => {
  const h = await createDecomposeTerminalFixture({ provider: true });
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "provider")));
  const map = await freshMap(h);
  map.authoring.destinations.push({ kind: "new-member", destinationId: "z-provider", slug: "provider", workClass: "Light" });
  for (const disposition of map.authoring.outgoingDispositions) disposition.disposition = { kind: "drop", reason: "No inherited provider." };
  const result = await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" });
  expect(result).toMatchObject({ status: "refused", reason: "provider", remedy: { text: expect.stringContaining("--revise") } });
  const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
  await h.handEdit(origin, writeMetaDependsOn(origin.content, []));
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" })).toMatchObject({ reason: "stale-machine" });
  const repaired = await freshMap(h);
  repaired.authoring.destinations.push({ kind: "new-member", destinationId: "z-provider", slug: "provider", workClass: "Light" });
  expect(await admitDecomposeRevision(h.ctx, "origin", { cutMap: repaired, cutMapPath: "revised.json" })).toMatchObject({ status: "ok" });
});
