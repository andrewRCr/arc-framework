/** Production semantic checks run before a projected edit can reach storage. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { checkWriteBackEdit } from "../../../../src/lib/store/projection/check-edit.js";
import { parseEntryList } from "../../../../src/lib/store/kinds/entry-list.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("the hand-edit check", () => {
  it("keeps verb-owned edits in their file and accepts the repaired edit", async () => {
    const content = makeMetaFixture("work-item-one", { owner: "andrew", workClass: "Light", priority: "P1",
      currentWorkflow: "process-task-loop", design: ["spec-work-item-one.md"] });
    const fixture = await createWriteBackFixture({ kind: "work-item/meta", content, identity: "andrew",
      fixture: createReferenceFixture({}, { "work-item/meta": { parser: META_REGISTRATION.parser } }) });
    fixtures.push(fixture);
    const broken = content.replace("`andrew`", "`someone-else`") + "\nAn independent note.\n";
    await fixture.edit(broken);
    const port = createWriteBackPort(fixture.context);
    const result = await port(fixture.request);
    expect(result).toMatchObject({ answer: "refused", mark: { reason: expect.stringContaining("meta.verb-owned-field") } });
    expect(fixture.reports).toEqual(expect.arrayContaining([
      expect.objectContaining({ mark: { reason: expect.stringContaining("meta.verb-owned-field"),
        remedy: expect.objectContaining({ text: expect.stringContaining("handover") }) } }),
    ]));
    expect(await fixture.file()).toContain(broken);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content } });
    const repaired = content + "\nAn independent note.\n";
    await fixture.edit(repaired);
    expect(await port(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: repaired } });
  });

  it.each([false, true])("checks the merged entries with a new ID-less entry: %s", async newEntry => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nfirst body\n\n"
      + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nsecond body\n\n"
      + "### [ ] **Third**\n\n- _Id:_ `33333333`\n\nthird body\n";
    const fixture = await createWriteBackFixture({ kind: "personal/inbox", content: base });
    fixtures.push(fixture);
    const remote = base + "\n[remote]: https://example.com/remote\n";
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: remote, provenance: { verb: "remote", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    const edit = newEntry ? base.replace("### [ ] **First**", "### [ ] **New**\n\n[Remote][remote]\n\n### [ ] **First**")
      : base.replace("first body", "[Remote][remote]");
    await fixture.edit(edit);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    const landed = await fixture.store.read({ reference: fixture.entry.reference });
    expect(landed).toMatchObject({ status: "ok", result: { content: expect.stringContaining("[remote]: https://example.com/remote") } });
    if (landed.status === "ok") {
      expect(landed.result.content).toContain("[Remote][remote]");
      if (newEntry) expect(landed.result.content).toMatch(/\*\*New\*\*\n- _Id:_ `[a-f0-9]{8}`/);
    }
  });

  it("can repair a stored record whose prior fields cannot be parsed", async () => {
    const content = "# Inbox\n\n## Errand\n\n### malformed title\n\n- _Id:_ `11111111`\n\nA retained entry.\n";
    expect(parseEntryList(content, "personal/inbox")).toMatchObject({ success: false });
    const fixture = await createWriteBackFixture({ kind: "personal/inbox", content,
      fixture: createReferenceFixture({}, { "personal/inbox": { parser: undefined } }) });
    fixtures.push(fixture);
    const repaired = content.replace("### malformed title", "### [ ] **Repaired**");
    await fixture.edit(repaired);
    expect(await createWriteBackPort(fixture.context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: repaired } });
  });

  it("reports every broken link rule and accepts the same edit with repaired links", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const content = "[Projected](/.arc/active/meta-example.md)\n\n[Undefined][missing]\n";
    await fixture.edit(content);
    const port = createWriteBackPort(fixture.context);
    expect(await port(fixture.request)).toMatchObject({ answer: "refused" });
    expect(fixture.reports.map(each => each.mark.reason)).toEqual([
      expect.stringContaining("links.into-projection"), expect.stringContaining("links.undefined-reference"),
    ]);
    expect(fixture.reports.every(each => each.mark.remedy.text.length > 0)).toBe(true);
    expect(await fixture.file()).toContain(content);
    const repaired = "`meta-example.md`\n\n[Defined][missing]\n\n[missing]: https://example.com\n";
    await fixture.edit(repaired);
    expect(await port(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: repaired } });
  });

  it("checks a newly adopted file without inventing prior content or fields", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    expect(await fixture.store.write({ action: "remove", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, provenance: { verb: "seed", lifecycleAction: "seed" } })).toMatchObject({ status: "ok" });
    expect(await checkWriteBackEdit({ context: fixture.context, request: fixture.request,
      base: { kind: "empty" }, content: "A newly adopted document.\n" })).toEqual({ status: "ok", result: [] });
  });
});
