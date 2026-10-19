/** Dependency scans retain generation identity across aliases, rename, and retirement. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { deriveDecomposeEdges } from "../../../../src/lib/decompose/edge-facts.js";
import { cutIncomingEdgeId, cutOutgoingEdgeId } from "../../../../src/lib/decompose/cut-map-machine.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../../src/lib/kernel/index.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { renderMetaFile } from "../../../../src/lib/store/kinds/meta/writers.js";
import { randomUUID } from "node:crypto";

it("finds an incoming dependent through the origin's former slug and excludes completed dependents", async () => {
  const h = createDecomposeHarness();
  await h.seedRenamedWorkUnit("former", "origin");
  const dependent = await h.seedMeta("dependent", { dependsOn: ["former"] });
  await h.seedMeta("completed", { state: "Shipped", currentWorkflow: null, dependsOn: ["former"],
    completed: "2026-10-01", prUrl: "https://example.test/pull/1" },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const owner = dependent.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected dependent generation.");
  const identity = { slug: owner.name, uid: owner.uid };
  expect(deriveDecomposeEdges(acquired.result.edges).incomingEdges)
    .toEqual([{ dependent: identity, edgeId: cutIncomingEdgeId({ dependent: identity }) }]);
});

it.each(["renamed", "abandoned", "decomposed", "renamed-retired"] as const)("resolves a %s provider to its generation", async (lifecycle) => {
  const h = createDecomposeHarness();
  const live = lifecycle === "renamed" || lifecycle === "renamed-retired"
    ? await h.seedRenamedWorkUnit("provider", "current-provider") : await h.seedStub("provider");
  const slug = lifecycle === "renamed-retired" ? "current-provider" : "provider";
  await h.seedMeta("origin", { dependsOn: [slug] });
  const provider = lifecycle === "renamed" ? live : await h.seedRetiredWorkUnit(live, lifecycle === "decomposed"
    ? { kind: "decompose", successors: [{ name: SlugSchema.parse("replacement") }] } : { kind: "abandon", successors: [] });
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const owner = provider.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected provider generation.");
  const identity = { slug, uid: owner.uid };
  expect(deriveDecomposeEdges(acquired.result.edges).outgoingEdges)
    .toEqual([{ provider: identity, edgeId: cutOutgoingEdgeId({ provider: identity }) }]);
});

it("keeps slug identity when a renamed and retired provider is still named by its earlier alias", async () => {
  const h = createDecomposeHarness();
  const provider = await h.seedRenamedWorkUnit("old-provider", "new-provider");
  await h.seedMeta("origin", { dependsOn: ["old-provider"] });
  await h.seedRetiredWorkUnit(provider);
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const identity = { slug: "old-provider" };
  expect(deriveDecomposeEdges(acquired.result.edges).outgoingEdges)
    .toEqual([{ provider: identity, edgeId: cutOutgoingEdgeId({ provider: identity }) }]);
});

it("keeps an ambiguous provider's slug without selecting a generation", async () => {
  const h = createDecomposeHarness();
  const provider = await h.seedStub("provider"), other = await h.seedStub("other");
  await h.seedMeta("origin", { dependsOn: ["provider"] });
  const lookup = h.store.lookup.bind(h.store);
  h.store.lookup = input => input.kind === "slug" && input.slug === "provider"
    ? Promise.resolve({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable",
      candidates: [provider.reference, other.reference], condition: "Provider resolves to competing generations.",
      remedy: { text: "Resolve the competing provider names." } } }) : lookup(input);
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const identity = { slug: "provider" };
  expect(deriveDecomposeEdges(acquired.result.edges).outgoingEdges)
    .toEqual([{ provider: identity, edgeId: cutOutgoingEdgeId({ provider: identity }) }]);
});

it("preserves any other provider lookup refusal and succeeds after its repair", async () => {
  const h = createDecomposeHarness();
  await h.seedStub("provider");
  await h.seedMeta("origin", { dependsOn: ["provider"] });
  const lookup = h.store.lookup.bind(h.store);
  const refusal: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: "work/provider",
    condition: "Provider namespace is corrupt.", remedy: { text: "Restore the provider namespace from a verified copy." } };
  let broken = true;
  h.store.lookup = input => broken && input.kind === "slug" && input.slug === "provider"
    ? Promise.resolve({ status: "refused", refusal }) : lookup(input);
  const ctx = decomposeContext(h.store);
  expect(await acquireDecomposeOrigin(ctx, "origin")).toMatchObject({ status: "refused", reason: "store",
    class: refusal.class, remedy: refusal.remedy, storeRefusal: refusal });
  broken = false;
  expect(await acquireDecomposeOrigin(ctx, "origin")).toMatchObject({ status: "ok" });
});

it("includes a replacement generation that takes an excluded member's former slug", async () => {
  const h = createDecomposeHarness();
  const prior = await h.seedRetiredWorkUnit("member");
  await h.seedStub("origin");
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "member", uid: randomUUID() });
  const replacement = await h.seed(recordReferences["work-item/meta"](owner), renderMetaFile("member",
    { state: "Planning", owner: "test-user", workClass: "Light", currentWorkflow: null, dependsOn: ["origin"] }),
    { kind: "backlog", commitment: "planned" });
  const oldOwner = prior.reference.owner;
  if (oldOwner.type !== "work-item" || oldOwner.uid === undefined) throw new Error("Expected retired generation.");
  const acquired = await acquireDecomposeOrigin(decomposeContext(h.store), "origin", new Set([oldOwner.uid]));
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(deriveDecomposeEdges(acquired.result.edges).incomingEdges)
    .toMatchObject([{ dependent: { slug: "member", uid: replacement.reference.owner.type === "work-item" ? replacement.reference.owner.uid : undefined } }]);
});
