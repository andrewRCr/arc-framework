/** Shared former-name protection over supplied state views. */
import { describe, expect, it } from "vitest";
import { checkFormerSlug } from "../../../../../../src/lib/store/kinds/work-item/former-slug.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";
import type { WriteCheckInput } from "../../../../../../src/lib/store/write-check.js";
const own = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
function change(name: string, before = ruleView(), prior?: WriteCheckInput["prior"]): WriteCheckInput {
  const next = ruleRecord("work-item/record", name, own);
  return { reference: next.reference, ...(prior === undefined ? {} : { prior }), next: { content: "", fields: {} },
    writer: { kind: "verb", verb: "create" }, before, after: ruleView([next]) };
}
describe("former slug rule", () => {
  it("admits a creation taking an unused slug", async () => {
    expect(await checkFormerSlug(change("unused"))).toEqual([]);
  });
});

function formerView(holderUid = other, withPrior = false) {
  const holder = ruleRecord("work-item/record", "current", holderUid);
  const original = ruleRecord("work-item/record", "previous", own);
  return ruleView(withPrior ? [holder, original] : [holder], new Map([
    ["slug:former", { status: "ok" as const, result: { reference: holder.reference } }],
  ]));
}
describe("former slug acquisition", () => {
  it.each([false, true])("refuses another generation's former slug on rename=%s", async (rename) => {
    const result = await checkFormerSlug(change("former", formerView(other, rename), rename ? { content: "" } : undefined));
    expect(result).toMatchObject([{ rule: "work-item.former-slug", condition: expect.stringContaining("current") }]);
  });
  it("admits a generation renamed back onto its own former slug", async () => {
    expect(await checkFormerSlug(change("former", formerView(own), { content: "" }))).toEqual([]);
  });
  it("admits an edit that acquires no new name", async () => {
    const original = ruleRecord("work-item/record", "former", own);
    expect(await checkFormerSlug(change("former", ruleView([original]), { content: "" }))).toEqual([]);
  });
  it("retains an unavailable lookup as a refusal and admits retry after repair", async () => {
    const before = ruleView([], new Map([["slug:unused", { status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", namespace: "work-item",
      condition: "Index unreadable.", remedy: { text: "Restore the index." },
    } }]]));
    expect(await checkFormerSlug(change("unused", before))).toMatchObject([{ rule: "work-item.former-slug" }]);
    expect(await checkFormerSlug(change("unused"))).toEqual([]);
  });
  it("admits a removal without acquiring a name", async () => {
    const input = change("unused");
    delete input.next;
    expect(await checkFormerSlug(input)).toEqual([]);
  });
});
