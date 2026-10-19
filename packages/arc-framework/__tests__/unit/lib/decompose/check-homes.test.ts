/** Existing homes resolve by identity while allocation rights follow state and ownership. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { checkDecomposeHomes } from "../../../../src/lib/decompose/check-homes.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";

async function homeMap(h: Awaited<ReturnType<typeof createDecomposeOriginFixture>>, slug = "home", artifact = `draft-${slug}.md`) {
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.shape = "heterogeneous";
  map.authoring.destinations.unshift({ kind: "existing-home", destinationId: "home", target: { kind: "work-unit", slug } });
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target") allocation.disposition = { kind: "target", destinationId: "home",
      targetLocator: { ...allocation.disposition.targetLocator, artifact } };
  }
  expect(decodeCutMap(map).status).toBe("accepted");
  return map;
}

it.each(["absent", "completed", "errand"] as const)("refuses a home that is %s and admits another open work unit", async state => {
  const h = await createDecomposeOriginFixture();
  if (state === "completed") await h.seedCompletedWorkUnit("home");
  if (state === "errand") await h.seed(recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "home" })),
    JSON.stringify({ version: 3, slug: "home", claimId: "a".repeat(32), createdAt: "2026-10-19T00:00:00Z",
      updatedAt: "2026-10-19T00:00:00Z", owner: "test-user", kind: "errand", purpose: "errand", intent: "Useful work",
      branch: "chore/home", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null }),
    { kind: "active" });
  const refused = await checkDecomposeHomes(h.ctx, await homeMap(h));
  expect(refused).toMatchObject({ status: "refused", reason: "existing-home", class: "recoverable",
    locus: "authoring.destinations.0.target" });
  if (refused.status !== "refused") throw new Error("Expected invalid home.");
  expect(refused.remedy.text).toContain("another");
  const home = await h.seedStub("available-home");
  const repaired = await checkDecomposeHomes(h.ctx, await homeMap(h, "available-home"));
  expect(repaired).toMatchObject({ status: "ok", result: [{ destinationId: "home", primary: home, started: false,
    anotherOwner: false }] });
});

it.each([
  { artifact: "meta-home.md", foreign: false }, { artifact: "tasks-home.md", foreign: false },
  { artifact: "draft-home.md", foreign: true }, { artifact: "spec-home.md", foreign: true },
  { artifact: "notes-home.md", foreign: true }, { artifact: "analysis-home.md", foreign: true },
])("refuses $artifact allocation with foreign ownership $foreign and admits the same content on a stub", async ({ artifact, foreign }) => {
  const h = await createDecomposeOriginFixture();
  await h.seedMeta("home", { owner: foreign ? "other-owner" : h.ctx.identity });
  const refused = await checkDecomposeHomes(h.ctx, await homeMap(h, "home", artifact));
  expect(refused).toMatchObject({ status: "refused", reason: "unwritable-target", class: "recoverable",
    locus: "authoring.sourceAllocations.0.disposition.targetLocator" });
  if (refused.status !== "refused") throw new Error("Expected an allocation-rights refusal.");
  expect(refused.remedy.text).toContain(foreign ? "inbound entry" : "draft, spec, or notes");
  const stub = await h.seedMeta("available-home", { state: "Planning", owner: "other-owner", currentWorkflow: null },
    { kind: "backlog", commitment: "planned" });
  expect(await checkDecomposeHomes(h.ctx, await homeMap(h, "available-home", artifact.replace("home.md", "available-home.md"))))
    .toMatchObject({ status: "ok", result: [{ destinationId: "home", primary: stub, started: false, anotherOwner: true }] });
});

it("refuses a document home and admits a work-unit destination", async () => {
  const h = await createDecomposeOriginFixture();
  const map = await homeMap(h);
  const home = map.authoring.destinations[0];
  if (home?.kind !== "existing-home") throw new Error("Expected a home.");
  home.target = { kind: "document", path: "design/shared.md" };
  const refused = await checkDecomposeHomes(h.ctx, map);
  expect(refused).toMatchObject({ status: "refused", reason: "document-home", class: "recoverable",
    locus: "authoring.destinations.0.target" });
  if (refused.status !== "refused") throw new Error("Expected document refusal.");
  expect(refused.remedy.text).toContain("work item or member");
  await h.seedStub("home");
  expect(await checkDecomposeHomes(h.ctx, await homeMap(h))).toMatchObject({ status: "ok" });
});

it.each(["draft-home.md", "spec-home.md", "notes-home.md", "analysis-home.md", "spec-home-prd.md", "spec-home-rfc.md"])(
  "admits %s on the operator's started home before the target content exists", async artifact => {
    const h = await createDecomposeOriginFixture();
    const home = await h.seedMeta("home");
    const map = await homeMap(h, "home", artifact);
    expect(await checkDecomposeHomes(h.ctx, map)).toMatchObject({ status: "ok", result: [{ primary: home,
      started: true, anotherOwner: false }] });
  });

it("resolves a draft-block home's former slug to its current generation before target authoring", async () => {
  const h = await createDecomposeOriginFixture();
  const home = await h.seedRenamedWorkUnit("old-home", "home");
  const map = await homeMap(h, "old-home");
  const destination = map.authoring.destinations[0];
  const allocation = map.authoring.sourceAllocations[0];
  if (destination?.kind !== "existing-home" || allocation?.disposition.kind !== "target") throw new Error("Expected allocation.");
  destination.target = { kind: "draft-block", slug: "old-home", locator: allocation.disposition.targetLocator };
  for (const entry of map.authoring.sourceAllocations.slice(1)) entry.disposition = { kind: "drop", reason: "No destination content required." };
  expect(await checkDecomposeHomes(h.ctx, map)).toMatchObject({ status: "ok", result: [{ primary: home,
    started: false, anotherOwner: false }] });
});

it("preserves a home lookup failure's complete repair and admits the home after recovery", async () => {
  const h = await createDecomposeOriginFixture();
  const home = await h.seedStub("home");
  const map = await homeMap(h);
  const lookup = h.store.lookup.bind(h.store);
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [home.reference],
    condition: "The home changed during resolution.", remedy: { text: "Acquire the home again.", argv: ["lookup-home", "home"] } };
  h.store.lookup = async input => input.kind === "slug" && input.slug === "home" ? { status: "refused", refusal } : lookup(input);
  expect(await checkDecomposeHomes(h.ctx, map)).toEqual({ status: "refused", reason: "store", class: refusal.class,
    message: refusal.condition, remedy: refusal.remedy, storeRefusal: refusal });
  h.store.lookup = lookup;
  expect(await checkDecomposeHomes(h.ctx, map)).toMatchObject({ status: "ok" });
});
