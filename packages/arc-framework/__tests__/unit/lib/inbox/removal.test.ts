/** Exact entry-version deletion and edit retention are both idempotent. */
import {expect,it} from "vitest";
import {createInboxHarness,entry} from "../../../helpers/inbox-harness.js";
import {removeInboxEntry} from "../../../../src/lib/inbox/removal.js";
import {listInbox} from "../../../../src/lib/inbox/listing.js";
import {success} from "../../../helpers/store/suite-tools.js";
it("retains edits since listing, removes the observed version, then reports absent",async()=>{
 const h=createInboxHarness();const saved=await h.inbox("personal");
 const before=await listInbox({list:"personal"},h.context);if(before.state==="refused")throw new Error(before.reason);const row=before.entries[0];if(!row)throw new Error("No row");
 success(await h.context.store.write({action:"put",reference:saved.reference,content:saved.content.replace("Prose","Edited"),expected:saved.version,provenance:{verb:"edit",lifecycleAction:"edit"}}));
 const retained=await removeInboxEntry({list:"personal",id:row.id,expectedVersion:row.version},h.context);
 expect(retained).toMatchObject({result:{disposition:"retained",foundVersion:expect.any(String)}});
 if(retained.status!=="ok"||!retained.result.foundVersion)throw new Error("No current version");
 expect(await removeInboxEntry({list:"personal",id:row.id,expectedVersion:retained.result.foundVersion},h.context)).toMatchObject({result:{disposition:"removed"}});
 expect(await removeInboxEntry({list:"personal",id:row.id,expectedVersion:row.version},h.context)).toMatchObject({result:{disposition:"absent"}});
});
it("reports an edit racing observed removal as retained",async()=>{
 const h=createInboxHarness();const saved=await h.inbox("project");const listed=await listInbox({list:"project"},h.context);if(listed.state==="refused")throw new Error(listed.reason);const row=listed.entries[0];if(!row)throw new Error("No row");
 const original=h.context.store.write.bind(h.context.store);let raced=false;
 h.context.store.write=async input=>{if(!raced){raced=true;await original({action:"put",reference:saved.reference,content:`## Inbox\n\n${entry("12345678","Edited")}\n`,expected:saved.version,provenance:{verb:"edit",lifecycleAction:"edit"}});}return original(input);};
 expect(await removeInboxEntry({list:"project",id:row.id,expectedVersion:row.version},h.context)).toMatchObject({result:{disposition:"retained",foundVersion:expect.any(String)}});
});
it("returns the real stored post-image through the compatibility mutation boundary",async()=>{
 const h=createInboxHarness();await h.inbox("personal");const listed=await listInbox({list:"personal"},h.context);if(listed.state==="refused"||!listed.entries[0])throw new Error("No entry");
 const {removeCurrentInboxEntry}=await import("../../../../src/commands/user/inbox-mutation.js"),{createUserIOContext}=await import("../../../../src/lib/io-context.js");
 const result=await removeCurrentInboxEntry({cwd:"/repo",io:createUserIOContext(),identity:h.context.identity,title:"",entry:{id:"12345678",expectedVersion:listed.entries[0].version},inboxContext:h.context});
 expect(result).toMatchObject({removed:true,disposition:"removed",postImage:{state:"present",content:expect.not.stringContaining("Concern"),digest:expect.stringMatching(/^sha256:/u)}});
});
