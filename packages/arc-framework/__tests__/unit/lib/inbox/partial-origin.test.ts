/** Partial close consumes exactly the bound version or resolves a legacy digest once. */
import {expect,it} from "vitest";
import {createInboxHarness} from "../../../helpers/inbox-harness.js";
import {listInbox} from "../../../../src/lib/inbox/listing.js";
import {removePartialOrigin} from "../../../../src/lib/inbox/partial-origin.js";
import {inboxEntrySourceDigest} from "../../../../src/lib/user-sync/inbox-writer.js";
it("removes version-bound project origin and reports absent when repeated",async()=>{
 const h=createInboxHarness();await h.inbox("project");const listed=await listInbox({list:"project"},h.context);if(listed.state==="refused"||!listed.entries[0])throw new Error("No capture");
 const binding={originEntry:"project:12345678",originEntryVersion:listed.entries[0].version};
 expect(await removePartialOrigin(binding,h.context)).toMatchObject({result:{disposition:"removed"}});
 expect(await removePartialOrigin(binding,h.context)).toMatchObject({result:{disposition:"absent"}});
});
it("retains mismatched legacy digest and resolves a matching digest to the current ID/version",async()=>{
 const h=createInboxHarness();const saved=await h.inbox("personal");
 expect(await removePartialOrigin({originEntry:"Concern",originEntrySourceDigest:`sha256:${"a".repeat(64)}`},h.context,inboxEntrySourceDigest)).toMatchObject({result:{disposition:"retained"}});
 expect(await removePartialOrigin({originEntry:"Concern",originEntrySourceDigest:inboxEntrySourceDigest(saved.content,"Concern")},h.context,inboxEntrySourceDigest)).toMatchObject({result:{disposition:"removed"}});
});
