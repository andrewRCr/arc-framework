/** Production entry grammars exercised through durable reference-store writes. */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../../helpers/store/reference-fixture.js";
import { seed, success } from "../../../../helpers/store/suite-tools.js";
import { ENTRY_CONFIGS, type EntryKind } from "../../../../../src/lib/store/kinds/entry-configs.js";
import { parseEntryList, writeEntryList } from "../../../../../src/lib/store/kinds/entry-list.js";
import { writeEntryFields } from "../../../../../src/lib/store/kinds/entry-fields.js";
import { ENTRY_REGISTRATIONS } from "../../../../../src/lib/store/kinds/entry-registration.js";
import type { KindId } from "../../../../../src/lib/store/catalog.js";
import { createKindRegistry, type KindDefinition } from "../../../../../src/lib/store/registry.js";
import { META_REGISTRATION } from "../../../../../src/lib/store/kinds/meta/registration.js";
import { LINEAGE_REGISTRATION } from "../../../../../src/lib/store/kinds/lineage/registration.js";
import { recordReferences } from "../../../../../src/lib/store/identity.js";
import { makeMetaFixture } from "../../../../helpers/meta-fixture.js";

const registry = createKindRegistry(ENTRY_REGISTRATIONS);
const productionEntries = Object.fromEntries(ENTRY_REGISTRATIONS.map(({ kind }) => [kind, registry[kind]]));
function createFixture(overrides: Partial<Record<KindId, Partial<KindDefinition>>> = {}) {
  return createReferenceFixture(ENTRY_CONFIGS, { ...productionEntries, ...overrides });
}

const provenance = { verb: "edit", lifecycleAction: "edit" };
describe("production entry reference writes", () => {
  it.each(Object.keys(ENTRY_CONFIGS) as EntryKind[])("round-trips %s with its production parser", async (kind) => {
    const fixture = createFixture();
    const config = ENTRY_CONFIGS[kind];
    const values: Record<string, string> = { Created: "2026-01-01", Remind: "true", Hold: "true", WU_Target: "example (planned)", Shapes: "Section 2", Cites: "87654321", Inbox: "personal", Rank: "a0" };
    const fields = Object.fromEntries(config.managedFields.flatMap((field) => values[field] === undefined ? [] : [[field, values[field]]]));
    const entry = config.shape === "heading" ? writeEntryFields("### **Title**\n\nProse", { ...fields, Id: "12345678" })
      : "**Title:**\n_Remove when: done._\n_Id:_ `12345678`\n\nProse";
    const content = `## ${config.sections[0]}\n\n${entry}\n`;
    const saved = await seed(fixture, fixture.reference(kind), content);
    const parsed = parseEntryList(saved.content, kind);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.entries[0]?.fields).toMatchObject(fields);
    expect(writeEntryList(parsed.data)).toBe(content);
  });
  it.each(["**Wrapped\nheader:**", "**Colonless**"])("refuses an invalid memory header before persistence: %s", async (header) => {
    const fixture = createFixture();
    const reference = fixture.reference("personal/working-memory");
    const result = await fixture.store.write({ action: "put", reference, expected: null, content: `## Memories\n${header}\n_Remove when: done._\n`, provenance });
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.refusal).toMatchObject({ code: "record-malformed", condition: expect.stringContaining("**Title:**") });
    expect((await fixture.store.read({ reference })).status).toBe("refused");
  });
  it.each(["\n", "\r\n"].flatMap((newline) => [" ", "\t"].flatMap((suffix) =>
    ["**Wrapped\nheader:**", "**Colonless**"].map((header) => ({ newline, suffix, header })))))(
    "persists memory only after repairing its header under a whitespace-suffixed section: $newline $suffix $header",
    async ({ newline, suffix, header }) => {
      const fixture = createFixture(), reference = fixture.reference("personal/working-memory");
      const content = `## Memories${suffix}\n**Good:**\n_Remove when: good._\n\n${header}\n_Remove when: done._\n`.replaceAll("\n", newline);
      const before = success(await fixture.store.version());
      expect(await fixture.store.write({ action: "put", reference, expected: null, content, provenance }))
        .toMatchObject({ status: "refused", refusal: { code: "record-malformed", condition: expect.stringContaining("**Title:**") } });
      expect(success(await fixture.store.version())).toBe(before);
      expect((await fixture.store.read({ reference })).status).toBe("refused");
      const repaired = content.replace(header.replaceAll("\n", newline), "**Fixed:**");
      expect((await fixture.store.write({ action: "put", reference, expected: null, content: repaired, provenance })).status).toBe("ok");
      const parsed = parseEntryList(success(await fixture.store.read({ reference })).content, "personal/working-memory");
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.entries).toHaveLength(2);
    });
  it("reads today's seeded memory and project inbox; ignores commented triggers and bold body prose", async () => {
    const memory = await readFile(new URL("../../../../../templates/user/WORKING-MEMORY.md", import.meta.url), "utf8");
    expect(parseEntryList(memory, "personal/working-memory").success).toBe(true);
    expect(parseEntryList("## Memories\n**Title:**\n_Remove when: done._\n\n**Bold body without a colon**\n", "personal/working-memory").success).toBe(true);
    const inbox = await readFile(new URL("../../../../../arc/backlog/ATOMIC-INBOX.template.md", import.meta.url), "utf8");
    expect(parseEntryList(inbox, "project-inbox/inbox").success).toBe(true);
  });
  it("refuses activation and retirement while production inbound entries remain", async () => {
    const fixture = createFixture({
      "work-item/meta": { parser: META_REGISTRATION.parser ?? null, check: META_REGISTRATION.check ?? null },
      "lineage/transition": { parser: LINEAGE_REGISTRATION.parser ?? null, check: LINEAGE_REGISTRATION.check ?? null },
    });
    const reference = fixture.reference("work-item/meta");
    const content = makeMetaFixture(reference.owner.name, { state: "Planning", owner: "test-user", workClass: "Light", priority: "P1", currentWorkflow: "generate-tasks", design: [`spec-${reference.owner.name}.md`] });
    const created = success(await fixture.store.write({ action: "put", reference, content, expected: null, placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const initial = success(await fixture.store.read({ reference: created.reference }));
    await seed(fixture, recordReferences["work-item/inbound"](initial.reference.owner), "## Inbound\n### **Concern**\n- _Id:_ `12345678`\n");
    const active = content.replace("`Planning`", "`Active`").replace("`generate-tasks`", "`process-task-loop`");
    const result = await fixture.store.write({ action: "put", reference: initial.reference, content: active, expected: initial.version, placement: { kind: "active" }, provenance: { verb: "activate", lifecycleAction: "activate" } });
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.refusal).toMatchObject({ code: "record-malformed", rule: "meta.inbound-held", remedy: { text: expect.stringContaining("route") } });
    const lineage = await fixture.store.write({ action: "put", reference: recordReferences["lineage/transition"](initial.reference.owner), expected: null,
      content: JSON.stringify({ schemaVersion: 2, origin: { name: initial.reference.owner.name, uid: initial.reference.owner.type === "work-item" ? initial.reference.owner.uid : undefined }, kind: "abandon", successors: [], incoming: [] }),
      provenance: { verb: "abandon", lifecycleAction: "abandon" } });
    expect(lineage.status).toBe("refused");
    if (lineage.status === "refused") expect(lineage.refusal).toMatchObject({ code: "record-malformed", rule: "lineage.inbound-held" });
  });
});
