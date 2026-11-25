/** An abandon returns entries using receipt scope and original date/section. */
import { expect,it } from "vitest";
import { createInboxHarness,entry } from "../../../helpers/inbox-harness.js";
import { prepareErrandAdoption } from "../../../../src/lib/inbox/errand-adoption.js";
import { prepareErrandReturn } from "../../../../src/lib/inbox/errand-return.js";
import { listInbox } from "../../../../src/lib/inbox/listing.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { routeEntry } from "../../../../src/lib/inbox/route.js";
import { removeInboxEntry } from "../../../../src/lib/inbox/removal.js";

it("returns the project capture with its date and leaves it ordinary, and replay writes nothing",async()=>{
 const h=createInboxHarness();await h.inbox("project");const target=await h.errand();
 const start=await prepareErrandAdoption({slug:target.reference.owner.name,from:"project:12345678"},h.context);
 if(start.status!=="ok")throw new Error(start.refusal.condition);
 await h.context.store.batch({writes:start.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}});
 h.context.now=()=>new Date("2026-02-02T12:00:00Z");
 const plan=await prepareErrandReturn(target.reference.owner.name,h.context);
 expect(plan).toMatchObject({status:"ok",result:{returned:["12345678"],disposition:"retained"}});
 if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 await h.context.store.batch({writes:plan.result.writes,provenance:{verb:"errand-abandon",lifecycleAction:"abandon"}});
 expect(await listInbox({list:"project"},h.context)).toMatchObject({entries:[{id:"12345678",fields:{Created:"2026-01-01"}}]});
 const listed=await listInbox({list:"project"},h.context);if(listed.state!=="refused")expect(listed.entries[0]?.survivor).toBeUndefined();
 expect(await prepareErrandReturn(target.reference.owner.name,h.context)).toMatchObject({result:{returned:[],writes:[],disposition:"absent"}});
});
it("combines two fresh returns into one personal inbox put and empties the description",async()=>{
 const h=createInboxHarness();await h.inbox("personal","");const target=await h.errand("text",[entry("11111111"),entry("22222222")].join("\n\n"));
 const plan=await prepareErrandReturn(target.reference.owner.name,h.context);
 expect(plan).toMatchObject({status:"ok",result:{returned:["11111111","22222222"]}});
 if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 expect(plan.result.writes.filter(w=>w.reference.kind==="personal/inbox")).toHaveLength(1);
 await h.context.store.batch({writes:plan.result.writes,provenance:{verb:"errand-abandon",lifecycleAction:"abandon"}});
 expect(await listInbox({list:"personal"},h.context)).toMatchObject({entries:[{fields:{Created:"2026-02-01"},section:"Errand"},{fields:{Created:"2026-02-01"},section:"Errand"}]});
 expect(await listInbox({list:target.reference.owner.name},h.context)).toMatchObject({entries:[]});
});
it.each(["ordinary", "personal", "project"])("gives %s a canonical carry destination and preserves both entries",async slug=>{
 const h=createInboxHarness();const original=await h.inbox("project");const initial=await h.errand();
 const reference=RecordReferenceSchema.parse({...initial.reference,owner:{...initial.reference.owner,name:slug}});
 success(await h.context.store.write({action:"put",reference,expected:initial.version,placement:{kind:"active"},
  content:initial.content.replaceAll(initial.reference.owner.name,slug),provenance:{verb:"rename",lifecycleAction:"rename"}}));
 const target=success(await h.context.store.read({reference}));
 const destination="uid" in target.reference.owner ? target.reference.owner.uid : undefined;
 if(!destination)throw new Error("No canonical work-item UID");
 const adoption=await prepareErrandAdoption({slug:target.reference.owner.name,from:"project:12345678"},h.context);
 if(adoption.status!=="ok")throw new Error(adoption.refusal.condition);
 const write=h.context.store.batch.bind(h.context.store);
 await h.context.store.write({action:"put",reference:original.reference,content:original.content.replace("Concern","Survivor concern"),expected:original.version,provenance:{verb:"edit",lifecycleAction:"edit"}});
 success(await write({writes:adoption.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}}));
 const refused=await prepareErrandReturn(target.reference.owner.name,h.context);
 expect(refused).toMatchObject({status:"refused",refusal:{condition:expect.stringContaining("Survivor concern"),remedy:{text:expect.stringContaining("--expected-version v1:")}}});
 if(refused.status!=="refused")throw new Error("Expected clash");expect(refused.refusal.condition).toContain("Concern");
 expect(refused.refusal.remedy.text).toContain(`--to ${destination}`);
 const listed=await listInbox({list:"project"},h.context);if(listed.state==="refused"||!listed.entries[0])throw new Error("No survivor");
 const {routeEntry}=await import("../../../../src/lib/inbox/route.js");
 h.context.now=()=>new Date("2026-02-02T00:00:00Z");
 expect(await routeEntry({from:"project",entryId:"12345678",expectedVersion:listed.entries[0].version,to:destination},h.context)).toMatchObject({state:"routed",carried:"cited"});
 h.context.now=()=>new Date("2026-02-03T00:00:00Z");
 const returned=await prepareErrandReturn(target.reference.owner.name,h.context);if(returned.status!=="ok")throw new Error(returned.refusal.condition);
 expect(returned.result.returned).toHaveLength(2);
 success(await write({writes:returned.result.writes,provenance:{verb:"errand-abandon",lifecycleAction:"abandon"}}));
 const project=await listInbox({list:"project"},h.context),personal=await listInbox({list:"personal"},h.context);
 if(project.state==="refused"||personal.state==="refused")throw new Error("Unreadable returned inbox");
 expect([...project.entries,...personal.entries].map(e=>e.title).sort()).toEqual(["Concern","Survivor concern"]);
});
it("leaves the description when a later inbox receipt names another open Errand",async()=>{
 const h=createInboxHarness();const source=await h.inbox("project");const first=await h.errand("first"),second=await h.errand("second");
 const adoption=await prepareErrandAdoption({slug:first.reference.owner.name,from:"project:12345678"},h.context);if(adoption.status!=="ok")throw new Error(adoption.refusal.condition);
 await h.context.store.write({action:"put",reference:source.reference,content:source.content.replace("Prose","Edited"),expected:source.version,provenance:{verb:"edit",lifecycleAction:"edit"}});
 await h.context.store.batch({writes:adoption.result.writes,provenance:{verb:"errand-open",lifecycleAction:"open"}});
 h.context.now=()=>new Date("2026-02-02T00:00:00Z");
 const {routeEntry}=await import("../../../../src/lib/inbox/route.js");const listed=await listInbox({list:"project"},h.context);if(listed.state==="refused"||!listed.entries[0])throw new Error("No survivor");
 await routeEntry({from:"project",entryId:"12345678",expectedVersion:listed.entries[0].version,to:second.reference.owner.name},h.context);
 expect(await prepareErrandReturn(first.reference.owner.name,h.context)).toMatchObject({result:{writes:[],disposition:"absent",held:[{id:"12345678",errand:second.reference.owner.name}]}});
});


it("gives an unrelated collision a fresh-identity repair instead of promising survivor carry", async () => {
 const h=createInboxHarness();await h.inbox("personal",entry("12345678","Unrelated capture","Keep this capture"));
 const target=await h.errand("text",entry("12345678","Errand entry","Keep the Errand work"));
 const refused=await prepareErrandReturn(target.reference.owner.name,h.context);
 expect(refused).toMatchObject({status:"refused",refusal:{code:"id-clash",remedy:{text:expect.stringContaining("without _Id:_")}}});
 if(refused.status!=="refused")throw new Error("Expected unrelated ID collision");
 expect(refused.refusal.remedy.text).not.toContain("Carry the survivor");
 const listed=await listInbox({list:"personal"},h.context);if(listed.state==="refused"||!listed.entries[0])throw new Error("No colliding capture");
 const row=listed.entries[0];
 expect(await routeEntry({to:"personal",section:"Errand",content:row.raw.replace(/^- _Id:_ `[^`]+`\r?\n/mu,"")},h.context)).toMatchObject({state:"routed"});
 expect(await removeInboxEntry({list:"personal",id:row.id,expectedVersion:row.version},h.context)).toMatchObject({result:{disposition:"removed"}});
 const returned=await prepareErrandReturn(target.reference.owner.name,h.context);if(returned.status!=="ok")throw new Error(returned.refusal.condition);
 success(await h.context.store.batch({writes:returned.result.writes,provenance:{verb:"errand-abandon",lifecycleAction:"abandon"}}));
 const after=await listInbox({list:"personal"},h.context);if(after.state==="refused")throw new Error(after.reason);
 expect(after.entries.map(row=>row.title).sort()).toEqual(["Errand entry","Unrelated capture"]);
 expect(new Set(after.entries.map(row=>row.id)).size).toBe(2);
});
