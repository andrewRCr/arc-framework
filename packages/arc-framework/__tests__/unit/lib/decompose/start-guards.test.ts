/** New cuts respect stored maps and held inbound entries until those conditions are repaired. */
import { expect, it } from "vitest";
import { createDecomposeHarness } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { decomposeContext } from "../../../fixtures/decompose-context.js";
import { cutMapFixture, rebindCutFixture } from "../../../fixtures/decompose-v4.js";
import { acquireDecomposeOrigin } from "../../../../src/lib/decompose/acquire-origin.js";
import { checkDecomposeStart } from "../../../../src/lib/decompose/start-guards.js";
import { recordReferences, sameReference } from "../../../../src/lib/store/identity.js";
import { writeCutMapRecord } from "../../../../src/lib/store/kinds/cut-map/index.js";
import { KIND_MECHANISMS } from "../../../../src/lib/store/registry.js";

it("names finish, revision, and discard for an existing stored cut, then admits after removal", async () => {
  const h = createDecomposeHarness();
  const primary = await h.seedStub("origin");
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected origin generation.");
  const map = cutMapFixture();
  map.machine.origin = { slug: owner.name, uid: owner.uid };
  rebindCutFixture(map);
  const saved = await h.seed(recordReferences["work-item/cut-map"](owner), writeCutMapRecord(map));
  const ctx = decomposeContext(h.store);
  const acquired = await acquireDecomposeOrigin(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  const refusal = checkDecomposeStart(ctx, acquired.result);
  expect(refusal).toMatchObject({ status: "refused", reason: "cut-in-flight", class: "recoverable" });
  expect(refusal?.remedy.text).toContain("arc decompose origin --finish");
  expect(refusal?.remedy.text).toContain("arc decompose origin --revise");
  expect(refusal?.remedy.text).toContain("arc decompose origin --discard");
  expect(refusal?.remedy.argv).toBeUndefined();
  lifecycleSuccess(await h.store.write({ action: "remove", reference: saved.reference, expected: saved.version,
    provenance: { verb: "decompose", lifecycleAction: "discard" } }));
  const repaired = await acquireDecomposeOrigin(ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeStart(ctx, repaired.result)).toBeUndefined();
});

it("names every held entry and missing-ID position only when a grammar is supplied, then admits after routing", async () => {
  const h = createDecomposeHarness();
  const primary = await h.seedStub("origin");
  const inbound = await h.seed(recordReferences["work-item/inbound"](primary.reference.owner),
    "# Inbound\n\n## Inbound\n\n### Captured work\n\n_Id:_ `1234abcd`\n\nFold this work.\n\n### Older work\n\nNo managed identity yet.\n");
  // Normal writes stamp IDs; represent a legacy record that predates that stamping.
  const legacy = [...h.store.state.records.values()].find(record => sameReference(record.reference, inbound.reference));
  if (legacy === undefined) throw new Error("Expected inbound record.");
  legacy.content = legacy.content.replace(/_Id:_ `([0-9a-f]{8})`\n/gu, (line, id: string) => id === "1234abcd" ? line : "");
  const ctx = decomposeContext(h.store);
  const acquired = await acquireDecomposeOrigin(ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(checkDecomposeStart(ctx, acquired.result)).toBeUndefined();
  ctx.inboundGrammar = KIND_MECHANISMS["work-item/inbound"].entry;
  expect(ctx.inboundGrammar).toBeDefined();
  const refusal = checkDecomposeStart(ctx, acquired.result);
  expect(refusal).toMatchObject({ status: "refused", reason: "inbound-held", class: "recoverable" });
  expect(refusal?.message).toContain("1234abcd");
  expect(refusal?.message).toContain("position 2");
  expect(refusal?.remedy.text).toContain(`arc route 1234abcd --from origin --expected-version ${inbound.version} --to`);
  expect(refusal?.remedy.argv).toBeUndefined();
  await h.handEdit(inbound, "# Inbound\n\n## Inbound\n");
  const repaired = await acquireDecomposeOrigin(ctx, "origin");
  if (repaired.status === "refused") throw new Error(JSON.stringify(repaired));
  expect(checkDecomposeStart(ctx, repaired.result)).toBeUndefined();
});
