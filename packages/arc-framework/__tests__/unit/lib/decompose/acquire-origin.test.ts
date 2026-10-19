/** Origin acquisition observes store records and preserves identity across aliases. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";

it("acquires the primary and source artifacts through the store with every Git call forbidden", async () => {
  const h = createDecomposeHarness();
  const primary = await h.seedStub("origin");
  const draft = await h.seed(recordReferences["work-item/draft"](primary.reference.owner), "# Draft\n\n## Scope\n\nWork.\n");
  await h.seed(recordReferences["work-item/inbound"](primary.reference.owner), "# Inbound\n\n## Inbound\n");
  const result = await acquireDecomposeOrigin(decomposeContext(h.store), "origin");
  expect(result).toMatchObject({ status: "ok", result: { primary, artifacts: [{ basename: "draft-origin.md", record: draft }] } });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.records.map(record => record.reference.kind).sort()).toEqual(["work-item/draft", "work-item/inbound", "work-item/meta"]);
  expect(result.result.storedMap).toBeUndefined();
});

it("acquires an origin named by its former slug with its current canonical name", async () => {
  const h = createDecomposeHarness();
  const renamed = await h.seedRenamedWorkUnit("former", "current");
  const result = await acquireDecomposeOrigin(decomposeContext(h.store), "former");
  expect(result).toMatchObject({ status: "ok", result: { primary: renamed } });
});

it.each(["unreadable", "incomplete"] as const)("refuses a %s lifecycle inventory with its own repair, then proceeds after repair", async (failure) => {
  const h = createDecomposeHarness();
  await h.seedStub("origin");
  const list = h.store.list.bind(h.store);
  let broken = true;
  const remedy = { text: "Restore the missing lifecycle inventory evidence." };
  h.store.list = async (input) => {
    if (input.kind !== "work-item/meta" || !broken) return list(input);
    return { status: "ok", result: failure === "unreadable"
      ? { status: "unreadable", condition: "Lifecycle inventory is unreadable.", remedy }
      : { status: "complete", records: [], missed: true,
        diagnostics: [{ kind: "unreadable", key: "work-item/meta:other", condition: "Other metadata could not be read.", remedy }] } };
  };
  const ctx = decomposeContext(h.store);
  expect(await acquireDecomposeOrigin(ctx, "origin")).toMatchObject({ status: "refused", reason: "inventory-incomplete",
    class: "recoverable", remedy });
  broken = false;
  expect(await acquireDecomposeOrigin(ctx, "origin")).toMatchObject({ status: "ok" });
});

it.each([false, true])("excludes a member by generation, including after rename=%s", async (renamed) => {
  const h = createDecomposeHarness();
  await h.seedStub("origin");
  const member = renamed ? await h.seedRenamedWorkUnit("member", "renamed-member") : await h.seedStub("member");
  await h.handEdit(member, writeMetaDependsOn(member.content, ["origin"]));
  const owner = member.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Fixture requires a member UID.");
  const result = await acquireDecomposeOrigin(decomposeContext(h.store), "origin", new Set([owner.uid]));
  expect(result.status).toBe("ok");
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.incomingCandidates.map(entry => entry.reference.owner.name)).not.toContain(owner.name);
  expect(result.result.lifecycleEntries.map(entry => entry.reference.owner.name)).toContain(owner.name);
});
