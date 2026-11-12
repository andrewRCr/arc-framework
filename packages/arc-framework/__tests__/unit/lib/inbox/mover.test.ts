/** Shared mover field rules and atomic receipt mutations through the reference backend. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { resolveEntryList } from "../../../../src/lib/inbox/lists.js";
import { rowsInList } from "../../../../src/lib/inbox/listing.js";
import { prepareEntryMove } from "../../../../src/lib/inbox/mover.js";
import type { InboxContext } from "../../../../src/lib/inbox/types.js";

it("composes the inbound insert, exact source removal, and receipt with destination field rules", async () => {
  const f = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser ?? null } });
  const context: InboxContext = { store: f.store, identity: "test-user", now: () => new Date("2026-02-01T12:00:00Z"), key: () => "move-one" };
  const personal = f.reference("personal/inbox");
  const raw = '### **Concern**\n- _Created:_ `2026-01-01`\n- _Hold:_ `true`\n- _WU_Target:_ `example`\n- _Shapes:_ `Section 2`\n- _Cites:_ `87654321`\n- _Id:_ `12345678`\n\nProse';
  await seed(f, personal, `## Work Unit\n${raw}\n`);
  const primary = f.reference("work-item/meta");
  await seed(f, primary, makeMetaFixture(primary.owner.name, { owner: "test-user", state: "Planning" }));
  const source = await resolveEntryList("personal", context), destination = await resolveEntryList(primary.owner.name, context);
  if (source.status !== "ok" || destination.status !== "ok") throw new Error("Fixture lists must resolve");
  const rows = rowsInList(source.result);
  if (rows.status !== "ok" || rows.result[0] === undefined) throw new Error("Fixture needs one entry");
  const prepared = await prepareEntryMove({ source: source.result, destination: destination.result, entry: rows.result[0], section: "Inbound" }, context);
  if (prepared.status !== "ok") throw new Error(prepared.refusal.condition);
  const plan = prepared.result;
  expect(plan.writes).toHaveLength(4);
  expect(plan.writes).toContainEqual(expect.objectContaining({ reference: destination.result.primary?.reference, expected: destination.result.primary?.version }));
  success(await f.store.batch({ writes: plan.writes, provenance: { verb: "route", lifecycleAction: "route" } }));
  const inbound = success(await f.store.read({ reference: destination.result.reference }));
  expect(inbound.content).toContain('- _Created:_ `2026-02-01`');
  expect(inbound.content).toContain('- _Shapes:_ `Section 2`');
  expect(inbound.content).toContain('- _Id:_ `12345678`\n- _Routed from:_ personal (test-user) \u00a7 Work Unit');
  for (const field of ["Hold", "WU_Target", "Cites"]) expect(inbound.content).not.toContain(`_${field}:_`);
  expect(success(await f.store.read({ reference: personal })).content).not.toContain("Concern");
  const receipts = success(await f.store.list({ family: "personal", kind: "personal/routing-receipt" }));
  expect(receipts).toMatchObject({ status: "complete", records: [{ fields: { entryId: "12345678", time: "2026-02-01T12:00:00.000Z" } }] });
});
it("moves an inbound entry into a description without either inbox receipt",async()=>{
 const {createInboxHarness,entry}=await import("../../../helpers/inbox-harness.js");const h=createInboxHarness();const source=await h.workUnit("from","test-user","active",entry()),target=await h.errand("to");
 const from=await resolveEntryList(source.reference.owner.name,h.context),to=await resolveEntryList(target.reference.owner.name,h.context);if(from.status!=="ok"||to.status!=="ok")throw new Error("Lists missing");
 const rows=rowsInList(from.result);if(rows.status!=="ok"||!rows.result[0])throw new Error("No row");
 const prepared=await prepareEntryMove({source:from.result,destination:to.result,entry:rows.result[0],section:"Description"},h.context);
 if(prepared.status!=="ok")throw new Error(prepared.refusal.condition);const plan=prepared.result;
 expect(plan.writes.map(write=>write.reference.kind)).toEqual(["work-item/description","work-item/inbound","work-item/meta","work-item/record"]);
});
