/** Recovery continuations cross the actual CLI parse tree and commit real Store outcomes. */
import { expect, it } from "vitest";
import { repairCliFixture, repairCli, cliRows, editRecord } from "../helpers/repair-cli.js";
import { entry } from "../helpers/inbox-harness.js";
import { addBareRemote } from "../helpers/integration.js";
import { success } from "../helpers/store/suite-tools.js";
import { resolveEntryList } from "../../src/lib/inbox/lists.js";
import type { Store } from "../../src/lib/store/contract.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readQueueState } from "../../src/lib/inbox/queue-storage.js";
import { resolveQueueExecutionOffer } from "../../src/lib/inbox/offer.js";

async function routedInboundNotes(newline: string) {
  const f = await repairCliFixture(), workUnit = await f.h.workUnit("origin-notes");
  const capture = (await cliRows(f, "project"))[0]; if (!capture) throw new Error("No project capture");
  expect(await repairCli(f, ["route", capture.id, "--from", "project", "--expected-version", capture.version,
    "--to", workUnit.reference.owner.name])).toMatchObject({ result: { state: "routed", entryId: capture.id } });
  const routed = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!routed) throw new Error("No routed inbound");
  const fields = routed.raw.split(/\r?\n/u).filter(line => line.startsWith("- "));
  expect(fields.at(-1)).toMatch(/^- _Routed from:_ project /u);
  const first = ["<!--", "First inbound note.", "-->"].join(newline);
  const second = ["<!--", "Second inbound note.", "-->"].join(newline);
  const footer = "<!-- Inbound document footer. -->";
  const inbound = await resolveEntryList(workUnit.reference.owner.name, f.h.context);
  if (inbound.status !== "ok" || !inbound.result.saved) throw new Error("No inbound record");
  await editRecord(f, inbound.result.saved, ["## Inbound", "", `### **Concern** ${first}`, second,
    ...fields, "", footer, ""].join(newline));
  const row = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!row) throw new Error("No annotated entry");
  expect(row.raw).toContain(first); expect(row.raw).toContain(second); expect(row.raw).not.toContain(footer);
  return { f, workUnit, row, first, second, footer };
}

it("keeps the capture gate clear for commented targets and names a visible held capture", async () => {
  const f = await repairCliFixture(), personal = await resolveEntryList("personal", f.h.context);
  if (personal.status !== "ok" || !personal.result.saved) throw new Error("No personal inbox");
  const comment = '<!--\n- WU_Target: example\n-->\n<!-- - _WU_Target:_ `example` -->';
  const content = `## Work Unit\n\n${entry()}\n- _Hold:_ \`true\`\n- WU_Target: elsewhere\n${comment}\nActual prose\n`;
  await editRecord(f, personal.result.saved, content);
  const saved = success(await f.h.context.store.read({ reference: personal.result.reference }));
  const list = (target: string) => repairCli(f, ["inbox", "personal", "--target", target, "--json"]);
  expect(await list("example")).toMatchObject({ exitCode: 0, result: { state: "clear", entries: [] } });
  expect(await list("elsewhere")).toMatchObject({ exitCode: 0, result: { state: "named", entries: [{ id: "12345678", held: true }] } });
  await editRecord(f, saved, content.replace(comment, ""));
  expect(await list("example")).toMatchObject({ exitCode: 0, result: { state: "clear", entries: [] } });
}, 30000);

it("routes the visible entry identity and fields while retaining commented examples", async () => {
  const f = await repairCliFixture(), source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const comment = '<!--\n- _Id:_ `deadbeef`\n- _Shapes:_ `Example decision`\n- _Routed from:_ example\n-->';
  await editRecord(f, source.result.saved, `## Inbox\n\n${entry()}\n- _Shapes:_ \`Actual decision\`\n${comment}\nActual prose\n`);
  const row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No capture");
  expect(await repairCli(f, ["route", row.id, "--from", "project", "--expected-version", row.version,
    "--to", "personal", "--section", "Errand"])).toMatchObject({ exitCode: 0, result: { state: "routed", entryId: row.id } });
  expect(await cliRows(f, "project")).toEqual([]);
  const destination = await cliRows(f, "personal");
  expect(destination).toMatchObject([{ id: row.id, raw: expect.stringContaining("Actual decision") }]);
  expect(destination[0]?.raw).toContain(comment);
  expect(destination[0]?.raw).toContain("Actual prose");
}, 30000);

it.each(["\n", "\r\n"])("keeps receipt and destination IDs equal through heading comments with %j endings", async (newline) => {
  const f = await repairCliFixture(), source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const comment = ["<!--", "", "Keep the heading note.", "-->"].join(newline);
  const capture = (id: string) => [`### **Concern** ${comment}`, `- _Id:_ \`${id}\``, "", "Actual prose"].join(newline);
  await editRecord(f, source.result.saved, `## Inbox${newline}${newline}${capture("12345678")}${newline}`);
  const row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No capture");
  expect(await repairCli(f, ["route", row.id, "--from", "project", "--expected-version", row.version,
    "--to", "personal", "--section", "Errand"])).toMatchObject({ result: { state: "routed", entryId: row.id } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, "personal")).toMatchObject([{ id: row.id, raw: expect.stringContaining(comment) }]);
  const receipts = success(await f.h.context.store.list({ family: "personal", kind: "personal/routing-receipt" }));
  expect(receipts).toMatchObject({ status: "complete", records: [{ fields: { entryId: row.id } }] });
  const workUnit = await f.h.workUnit("comment-heading");
  success(await f.h.context.store.write({ action: "put", reference: recordReferences["work-item/inbound"](workUnit.reference.owner),
    expected: null, content: `## Inbound${newline}${newline}${capture("87654321")}${newline}`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await repairCli(f, ["errand", "open", "comment-return", "--intent", "Other work", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const inbound = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!inbound) throw new Error("No inbound entry");
  expect(await repairCli(f, ["route", inbound.id, "--from", workUnit.reference.owner.name, "--expected-version", inbound.version,
    "--to", "comment-return"])).toMatchObject({ result: { state: "routed", entryId: inbound.id } });
  expect(await cliRows(f, "comment-return")).toEqual(expect.arrayContaining([expect.objectContaining({ id: inbound.id })]));
  expect(await repairCli(f, ["errand", "abandon", "comment-return", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  expect((await cliRows(f, "personal")).find(entry => entry.id === inbound.id)?.raw).toContain(comment);
  expect(await cliRows(f, "comment-return")).toEqual([]);
}, 30000);

it.each([
  { heading: "Concern", title: "Concern" },
  { heading: "Plain **bold** concern", title: "Plain **bold** concern" },
  { heading: "Concern <!--\nHeading note.\n-->", title: "Concern" },
])("routes an admitted $heading through an Errand and returns its full title on abandon", async ({ heading, title }) => {
  const f = await repairCliFixture(), workUnit = await f.h.workUnit("plain-heading");
  const reference = recordReferences["work-item/inbound"](workUnit.reference.owner);
  success(await f.h.context.store.write({ action: "put", reference, expected: null,
    content: `## Inbound\n\n${entry("87654321").replace("### **Concern**", `### [ ] ${heading}`)}\n<!-- Keep this comment. -->\nActual prose\n`, provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await repairCli(f, ["errand", "open", "plain-return", "--intent", "Other concern", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const row = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!row) throw new Error("No inbound entry");
  expect(await repairCli(f, ["route", row.id, "--from", workUnit.reference.owner.name, "--expected-version", row.version, "--to", "plain-return"])).toMatchObject({ result: { state: "routed" } });
  expect(await cliRows(f, workUnit.reference.owner.name)).toEqual([]);
  expect(await cliRows(f, "plain-return")).toEqual(expect.arrayContaining([expect.objectContaining({ id: row.id })]));
  if (heading.includes("<!--")) {
    const description = await resolveEntryList("plain-return", f.h.context);
    if (description.status !== "ok" || !description.result.saved) throw new Error("No description");
    await editRecord(f, description.result.saved, description.result.saved.content.replace("<!--\nHeading note.\n-->", "")
      .replace("### [ ] Concern", `### [ ] ${heading}`));
  }
  expect(await repairCli(f, ["errand", "abandon", "plain-return", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  expect(await cliRows(f, "plain-return")).toEqual([]);
  const returned = (await cliRows(f, "personal")).find(entry => entry.id === row.id);
  expect(returned).toMatchObject({ id: row.id, title, section: "Errand", raw: expect.stringContaining(`### [ ] **${title}**`) });
  expect(returned?.raw).toContain("<!-- Keep this comment. -->"); expect(returned?.raw).toContain("Actual prose");
}, 30000);

it.each(["\n", "\r\n"])("carries a heading-only comment through route and onward route with %j endings", async newline => {
  const f = await repairCliFixture(), source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const comment = ["<!--", "Keep this capture note.", "-->"].join(newline);
  await editRecord(f, source.result.saved, [`## Inbox`, "", `### **Concern** ${comment}`, '- _Id:_ `12345678`', ""].join(newline));
  const row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No capture");
  expect(await repairCli(f, ["route", row.id, "--from", "project", "--expected-version", row.version, "--to", "personal", "--section", "Errand"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  const onward = (await cliRows(f, "personal"))[0];
  expect(onward).toMatchObject({ id: row.id, title: "Concern", raw: expect.stringContaining(comment) });
  if (!onward) throw new Error("No routed capture");
  expect(await repairCli(f, ["route", onward.id, "--from", "personal", "--expected-version", onward.version, "--to", "project"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  expect(await cliRows(f, "personal")).toEqual([]);
  expect(await cliRows(f, "project")).toMatchObject([{ id: row.id, title: "Concern", raw: expect.stringContaining(comment) }]);
  const personal = await resolveEntryList("personal", f.h.context);
  if (personal.status !== "ok" || !personal.result.saved) throw new Error("No personal record");
  expect(personal.result.saved.content).not.toContain(comment);
  expect(success(await f.h.context.store.list({ family: "personal", kind: "personal/routing-receipt" })))
    .toMatchObject({ status: "complete", records: [
      expect.objectContaining({ fields: expect.objectContaining({ entryId: row.id, destination: expect.objectContaining({ list: "personal" }) }) }),
      expect.objectContaining({ fields: expect.objectContaining({ entryId: row.id, destination: expect.objectContaining({ list: "project" }) }) }),
    ] });
}, 30000);

it.each(["\n", "\r\n"])("returns an Errand's heading-only comment on abandon with %j endings", async newline => {
  const f = await repairCliFixture(), workUnit = await f.h.workUnit("heading-note");
  const comment = ["<!--", "Keep this return note.", "-->"].join(newline);
  success(await f.h.context.store.write({ action: "put", reference: recordReferences["work-item/inbound"](workUnit.reference.owner), expected: null,
    content: ["## Inbound", "", `### [ ] Concern ${comment}`, '- _Id:_ `87654321`', ""].join(newline), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await repairCli(f, ["errand", "open", "heading-note-return", "--intent", "Other concern", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const row = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!row) throw new Error("No inbound entry");
  expect(await repairCli(f, ["route", row.id, "--from", workUnit.reference.owner.name, "--expected-version", row.version, "--to", "heading-note-return"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  expect(await repairCli(f, ["errand", "abandon", "heading-note-return", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const returned = (await cliRows(f, "personal")).find(entry => entry.id === row.id);
  expect(returned).toMatchObject({ title: "Concern", raw: expect.stringContaining(comment) });
  expect(await cliRows(f, "heading-note-return")).toEqual([]);
}, 30000);

it.each(["\n", "\r\n"].flatMap(newline => ["next-line", "blank-line", "interleaved"].map(layout =>
  ({ newline, layout, ending: newline === "\n" ? "LF" : "CRLF" }))))(
  "carries both field-group notes through onward routing with $layout and $ending", async ({ newline, layout }) => {
  const f = await repairCliFixture(), source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const first = ["<!--", "First heading note.", "-->"].join(newline);
  const second = ["<!--", "Second entry note.", "-->"].join(newline);
  const footer = "<!-- Project-level footer. -->";
  const between = layout === "blank-line" ? [""] : layout === "interleaved" ? ['- _Created:_ `2026-01-01`'] : [];
  await editRecord(f, source.result.saved, ["## Inbox", "", `### **Concern **bold** note** ${first}`, ...between, second,
    '- _Id:_ `12345678`', "", footer, ""].join(newline));
  const row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No capture");
  expect(row.raw).toContain(second);
  expect(row.raw).not.toContain(footer);
  expect(await repairCli(f, ["route", row.id, "--from", "project", "--expected-version", row.version, "--to", "personal", "--section", "Errand"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  const onward = (await cliRows(f, "personal"))[0]; if (!onward) throw new Error("No routed capture");
  expect.soft(onward.raw).toContain(second);
  expect(onward).toMatchObject({ id: row.id, title: "Concern **bold** note", raw: expect.stringContaining(first) });
  expect(await repairCli(f, ["route", onward.id, "--from", "personal", "--expected-version", onward.version, "--to", "project"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  const returned = (await cliRows(f, "project"))[0];
  expect(returned).toMatchObject({ id: row.id, title: "Concern **bold** note", raw: expect.stringContaining(first) });
  expect.soft(returned?.raw).toContain(second);
  expect(returned?.raw).not.toContain(footer);
  const personal = await resolveEntryList("personal", f.h.context), project = await resolveEntryList("project", f.h.context);
  if (personal.status !== "ok" || !personal.result.saved || project.status !== "ok" || !project.result.saved) throw new Error("No persisted inboxes");
  expect.soft(personal.result.saved.content).not.toContain(second);
  expect(personal.result.saved.content).not.toContain(first);
  expect(project.result.saved.content.split(footer)).toHaveLength(2);
  expect(success(await f.h.context.store.list({ family: "personal", kind: "personal/routing-receipt" })))
    .toMatchObject({ status: "complete", records: [
      expect.objectContaining({ fields: expect.objectContaining({ entryId: row.id, destination: expect.objectContaining({ list: "personal" }) }) }),
      expect.objectContaining({ fields: expect.objectContaining({ entryId: row.id, destination: expect.objectContaining({ list: "project" }) }) }),
    ] });
}, 30000);

it.each(["\n", "\r\n"])("returns interspersed entry notes from an Errand with %j endings", async newline => {
  const f = await repairCliFixture(), workUnit = await f.h.workUnit("field-notes");
  const first = ["<!--", "First return note.", "-->"].join(newline), second = ["<!--", "Second return note.", "-->"].join(newline);
  success(await f.h.context.store.write({ action: "put", reference: recordReferences["work-item/inbound"](workUnit.reference.owner), expected: null,
    content: ["## Inbound", "", `### [ ] Concern ${first}`, '- _Created:_ `2026-01-01`', second, '- _Id:_ `87654321`', ""].join(newline),
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await repairCli(f, ["errand", "open", "field-notes-return", "--intent", "Other concern", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const row = (await cliRows(f, workUnit.reference.owner.name))[0]; if (!row) throw new Error("No inbound entry");
  expect(await repairCli(f, ["route", row.id, "--from", workUnit.reference.owner.name, "--expected-version", row.version, "--to", "field-notes-return"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  expect(await repairCli(f, ["errand", "abandon", "field-notes-return", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const returned = (await cliRows(f, "personal")).find(entry => entry.id === row.id);
  expect(returned).toMatchObject({ id: row.id, title: "Concern", raw: expect.stringContaining(first) });
  expect(returned?.raw).toContain(second);
  expect(await cliRows(f, "field-notes-return")).toEqual([]);
}, 30000);

it.each(["\n", "\r\n"])("keeps generated-origin entry notes through onward routing with %j endings", async newline => {
  const { f, workUnit, row, first, second, footer } = await routedInboundNotes(newline);
  expect(await repairCli(f, ["route", row.id, "--from", workUnit.reference.owner.name, "--expected-version", row.version,
    "--to", "personal", "--section", "Errand"])).toMatchObject({ result: { state: "routed", entryId: row.id } });
  const onward = (await cliRows(f, "personal"))[0]; if (!onward) throw new Error("No personal entry");
  expect(onward).toMatchObject({ id: row.id, title: "Concern", raw: expect.stringContaining(first) });
  expect.soft(onward.raw).toContain(second);
  expect(await repairCli(f, ["route", onward.id, "--from", "personal", "--expected-version", onward.version, "--to", "project"]))
    .toMatchObject({ result: { state: "routed", entryId: row.id } });
  const returned = (await cliRows(f, "project"))[0];
  expect(returned).toMatchObject({ id: row.id, raw: expect.stringContaining(first) });
  expect.soft(returned?.raw).toContain(second);
  const personal = await resolveEntryList("personal", f.h.context), inbound = await resolveEntryList(workUnit.reference.owner.name, f.h.context);
  if (personal.status !== "ok" || !personal.result.saved || inbound.status !== "ok" || !inbound.result.saved) throw new Error("No persisted list");
  expect.soft(personal.result.saved.content).not.toContain(second);
  expect(inbound.result.saved.content).not.toContain(first); expect(inbound.result.saved.content).not.toContain(second);
  expect(inbound.result.saved.content.split(footer)).toHaveLength(2); expect(returned?.raw).not.toContain(footer);
}, 30000);

it.each(["\n", "\r\n"])("keeps generated-origin entry notes through Errand return with %j endings", async newline => {
  const { f, workUnit, row, first, second } = await routedInboundNotes(newline);
  expect(await repairCli(f, ["errand", "open", "origin-notes-return", "--intent", "Other concern", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  expect(await repairCli(f, ["route", row.id, "--from", workUnit.reference.owner.name, "--expected-version", row.version,
    "--to", "origin-notes-return"])).toMatchObject({ result: { state: "routed", entryId: row.id } });
  const description = (await cliRows(f, "origin-notes-return")).find(entry => entry.id === row.id);
  expect(description?.raw).toContain(first); expect.soft(description?.raw).toContain(second);
  expect(await repairCli(f, ["errand", "abandon", "origin-notes-return", "--json"]))
    .toMatchObject({ result: { outcome: "applied" } });
  const returned = (await cliRows(f, "personal")).find(entry => entry.id === row.id);
  expect(returned).toMatchObject({ id: row.id, title: "Concern", raw: expect.stringContaining(first) });
  expect.soft(returned?.raw).toContain(second);
  const saved = await resolveEntryList("origin-notes-return", f.h.context);
  if (saved.status !== "ok" || !saved.result.saved) throw new Error("No saved description");
  expect.soft(saved.result.saved.content).not.toContain(second);
  expect(await cliRows(f, "origin-notes-return")).toEqual([]);
}, 30000);

it("lists actual captures, refuses an invalid target filter, and routes a stale entry only after listing its new version", async () => {
  const f = await repairCliFixture(), original = (await cliRows(f, "project"))[0];
  if (!original) throw new Error("No capture");
  const before = success(await f.h.context.store.version());
  expect(await repairCli(f, ["inbox", "project", "--target", "target", "--json"])).toMatchObject({ exitCode: 1, result: { state: "refused", remedy: { text: expect.stringContaining("arc inbox personal --target") } } });
  expect(success(await f.h.context.store.version())).toBe(before);
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  await editRecord(f, source.result.saved, source.result.saved.content.replace("Prose", "Edited capture"));
  const args = ["route", original.id, "--from", "project", "--expected-version", original.version, "--to", "personal", "--section", "Errand"];
  expect(await repairCli(f, args)).toMatchObject({ exitCode: 1, result: { state: "refused", remedy: { text: expect.stringContaining("arc inbox <list>") } } });
  expect(await cliRows(f, "personal")).toEqual([]);
  const fresh = (await cliRows(f, "project"))[0]; if (!fresh) throw new Error("No fresh capture");
  args[5] = fresh.version;
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, "personal")).toMatchObject([{ id: original.id, raw: expect.stringContaining("Edited capture") }]);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("retains a stale stable-ID removal, removes its fresh version, and replays as absent", async () => {
  const f = await repairCliFixture(); const source = await resolveEntryList("personal", f.h.context);
  if(source.status !== "ok" || !source.result.saved) throw new Error("No source");
  await editRecord(f, source.result.saved, `## Work Unit\n\n${entry()}\n`);
  const saved = success(await f.h.context.store.read({ reference: source.result.reference }));
  const original = (await cliRows(f, "personal"))[0]; if (!original) throw new Error("No capture");
  await editRecord(f, saved, saved.content.replace("Prose", "Keep changed capture"));
  const args = ["user", "inbox-remove", "--id", original.id, "--expected-version", original.version];
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "retained" } } });
  const fresh = (await cliRows(f, "personal"))[0]; if (!fresh) throw new Error("Edited capture lost");
  expect(fresh.raw).toContain("Keep changed capture"); args[5] = fresh.version;
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "removed" } } });
  expect(await cliRows(f, "personal")).toEqual([]);
  expect(await repairCli(f, args)).toMatchObject({ result: { status: "ok", result: { disposition: "absent" } } });
}, 30000);

it("refuses duplicate queue IDs across inboxes and accepts a repaired single member", async () => {
  const f = await repairCliFixture(); const personal = await resolveEntryList("personal", f.h.context);
  if(personal.status !== "ok" || !personal.result.saved) throw new Error("No inbox");
  await editRecord(f, personal.result.saved, `## Work Unit\n\n${entry()}\n`);
  const invoke = (members: { inbox: string; id: string }[]) => repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members }) });
  const before = success(await f.h.context.store.version());
  const member = { inbox: "project", id: "12345678" };
  expect(await invoke([member, { ...member, inbox: "personal" }])).toMatchObject({ exitCode: 1, result: { state: "refused", reason: expect.stringContaining("12345678") } });
  expect(success(await f.h.context.store.version())).toBe(before);
  expect(await invoke([member])).toMatchObject({ result: { state: "set", members: [member] } });
  expect(await repairCli(f, ["errand", "queue", "--json"])).toMatchObject({ result: { state: "listed", members: [member] } });
}, 30000);

it("repairs an admitted malformed queue rank with the command its listing advertises", async () => {
  const f = await repairCliFixture();
  const member = { inbox: "project", id: "12345678" };
  const set = () => repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members: [member] }) });
  expect(await set()).toMatchObject({ result: { state: "set" } });
  const queue = await readQueueState(f.h.context);
  if (queue.status !== "ok" || !queue.result.saved) throw new Error("No queue");
  const outside = "Queue instructions.\n<!-- Keep this note. -->\n";
  await editRecord(f, queue.result.saved, outside + queue.result.saved.content.replace(/- _Rank:_ `[^`]+`/u, '- _Rank:_ `bad rank`'));
  expect(await repairCli(f, ["errand", "queue", "--json"])).toMatchObject({ exitCode: 1, result: { state: "refused", remedy: { text: expect.stringContaining("arc errand queue set") } } });
  expect(await set()).toMatchObject({ exitCode: 0, result: { state: "set", members: [member] } });
  expect(await repairCli(f, ["errand", "queue", "--json"])).toMatchObject({ exitCode: 0, result: { state: "listed", members: [member] } });
  const repaired = success(await f.h.context.store.read({ reference: queue.result.reference }));
  expect(repaired.content).toContain(outside);
  expect(repaired.content).not.toContain("bad rank");
  expect(await resolveQueueExecutionOffer(f.h.context)).toMatchObject({ status: "ok", result: { nextOffer: { key: "project:12345678" } } });
}, 30000);

it("keeps a survivor through destination rename and failed atomic carry, then replaces only its held capture on retry", async () => {
  const f = await repairCliFixture(), target = await f.h.workUnit();
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const saved = source.result.saved, row = (await cliRows(f, "project"))[0]; if (!row) throw new Error("No row");
  const racing = Object.create(f.h.context.store) as Store;
  racing.batch = async input => { await editRecord(f, saved, saved.content.replace("Prose", "Surviving prose")); return f.h.context.store.batch(input); };
  const args = ["route", row.id, "--from", "project", "--expected-version", row.version, "--to", target.reference.owner.name];
  expect(await repairCli(f, args, { store: racing })).toMatchObject({ result: { state: "routed" } });
  const survivor = (await cliRows(f, "project"))[0]; if (!survivor) throw new Error("Survivor lost");
  const uid = target.reference.owner.type === "work-item" ? target.reference.owner.uid : undefined;
  expect(survivor).toMatchObject({ survivor: { home: { list: uid } } }); args[5] = survivor.version;
  const renamed = `${target.reference.owner.name}-after`;
  success(await f.h.context.store.write({ action: "put", reference: { ...target.reference,
    owner: OwnerIdentitySchema.parse({ ...target.reference.owner, name: renamed }) }, expected: target.version,
    content: target.content.replaceAll(target.reference.owner.name, renamed), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  if (uid === undefined) throw new Error("Generation UID required");
  args[7] = uid;
  const failed = Object.create(f.h.context.store) as Store;
  failed.batch = async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "project", condition: "Crash before atomic carry commit", remedy: { text: "Repair the Store and retry." } } });
  const before = success(await f.h.context.store.version());
  expect(await repairCli(f, args, { store: failed })).toMatchObject({ exitCode: 1, result: { state: "refused", reason: expect.stringContaining("Crash before atomic carry commit") } });
  expect(success(await f.h.context.store.version())).toBe(before);
  expect(await cliRows(f, "project")).toMatchObject([{ raw: expect.stringContaining("Surviving prose") }]);
  expect(await cliRows(f, target.reference.owner.name)).toMatchObject([{ raw: expect.stringContaining("Prose") }]);
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed", carried: "replaced" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await cliRows(f, target.reference.owner.name)).toMatchObject([{ id: row.id, raw: expect.stringContaining("Surviving prose") }]);
}, 30000);

it("refuses a full abandon collision, carries the survivor by its named repair, and returns both captures on retry", async () => {
  const f = await repairCliFixture();
  const source = await resolveEntryList("project", f.h.context);
  if (source.status !== "ok" || !source.result.saved) throw new Error("No source");
  const saved = source.result.saved, racing = Object.create(f.h.context.store) as Store;
  let raced = false;
  racing.batch = async input => {
    if (!raced && input.provenance.verb === "errand-open") { raced = true; await editRecord(f, saved, saved.content.replace("Concern", "Survivor concern")); }
    return f.h.context.store.batch(input);
  };
  expect(await repairCli(f, ["errand", "open", "collision", "--from-inbox", "project:12345678", "--json"], { store: racing })).toMatchObject({ result: { outcome: "applied" } });
  const beforeRefusal = success(await f.h.context.store.version());
  const refused = await repairCli(f, ["errand", "abandon", "collision", "--json"]);
  expect(refused, JSON.stringify(refused)).toMatchObject({ exitCode: 1 });
  expect(success(await f.h.context.store.version())).toBe(beforeRefusal);
  expect(await readWorktreeMarker(f.cwd)).toMatchObject({ kind: "present", marker: { createdFor: { kind: "errand", slug: "collision" } } });
  expect(refused.stdout + refused.stderr).toContain("Survivor concern"); expect(refused.stdout + refused.stderr).toContain("Concern");
  const survivor = (await cliRows(f, "project"))[0]; if (!survivor) throw new Error("No survivor");
  const args = ["route", survivor.id, "--from", "project", "--expected-version", survivor.version, "--to", "collision"];
  expect(refused.stdout + refused.stderr).toContain(`arc ${args.join(" ")}`);
  expect(await repairCli(f, args)).toMatchObject({ result: { state: "routed", carried: "cited" } });
  expect(await cliRows(f, "project")).toEqual([]);
  expect(await repairCli(f, ["errand", "abandon", "collision", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const returned = [...await cliRows(f, "project"), ...await cliRows(f, "personal")];
  expect(returned.map(row => row.title).sort()).toEqual(["Concern", "Survivor concern"]);
  expect(await cliRows(f, "collision")).toEqual([]); expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);

it("abandons a partial Errand without changing its capture or queue", async () => {
  const f = await repairCliFixture("partial");
  await addBareRemote(f.cwd); await f.exec("git", ["push", "-u", "origin", "main"]);
  await repairCli(f, ["errand", "queue", "set", "-"], { stdin: JSON.stringify({ schemaVersion: 1, members: [{ inbox: "project", id: "12345678" }] }) });
  expect(await repairCli(f, ["errand", "open", "partial-abandon", "--from-inbox", "project:12345678", "--json"])).toMatchObject({ result: { outcome: "applied" } });
  const before = await cliRows(f, "project"), queue = await repairCli(f, ["errand", "queue", "--json"]);
  const abandoned = await repairCli(f, ["errand", "abandon", "partial-abandon", "--json"]);
  expect(abandoned, JSON.stringify(abandoned)).toMatchObject({ result: { outcome: "applied" } });
  expect(await cliRows(f, "project")).toEqual(before);
  expect((await repairCli(f, ["errand", "queue", "--json"])).result).toEqual(queue.result);
  expect(await readWorktreeMarker(f.cwd)).toEqual({ kind: "absent" });
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(f.head);
}, 30000);
