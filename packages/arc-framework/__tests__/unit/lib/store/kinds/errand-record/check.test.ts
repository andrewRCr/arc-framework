/** The production Errand check composes every shared slug violation. */
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../../../../../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
import { parseMetaRecord } from "../../../../../../src/lib/active/meta-reader.js";
import { makeMetaFixture } from "../../../../../helpers/meta-fixture.js";
const own = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const dependentUid = "00000000-0000-4000-8000-000000000003";
describe("registered Errand check", () => {
  it("returns both shared rules when a creation breaks both", async () => {
    const holder = ruleRecord("work-item/record", "current", other);
    const content = makeMetaFixture("dependent", { dependsOn: ["former"] });
    const dependent = ruleRecord("work-item/meta", "dependent", dependentUid, content, parseMetaRecord(content));
    const next = ruleRecord("work-item/record", "former", own);
    const before = ruleView([holder, dependent], new Map([["slug:former", { status: "ok", result: { reference: holder.reference } }]]));
    const check = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/record"].check;
    const broken = await check?.({ reference: next.reference, next: { content: "", fields: {} },
      writer: { kind: "verb", verb: "create" }, before, after: ruleView([next, dependent]) }) ?? [];
    expect(broken.map(({ rule }) => rule).sort()).toEqual(["work-item.former-slug", "work-item.slug-edges"]);
  });
  it("admits a creation taking an unused name and installs no replacement codec", async () => {
    const next = ruleRecord("work-item/record", "unused", own);
    const kind = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/record"];
    expect(kind.parser).toBeNull();
    expect(await kind.check?.({ reference: next.reference, next: { content: "", fields: {} },
      writer: { kind: "verb", verb: "create" }, before: ruleView(), after: ruleView([next]) })).toEqual([]);
  });
});
