/** Errand entry adoption composes one atomic identity companion write set. */
import { expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { setErrandQueue, listErrandQueue } from "../../../../src/lib/inbox/queue.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";

it("prepares project adoption with description, removal, queue drop and receipt, and writes nothing before batch", async () => {
 const h=createInboxHarness(); await h.inbox("project"); const target=await h.errand();
 await setErrandQueue({schemaVersion:1,members:[{inbox:"project",id:"12345678"}]},h.context);
 const plan=await prepareErrandAdoption({slug:target.reference.owner.name,from:"project:12345678"},h.context);
 expect(plan).toMatchObject({status:"ok",result:{origin:{title:"project:12345678",sourceDigest:null},writes:expect.any(Array)}});
 if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 expect(plan.result.writes).toHaveLength(4);
 expect(await listInbox({list:"project"},h.context)).toMatchObject({entries:[{id:"12345678"}]});
 expect(await h.context.store.batch({writes:plan.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}})).toMatchObject({status:"ok"});
 expect(await listInbox({list:"project"},h.context)).toMatchObject({entries:[]});
 expect(await listInbox({list:target.reference.owner.name},h.context)).toMatchObject({entries:[{id:"12345678"}]});
 expect(await listErrandQueue(h.context)).toMatchObject({members:[]});
});
it("mints text descriptions and leaves partial source bytes in place while dropping its queue reference",async()=>{
 const h=createInboxHarness();await h.inbox("personal");
 const text=await prepareErrandAdoption({slug:"fresh-text",intent:"Fresh intent"},h.context);
 expect(text).toMatchObject({status:"ok",result:{origin:null,writes:[{content:expect.stringContaining("Fresh intent")}]}});
 await setErrandQueue({schemaVersion:1,members:[{inbox:"personal",id:"12345678"}]},h.context);
 const partial=await prepareErrandAdoption({slug:"partial",from:"personal:12345678",partial:true},h.context);
 expect(partial).toMatchObject({status:"ok",result:{origin:{title:"personal:12345678",version:expect.stringMatching(/^v1:/)},writes:[{reference:{kind:"personal/errand-queue"}}]}});
 if(partial.status!=="ok")throw new Error(partial.refusal.condition);
 await h.context.store.batch({writes:partial.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}});
 expect(await listInbox({list:"personal"},h.context)).toMatchObject({entries:[{id:"12345678"}]});
 expect(await listErrandQueue(h.context)).toMatchObject({members:[]});
});
it("re-feeds the same qualified origin to resume its existing Errand without another move",async()=>{
 const h=createInboxHarness();await h.inbox("project");const target=await h.errand();
 const plan=await prepareErrandAdoption({slug:target.reference.owner.name,from:"project:12345678"},h.context);if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 await h.context.store.batch({writes:plan.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}});
 expect(await prepareErrandAdoption({slug:target.reference.owner.name,from:"project:12345678"},h.context)).toMatchObject({status:"ok",result:{origin:{title:"project:12345678",sourceDigest:null},writes:[]}});
 expect(await prepareErrandAdoption({slug:"other",from:"project:12345678"},h.context)).toMatchObject({status:"refused",refusal:{code:"entry-held",remedy:{text:expect.stringContaining(target.reference.owner.name)}}});
});

it("links beside a minted description while preserving capture fields and date",async()=>{
 const h=createInboxHarness();await h.inbox("personal",entry().replace("- _Id:_", "- _Hold:_ `true`\n- _WU_Target:_ `target`\n- _Cites:_ `87654321`\n- _Id:_"));const target=await h.errand("linked",entry("11111111","Minted"));
 const plan=await prepareErrandAdoption({slug:target.reference.owner.name,from:"personal:12345678"},h.context);if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 await h.context.store.batch({writes:plan.result.writes,provenance:{verb:"errand-link",lifecycleAction:"link"}});
 const listed=await listInbox({list:target.reference.owner.name},h.context);expect(listed).toMatchObject({entries:[{id:"11111111"},{id:"12345678",fields:{Created:"2026-01-01",Hold:"true",WU_Target:"target"}}]});
 if(listed.state!=="refused")expect(listed.entries[1]?.fields.Cites).toBeUndefined();
});
