/** Production adapters run the off-branch listing, mover, and queue services with explicit input sources. */
import { describe, expect, it, vi } from "vitest";
import { createInboxHarness } from "../../helpers/inbox-harness.js";
import { handleInbox } from "../../../src/handlers/inbox.js";
import { handleRoute } from "../../../src/handlers/route.js";
import { handleErrandQueue, handleErrandQueueSet } from "../../../src/handlers/errand-queue.js";
import { handleUserInboxList } from "../../../src/handlers/user-inbox-list.js";
import { handleUserInboxMarkExecuteBound } from "../../../src/handlers/user.js";
import type { InboxHandlerPorts } from "../../../src/handlers/inbox-runtime.js";
import { InboxResultSchema } from "../../../src/lib/inbox/types.js";
import { RouteResultSchema } from "../../../src/lib/inbox/route.js";
import { ErrandQueueResultSchema } from "../../../src/lib/inbox/queue.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../helpers/schema-assertion.js";

function sink() {
  let stdout = "", stderr = "", exit = -1;
  return { output: { stdout: (value: string) => { stdout += value; }, stderr: (value: string) => { stderr += value; }, exit: (code: number) => { exit = code; } }, value: () => ({ stdout, stderr, exit }) };
}

it.each([
  { name: "inbox", mode: "inbox", state: "listed", run: (ports: InboxHandlerPorts) => handleInbox("personal", { json: true }, undefined, ports) },
  { name: "route", mode: "route", state: "routed", run: (ports: InboxHandlerPorts) => handleRoute(undefined, { to: "personal", section: "Errand" }, undefined, ports) },
  { name: "queue listing", mode: "errand-queue", state: "listed", run: (ports: InboxHandlerPorts) => handleErrandQueue({ json: true }, undefined, ports) },
  { name: "queue replacement", mode: "errand-queue", state: "set", run: (ports: InboxHandlerPorts) => handleErrandQueueSet("-", undefined,
    { ...ports, readStdin: async () => JSON.stringify({ schemaVersion: 1, members: [] }) }) },
])("preserves executable Store remedies in $name and continues after repair", async ({ mode, state, run }) => {
  const h = createInboxHarness(), out = sink(), read = h.context.store.read.bind(h.context.store);
  const remedy = { text: "Inspect and repair personal state, then retry.", argv: ["arc", "store", "fetch"] };
  const refusal = { code: "namespace-corrupt" as const, class: "terminal" as const, namespace: "personal", condition: "Personal state is unreadable.", remedy };
  const before = await h.context.store.version();
  let broken = true;
  const fault = vi.spyOn(h.context.store, "read").mockImplementation(input => broken
    ? Promise.resolve({ status: "refused", refusal }) : read(input));
  const ports: InboxHandlerPorts = { store: h.context.store, identity: "test-user", cwd: "/repo", now: h.context.now,
    output: out.output, readStdin: async () => "### **Captured**\n\nWork" };
  try {
    await run(ports);
    expect(JSON.parse(out.value().stdout)).toMatchObject({ mode, state: "refused", reason: refusal.condition, remedy });
    expect(out.value().exit).toBe(1);
    expect(await h.context.store.version()).toEqual(before);
    broken = false;
    const repaired = sink(); await run({ ...ports, output: repaired.output });
    expect(JSON.parse(repaired.value().stdout)).toMatchObject({ mode, state });
    expect(repaired.value().exit).toBe(0);
  } finally { fault.mockRestore(); }
});

it.each([
  { schema: InboxResultSchema, mode: "inbox", list: "personal" },
  { schema: RouteResultSchema, mode: "route" },
  { schema: ErrandQueueResultSchema, mode: "errand-queue" },
])("keeps $mode remedy objects strict while accepting text-only repairs", ({ schema, ...fields }) => {
  const value = { schemaVersion: 1, state: "refused", code: "unavailable", reason: "Unavailable", ...fields };
  assertSchemaAccepts(schema, { ...value, remedy: { text: "Repair and retry." } });
  for (const remedy of [{ text: "" }, { text: "Repair", argv: [] }, { text: "Repair", argv: [1] }, { text: "Repair", extra: true }]) {
    assertSchemaRefuses(schema, { ...value, remedy });
  }
});
describe("store entry command adapters", () => {
  it("inserts from explicit stdin, lists its ID/version, and sets/shows the qualified queue", async () => {
    const h = createInboxHarness(); const out = sink();
    const ports: InboxHandlerPorts = { store: h.context.store, identity: "test-user", cwd: "/repo", now: h.context.now, output: out.output, readStdin: async () => "### **Captured**\n\nWork" };
    await handleRoute(undefined, { to: "personal", section: "Errand" }, undefined, ports);
    expect(out.value().exit).toBe(0);
    const routed = JSON.parse(out.value().stdout) as { entryId: string };
    const listed = sink(); await handleInbox("personal", { json: true }, undefined, { ...ports, output: listed.output });
    expect(JSON.parse(listed.value().stdout)).toMatchObject({ state: "listed", entries: [{ id: routed.entryId, version: expect.stringMatching(/^v1:/u) }] });
    const queue = sink(); await handleErrandQueueSet("-", undefined, { ...ports, output: queue.output, readStdin: async () => JSON.stringify({ schemaVersion: 1, members: [{ inbox: "personal", id: routed.entryId }] }) });
    expect(JSON.parse(queue.value().stdout)).toMatchObject({ state: "set", members: [{ id: routed.entryId }] });
    const show = sink(); await handleErrandQueue({ json: true }, undefined, { ...ports, output: show.output });
    expect(JSON.parse(show.value().stdout)).toMatchObject({ state: "listed", members: [{ id: routed.entryId, inbox: "personal" }] });
  });
  it("retires the title-keyed listing and mark writer before reading their inputs", async () => {
    const h = createInboxHarness(); const listing = sink(), marking = sink();
    const ports: InboxHandlerPorts = { store: h.context.store, identity: "test-user", cwd: "/repo", readStdin: async () => { throw new Error("Retired commands consume no request"); } };
    await handleUserInboxList({ target: "example", json: true }, undefined, { ...ports, output: listing.output });
    expect(JSON.parse(listing.value().stdout)).toMatchObject({ state: "refused", code: "unsupported", remedy: expect.stringContaining("arc inbox personal --target") });
    await handleUserInboxMarkExecuteBound("-", undefined, { ...ports, output: marking.output });
    expect(JSON.parse(marking.value().stdout)).toMatchObject({ state: "refused", code: "unsupported", diagnostics: [expect.stringContaining("arc errand queue set")] });
  });
});
it("removes a listed entry by ID/version and refuses title-file removal before reading it",async()=>{
 const h=createInboxHarness();await h.inbox("personal");const listed=sink();const ports:InboxHandlerPorts={store:h.context.store,identity:"test-user",cwd:"/repo",output:listed.output,readFile:async()=>{throw new Error("No title file read");}};
 await handleInbox("personal",{json:true},undefined,ports);const result=JSON.parse(listed.value().stdout) as {entries:{id:string;version:string}[]};const entry=result.entries[0];if(!entry)throw new Error("No row");
 const {handleUserInboxRemove}=await import("../../../src/handlers/user.js");const removed=sink();
 await handleUserInboxRemove(undefined,{id:entry.id,expectedVersion:entry.version},undefined,{...ports,output:removed.output});
 expect(JSON.parse(removed.value().stdout)).toMatchObject({status:"ok",result:{disposition:"removed"}});
 const refused=sink();await handleUserInboxRemove(undefined,{inboxTitleFile:"title.md"},undefined,{...ports,output:refused.output});
 expect(refused.value()).toMatchObject({exit:1,stderr:expect.stringContaining("--id <id> --expected-version <version>")});
});
