/** The import writes descriptions, inbound lists, and queues in the grammar its backend's registry declares. */
import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { inboxEntrySourceDigest } from "../../src/lib/user-sync/inbox-writer.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { rejoinEntryList, splitEntryList, type ListEntry } from "../../src/lib/store/concurrency/entries.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { saveImportPersonal, type importFixture } from "../helpers/store/import-fixture.js";
import { seedTransients, transientCommon } from "../helpers/store/import-transients.js";
import { referenceDeclarations } from "../helpers/store/reference-fixture.js";
import { createConformanceTestRegistry } from "../helpers/store/test-registry.js";
import { success } from "../helpers/store/suite-tools.js";

const KINDS = ["work-item/description", "work-item/inbound", "personal/errand-queue"] as const;
const generic = createConformanceTestRegistry(referenceDeclarations.entryShapes);
const buffer = "## Inbound Buffer — Pending Integration\n\n### **Buffered**\n\n- _Routed from:_ `USER-INBOX`, drain (2026-01-02).\n\nBuffered prose.\n\n";
const draft = `# Draft: Alpha\n\n**Purpose:** Explore the example.\n\n${buffer}## Decisions\n\nKeep this section.\n`;
const mark = "- _Disposition:_ `execute-bound`\n\n";
const held = "### **Held**\n\n- _Hold:_ `true`\n- _WU_Target:_ `alpha`\n- _Created:_ `2026-01-03`\n\nHeld prose.\n\n";
const inbox = "# Inbox\n\n## Errand\n\n### **Captured**\n\n- _Description:_ Keep this source prose.\n\n"
  + `### **Queued**\n\n${mark}- _Id:_ \`12345678\`\n\nQueued prose.\n\n## Work Unit\n\n${held}### **Remain**\n\nRemain prose.\n`;

async function seed(fixture: Awaited<ReturnType<typeof importFixture>>): Promise<void> {
  await mkdir(join(fixture.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(fixture.root, ".arc/user/andrew/USER-INBOX.md"), inbox);
  await writeFile(join(fixture.root, ".arc/active/draft-alpha.md"), draft);
  await fixture.git("git", ["add", ".arc/active/draft-alpha.md"]);
  await fixture.git("git", ["commit", "-m", "Seed pending inbound work"]);
  await fixture.git("git", ["update-ref", "refs/heads/feat/alpha", (await fixture.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
  await saveImportPersonal(fixture.root);
  await seedTransients(fixture, [{ ...transientCommon, kind: "errand", purpose: "errand", slug: "captured", branch: "chore/captured",
    intent: "Fallback", origin: "inbox", originEntry: "Captured", originEntrySourceDigest: inboxEntrySourceDigest(inbox, "Captured"),
    state: "open", savedHead: null, changeRequest: null }]);
}

function entries(content: string, kind: (typeof KINDS)[number]): ListEntry[] {
  const grammar = generic[kind].entry;
  if (!grammar) throw new Error(`${kind} has no test grammar`);
  return splitEntryList(content, grammar).parts.filter((part): part is ListEntry => part.kind === "entry");
}

function sourceEntry(content: string, title: string): ListEntry {
  const found = splitEntryList(content, ENTRY_CONFIGS["personal/inbox"]).parts
    .find((part): part is ListEntry => part.kind === "entry" && part.bytes.startsWith(`### **${title}**`));
  if (!found) throw new Error(`Source entry ${title} missing`);
  return found;
}

describe.each(["default", "separate"] as const)("import under the conformance suite's entry grammars in %s", (layout) => {
  it("lands each entry kind in the registry's grammar, every entry its source's", async () => {
    const h = await importComparisonFixture(layout, seed);
    h.target.ports.registry = { ...h.target.ports.registry, ...Object.fromEntries(KINDS.map((kind) => [kind, generic[kind]])) } as
      typeof h.target.ports.registry;
    h.comparators.set("work-item/draft", { normalize: (expected, actual) => ({
      expected: { ...expected, content: expected.content.replace(buffer, "") }, actual,
    }) });
    h.comparators.set("work-item/record", { normalize: (expected, actual) => {
      const fields = JSON.parse(actual.content) as Record<string, unknown>;
      delete fields.owner;
      return { expected, actual: { ...actual, content: canonicalize(fields) } };
    } });
    h.comparators.set("personal/inbox", { normalize: (expected, actual) => {
      const split = splitEntryList(expected.content.replace(held, "").replaceAll(mark, ""), ENTRY_CONFIGS["personal/inbox"]);
      const content = rejoinEntryList({ parts: split.parts.filter((part) => part.kind !== "entry" || !part.bytes.startsWith("### **Captured**")) });
      const parsed = parseEntryList(content, "personal/inbox");
      if (!parsed.success) throw new Error(parsed.error);
      return { expected: { ...expected, content, fields: parsed.data }, actual };
    } });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    expect(await h.compare()).toEqual([]);
    const store = createRefStore(h.target.ports);
    const read = async (kind: (typeof KINDS)[number], owner: { type: "work-item" | "person"; name: string }) =>
      success(await store.read({ reference: RecordReferenceSchema.parse({ kind, owner }) })).content;
    const withoutMoved = (bytes: string) => bytes.replace(/^- _(?:Id|Created):_ `[^`]+`\n/gmu, "");

    const description = await read("work-item/description", { type: "work-item", name: "captured" });
    expect(withoutMoved(description)).toBe(`# captured\n\n## Entries\n\n${sourceEntry(inbox, "Captured").bytes}\n`);

    const inbound = entries(await read("work-item/inbound", { type: "work-item", name: "alpha" }), "work-item/inbound");
    const buffered = splitEntryList(buffer, { shape: "heading", sections: ["Inbound Buffer — Pending Integration"] }).parts
      .filter((part): part is ListEntry => part.kind === "entry");
    expect(inbound.map(({ section, bytes }) => [section, withoutMoved(bytes)]))
      .toEqual([...buffered, sourceEntry(inbox, "Held")].map(({ bytes }) => ["Entries", withoutMoved(bytes)]));

    const queue = entries(await read("personal/errand-queue", { type: "person", name: "andrew" }), "personal/errand-queue");
    expect(queue.map(({ section, id, bytes }) => [section, id, bytes.split("\n")[0]])).toEqual([["Entries", "12345678", "### **Queued**"]]);
    expect(queue[0]?.bytes).toContain("_Inbox:_ `personal`");
  }, 30_000);
});
