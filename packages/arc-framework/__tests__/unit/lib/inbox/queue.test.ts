/** Queue setters preserve unchanged entry ranks and merge independent member moves. */
import { describe, expect, it } from "vitest";
import { createInboxHarness, entry } from "../../../helpers/inbox-harness.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { listErrandQueue, setErrandQueue } from "../../../../src/lib/inbox/queue.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { resolveQueueExecutionOffer } from "../../../../src/lib/inbox/offer.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const request = (...ids: string[]) => ({ schemaVersion: 1, members: ids.map((id) => ({ id, inbox: "personal" })) });
describe("identity Errand queue", () => {
  it.each(["\n", "\r\n"])("retains heading-spanning comments when reranking a queue member with %j endings", async (newline) => {
    const h = createInboxHarness();
    await h.inbox("personal", [entry("11111111", "One"), entry("22222222", "Two"), entry("33333333", "Three")].join("\n\n"));
    expect(await setErrandQueue(request("11111111", "22222222", "33333333"), h.context)).toMatchObject({ state: "set" });
    const ref = recordReferences["personal/errand-queue"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }));
    const prior = success(await h.context.store.read({ reference: ref }));
    const comment = "<!--\n- _Id:_ `deadbeef`\nKeep this heading note.\n-->";
    success(await h.context.store.write({ action: "put", reference: ref, expected: prior.version,
      content: prior.content.replace("### **Two**", `### **Two** ${comment}`).replaceAll("\n", newline),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await setErrandQueue(request("22222222", "11111111", "33333333"), h.context)).toMatchObject({ state: "set" });
    const saved = success(await h.context.store.read({ reference: ref }));
    expect(saved.content).toContain(comment.replaceAll("\n", newline));
    expect(await listErrandQueue(h.context)).toMatchObject({ state: "listed", members: [{ id: "22222222" }, { id: "11111111" }, { id: "33333333" }] });
  });
  it("repairs an admitted malformed rank through the whole-queue setter without overwriting a lost version", async () => {
    const h = createInboxHarness();
    await h.inbox("personal", [entry("11111111", "One"), entry("22222222", "Two")].join("\n\n"));
    await setErrandQueue(request("11111111", "22222222"), h.context);
    const ref = recordReferences["personal/errand-queue"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }));
    const prior = success(await h.context.store.read({ reference: ref }));
    const outside = "Queue instructions.\n<!-- Preserve this note. -->\n";
    success(await h.context.store.write({ action: "put", reference: ref, expected: prior.version,
      content: outside + prior.content.replace(/- _Rank:_ `[^`]+`/u, '- _Rank:_ `bad rank`'), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    expect(await listErrandQueue(h.context)).toMatchObject({ state: "refused", remedy: { text: expect.stringContaining("arc errand queue set") } });
    const malformedVersion = success(await h.context.store.version());
    expect(await setErrandQueue({ schemaVersion: 1, members: [{ inbox: "wrong", id: "11111111" }] }, h.context)).toMatchObject({ state: "refused", code: "invalid-input" });
    expect(success(await h.context.store.version())).toBe(malformedVersion);
    const repaired = await setErrandQueue(request("22222222", "11111111"), h.context);
    expect(repaired).toMatchObject({ state: "set", members: [{ id: "22222222" }, { id: "11111111" }] });
    const saved = success(await h.context.store.read({ reference: ref }));
    expect(saved.content).toContain(outside);
    expect(saved.content).not.toContain("bad rank");
    expect(await listErrandQueue(h.context)).toMatchObject({ state: "listed", members: [{ id: "22222222" }, { id: "11111111" }] });
    expect(await resolveQueueExecutionOffer(h.context)).toMatchObject({ status: "ok", result: { nextOffer: { key: "personal:22222222" } } });
    const racing = Object.create(h.context.store) as Store;
    racing.write = async input => {
      success(await h.context.store.write({ action: "remove", reference: ref, expected: saved.version, provenance: { verb: "edit", lifecycleAction: "edit" } }));
      return h.context.store.write(input);
    };
    expect(await setErrandQueue(request("11111111"), { ...h.context, store: racing })).toMatchObject({ state: "refused", code: "version-conflict" });
    expect(await h.context.store.read({ reference: ref })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await setErrandQueue(request("11111111"), h.context)).toMatchObject({ state: "set", members: [{ id: "11111111" }] });
  });
  it("sets, shows rank order, and moves only the member outside the earliest longest subsequence", async () => {
    const h = createInboxHarness(); await h.inbox("personal", [entry("11111111", "One"), entry("22222222", "Two"), entry("33333333", "Three")].join("\n\n"));
    const initial = await setErrandQueue(request("11111111", "22222222", "33333333"), h.context);
    expect(initial).toMatchObject({ state: "set", members: [{ id: "11111111" }, { id: "22222222" }, { id: "33333333" }] });
    if (initial.state === "refused") return;
    const changed = await setErrandQueue(request("22222222", "11111111", "33333333"), h.context);
    if (changed.state === "refused") throw new Error(changed.reason);
    expect(changed.members.map(({ id }) => id)).toEqual(["22222222", "11111111", "33333333"]);
    expect(changed.members.find(({ id }) => id === "11111111")?.rank).toBe(initial.members[0]?.rank);
    expect(changed.members.find(({ id }) => id === "33333333")?.rank).toBe(initial.members[2]?.rank);
    expect(await listErrandQueue(h.context)).toMatchObject({ state: "listed", members: changed.members });
  });
  it("refuses both inboxes' entries of one ID; choosing one then succeeds", async () => {
    const h = createInboxHarness(); await h.inbox("personal"); await h.inbox("project");
    const members = [{ inbox: "personal", id: "12345678" }, { inbox: "project", id: "12345678" }];
    expect(await setErrandQueue({ schemaVersion: 1, members }, h.context)).toMatchObject({ state: "refused", reason: expect.stringContaining("personal:12345678"), remedy: { text: expect.stringContaining("project:12345678") } });
    expect(await setErrandQueue({ schemaVersion: 1, members: members.slice(0, 1) }, h.context)).toMatchObject({ state: "set", members: [{ inbox: "personal", id: "12345678" }] });
  });
  it("keeps ranks in the stored bytes of untouched queue entries", async () => {
    const h = createInboxHarness(); await h.inbox("personal", [entry("11111111"), entry("22222222")].join("\n\n"));
    await setErrandQueue(request("11111111"), h.context);
    const ref = recordReferences["personal/errand-queue"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }));
    const before = success(await h.context.store.read({ reference: ref }));
    await setErrandQueue(request("11111111", "22222222"), h.context);
    const after = success(await h.context.store.read({ reference: ref }));
    expect(after.content).toContain(before.content.trim());
  });
});

it("merges independent whole-queue moves and conflicts only when both writers change one member", async () => {
  const h = createInboxHarness();
  await h.inbox("personal", ["11111111", "22222222", "33333333", "44444444"].map((id) => entry(id, id)).join("\n\n"));
  await setErrandQueue(request("11111111", "22222222", "33333333", "44444444"), h.context);
  await Promise.all([setErrandQueue(request("22222222", "11111111", "33333333", "44444444"), h.context), setErrandQueue(request("11111111", "22222222", "44444444", "33333333"), h.context)]);
  const shown = await listErrandQueue(h.context);
  if (shown.state === "refused") throw new Error(shown.reason);
  expect(shown.members.map(({ id }) => id)).toEqual(["22222222", "11111111", "44444444", "33333333"]);
  const ref = recordReferences["personal/errand-queue"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }));
  expect(success(await h.context.store.read({ reference: ref })).conflicts).toEqual([]);
  await Promise.all([setErrandQueue(request("44444444", "22222222", "11111111", "33333333"), h.context), setErrandQueue(request("22222222", "44444444", "11111111", "33333333"), h.context)]);
  expect(success(await h.context.store.read({ reference: ref })).conflicts).toHaveLength(1);
});
