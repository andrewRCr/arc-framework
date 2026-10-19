/** Production registrations preserve the meta codec's observable parse outcomes. */
import { describe, expect, it } from "vitest";
import { createKindRegistry, FAMILY_REGISTRY, KIND_MECHANISMS } from "../../../../src/lib/store/registry.js";
import { familyOf, type KindId } from "../../../../src/lib/store/catalog.js";
import { PRODUCTION_REGISTRATIONS, RECORD_LINK_KINDS } from "../../../../src/lib/store/kinds/registrations.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { checkRecordLinks } from "../../../../src/lib/store/kinds/record-links.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import type { WriteCheckInput } from "../../../../src/lib/store/write-check.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";

describe("production kind registrations", () => {
  it("derives exactly the projecting stored kinds and preserves one registration per kind", () => {
    const derived = (Object.keys(KIND_MECHANISMS) as KindId[]).filter(kind =>
      KIND_MECHANISMS[kind].projection !== "never" && FAMILY_REGISTRY[familyOf(kind)].ref !== null
      && kind !== "personal/errand-queue");
    expect(RECORD_LINK_KINDS).toEqual(derived);
    expect([...RECORD_LINK_KINDS].sort()).toEqual([
      "work-item/meta", "work-item/task-list", "work-item/draft", "work-item/spec", "work-item/notes",
      "work-item/companion", "work-item/description", "work-item/inbound", "cohort/document", "project-inbox/inbox",
      "personal/inbox", "personal/working-memory", "personal/document", "personal/session-context",
    ].sort());
    expect(new Set(PRODUCTION_REGISTRATIONS.map(item => item.kind)).size).toBe(PRODUCTION_REGISTRATIONS.length);
    expect(() => createKindRegistry(PRODUCTION_REGISTRATIONS)).not.toThrow();
  });
  it("preserves original meta parsing, anchors, and check ordering", async () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const content = `${makeMetaFixture("example", { owner: "andrew" })}\n[x](relative.md)\n`;
    const parsed = META_REGISTRATION.parser?.(content);
    if (parsed?.success !== true) throw new Error("Expected a valid metadata fixture");
    const view = new ReferenceBackend();
    const input: WriteCheckInput = {
      reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
      writer: { kind: "hand-edit" }, before: view, after: view, next: { content, fields: parsed.data },
    };
    const original = await META_REGISTRATION.check?.(input) ?? [];
    expect(registry["work-item/meta"].parser).toBe(META_REGISTRATION.parser);
    expect(registry["work-item/meta"].anchorFields).toEqual(META_REGISTRATION.anchorFields);
    expect(await registry["work-item/meta"].check?.(input)).toEqual([...original, ...await checkRecordLinks(input)]);
  });
  it("adds a link-only check for a covered kind without its own registration", async () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const view = new ReferenceBackend();
    const input: WriteCheckInput = {
      reference: recordReferences["work-item/notes"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" })),
      writer: { kind: "verb", verb: "pause" }, before: view, after: view,
      next: { content: "[x](relative.md)", fields: undefined },
    };
    expect(registry["work-item/notes"].parser).toBeNull();
    expect(await registry["work-item/notes"].check?.(input)).toEqual([
      expect.objectContaining({ rule: "links.relative-in-movable" }),
    ]);
  });
  it("returns the meta fields from valid core-table content", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const parsed = registry["work-item/meta"].parser?.(makeMetaFixture("example", { owner: "andrew" }));
    expect(parsed).toMatchObject({ success: true, data: { state: "Active", owner: "andrew" } });
  });
  it("declares the parsed state-version handoff anchor", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    expect(registry["work-item/meta"].anchorFields).toEqual(["stateAtHandoff"]);
    const content = makeMetaFixture("example", { owner: "andrew" })
      .replace("\n---", "\n- **State at Handoff:** `state-version`\n\n---");
    expect(registry["work-item/meta"].parser?.(content)).toMatchObject({
      success: true, data: { stateAtHandoff: "state-version" },
    });
  });
  it("reports a malformed core table as a content parse failure", () => {
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const malformed = makeMetaFixture("example", { owner: "andrew" }).replace(/\| `Active`.*\n/u, "| `Active` |\n");
    expect(registry["work-item/meta"].parser?.(malformed)).toMatchObject({ success: false, error: expect.stringContaining("column-count mismatch") });
  });
});
