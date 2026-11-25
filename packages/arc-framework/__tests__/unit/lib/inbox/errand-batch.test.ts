/** Identity creation and failed provisioning use the same atomic entry companion plans. */
import {expect,it} from "vitest";
import {createInboxHarness} from "../../../helpers/inbox-harness.js";
import {prepareErrandAdoption} from "../../../../src/lib/inbox/errand-adoption.js";
import {prepareErrandReturn} from "../../../../src/lib/inbox/errand-return.js";
import {transitionStoreErrand} from "../../../../src/lib/errand/store-runtime.js";
import {TransientIdentityRecordV3Schema} from "../../../../src/lib/errand/identity-record.js";
import {setErrandQueue} from "../../../../src/lib/inbox/queue.js";
import {listInbox} from "../../../../src/lib/inbox/listing.js";
import {listErrandQueue} from "../../../../src/lib/inbox/queue.js";
import {readStoreErrand} from "../../../../src/lib/errand/store-runtime.js";
import {recordReferences} from "../../../../src/lib/store/identity.js";
import {SlugSchema} from "../../../../src/lib/kernel/index.js";

it("creates the identity beside every adoption write, then retires beside every rollback return",async()=>{
 const h=createInboxHarness();await h.inbox("project");await setErrandQueue({schemaVersion:1,members:[{inbox:"project",id:"12345678"}]},h.context);
 const plan=await prepareErrandAdoption({slug:"fix-it",from:"project:12345678"},h.context);if(plan.status!=="ok")throw new Error(plan.refusal.condition);
 const record=TransientIdentityRecordV3Schema.parse({version:3,kind:"errand",purpose:"errand",slug:"fix-it",claimId:"a".repeat(32),createdAt:"2026-02-01T00:00:00Z",updatedAt:"2026-02-01T00:00:00Z",intent:"Fix it",branch:"chore/fix-it",origin:"inbox",originEntry:plan.result.origin?.title,originEntrySourceDigest:null,state:"open",savedHead:null,changeRequest:null});
 if(record.kind!=="errand"||record.purpose!=="errand")throw new Error("Not ordinary");
 const opened=await transitionStoreErrand({store:h.context.store,identity:h.context.identity,projectId:async()=>"project-id",companionWrites:plan.result.writes,provenanceVerb:"errand-open"},{kind:"create",record});
 expect(opened).toMatchObject({kind:"applied",value:{originEntry:"project:12345678",originEntrySourceDigest:null}});
 expect(await listInbox({list:"project"},h.context)).toMatchObject({entries:[]});
 expect(await listInbox({list:"fix-it"},h.context)).toMatchObject({entries:[{id:"12345678",fields:{Created:"2026-01-01"}}]});
 expect(await listErrandQueue(h.context)).toMatchObject({members:[]});
 expect(await readStoreErrand({store:h.context.store,identity:h.context.identity},"fix-it")).toMatchObject({kind:"ready",record:{state:"open",originEntry:"project:12345678"}});
 if(opened.kind!=="applied"||opened.value===null)throw new Error("No created Errand");
 h.context.now=()=>new Date("2026-02-02T00:00:00Z");
 const returned=await prepareErrandReturn("fix-it",h.context);if(returned.status!=="ok")throw new Error(returned.refusal.condition);
 expect(await transitionStoreErrand({store:h.context.store,identity:h.context.identity,companionWrites:returned.result.writes,provenanceVerb:"errand-open"},{kind:"retire",previous:opened.value,reason:"abandon",authorization:"local"})).toMatchObject({kind:"applied"});
 const ended = await h.context.store.lookup({kind:"slug",slug:SlugSchema.parse("fix-it")});
 if(ended.status!=="ok")throw new Error(ended.refusal.condition);
 expect(await h.context.store.read({reference:ended.result.reference})).toMatchObject({status:"ok",result:{placement:{kind:"completed"}}});
 expect(await h.context.store.read({reference:recordReferences["work-item/description"](ended.result.reference.owner)})).toMatchObject({status:"ok",result:{content:"## Description\n\n"}});
 expect(await listInbox({list:"project"},h.context)).toMatchObject({entries:[{id:"12345678",fields:{Created:"2026-01-01"}}]});
});
