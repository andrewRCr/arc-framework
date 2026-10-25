/** Public import moves pending entries without leaving duplicate routing or execution work. */
import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { importComparisonFixture } from "../helpers/store/import-comparison.js";
import { importFixture, saveImportPersonal } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, createRefStore } from "../../src/lib/store/index.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { splitEntryList } from "../../src/lib/store/concurrency/entries.js";
import { generateRankBetween } from "../../src/lib/store/concurrency/rank.js";

const mark = "- _Disposition:_ `execute-bound`\n\n";
const held = "### **Held**\n\n- _Hold:_ `true`\n- _WU_Target:_ `alpha`\n- _Created:_ `2026-01-03`\n\nHeld prose.\n\n";
const buffer = "## Inbound Buffer — Pending Integration\n\n### **Buffered**\n\n- _Routed from:_ `USER-INBOX`, drain (2026-01-02).\n\nBuffered prose.\n\n";
const draft = `# Draft: Alpha\n\n**Purpose:** Explore the example.\n\n${buffer}## Decisions\n\nKeep this section.\n`;
const inbox = `# Inbox\n\n## Errand\n\n### **First**\n\n${mark}- _Id:_ \`12345678\`\n- _Hold:_ \`true\`\n- _WU_Target:_ \`alpha\`\n\nFirst prose.\n\n### **Second**\n\n${mark}Second prose.\n\n## Work Unit\n\n${held}### **Remain**\n\nRemain prose.\n`;

async function seed(h: Awaited<ReturnType<typeof importFixture>>, inboxContent = inbox, draftContent = draft): Promise<void> {
  await mkdir(join(h.root, ".arc/user/andrew"), { recursive: true });
  await writeFile(join(h.root, ".arc/user/andrew/USER-INBOX.md"), inboxContent);
  await writeFile(join(h.root, ".arc/active/draft-alpha.md"), draftContent);
  await h.git("git", ["add", ".arc/active/draft-alpha.md"]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Seed pending inbound work"]);
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", head]);
  await saveImportPersonal(h.root);
}
function parsed(content: string, kind: "personal/inbox" | "personal/errand-queue" | "work-item/inbound") {
  const result = parseEntryList(content, kind);
  if (!result.success) throw new Error(result.error);
  return result.data;
}
function ref(kind: "personal/inbox" | "personal/errand-queue" | "work-item/inbound") {
  return RecordReferenceSchema.parse({ kind, owner: kind === "work-item/inbound"
    ? { type: "work-item", name: "alpha" } : { type: "person", name: "andrew" } });
}

describe.each(["default", "separate"] as const)("pending import in %s", layout => {
  it("compares moved sources and reads queues and inbound entries without routing receipts", async () => {
    const h = await importComparisonFixture(layout, seed);
    h.comparators.set("work-item/draft", { normalize: (expected, actual) => ({
      expected: { ...expected, content: expected.content.replace(buffer, "") }, actual,
    }) });
    h.comparators.set("personal/inbox", { normalize: (expected, actual) => {
      const content = expected.content.replace(held, "").replaceAll(mark, "");
      return { expected: { ...expected, content, fields: parsed(content, "personal/inbox") }, actual };
    } });
    expect(await h.target.migrate()).toMatchObject({ status: "ok" });
    const queue = success(await h.store.read({ reference: ref("personal/errand-queue") }));
    const members = parsed(queue.content, "personal/errand-queue").entries;
    const captures = parsed(success(await h.store.read({ reference: ref("personal/inbox") })).content, "personal/inbox").entries;
    expect(members.map(entry => entry.id)).toEqual(captures.filter(entry => entry.section === "Errand").map(entry => entry.id));
    expect(members.map(entry => entry.title)).toEqual(["First", "Second"]);
    expect(members[0]?.id).toBe("12345678");
    expect(new Set(members.map(entry => entry.id)).size).toBe(2);
    expect(members.every(entry => entry.id !== undefined && entry.fields.Inbox === "personal")).toBe(true);
    for (const member of members) expect(() => generateRankBetween(member.fields.Rank!, null)).not.toThrow();
    expect(members[0]!.fields.Rank! < members[1]!.fields.Rank!).toBe(true);
    const inbound = success(await h.store.read({ reference: ref("work-item/inbound") }));
    const moved = parsed(inbound.content, "work-item/inbound").entries;
    expect(moved.map(entry => [entry.title, entry.fields.Created]))
      .toEqual([["Buffered", "2026-01-02"], ["Held", "2026-01-03"]]);
    const originalBuffer = splitEntryList(buffer, { shape: "heading", sections: ["Inbound Buffer — Pending Integration"] })
      .parts.filter(part => part.kind === "entry");
    const originalHeld = parsed(`## Work Unit\n\n${held}`, "personal/inbox").entries;
    const withoutMovedFields = (raw: string) => raw.replace(/^- _(?:Id|Created):_ `[^`]+`\n/gmu, "");
    expect(moved.map(entry => withoutMovedFields(entry.bytes)))
      .toEqual([...originalBuffer, ...originalHeld].map(entry => withoutMovedFields(entry.bytes)));
    expect(inbound.content).toContain("Buffered prose.");
    expect(inbound.content).toContain("Held prose.");
    expect(await h.compare()).toEqual([]);
    for (const kind of ["personal/routing-receipt", "project-inbox/routing-receipt"] as const) {
      expect(success(await h.store.list({ family: kind.startsWith("personal/") ? "personal" : "project-inbox", kind })))
        .toMatchObject({ status: "absent" });
    }
  }, 30_000);
});

it("moves every buffer entry across separators using each supplied destination grammar", async () => {
  const h = await importFixture();
  const base = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const inboundGrammar = { shape: "heading", sections: ["Custom inbound"] } as const;
  const queueGrammar = { shape: "heading", sections: ["Custom queue"] } as const;
  h.ports.registry = { ...base,
    "work-item/inbound": { ...base["work-item/inbound"], entry: inboundGrammar,
      parser: content => ({ success: true, data: splitEntryList(content, inboundGrammar) }) },
    "personal/errand-queue": { ...base["personal/errand-queue"], entry: queueGrammar,
      parser: content => ({ success: true, data: splitEntryList(content, queueGrammar) }) },
  };
  const later = "---\n\n### **Later**\n\n- _Routed from:_ `USER-INBOX`, drain\n  (2026-01-04).\n\nLater prose.\n\n";
  await seed(h, inbox, draft.replace(buffer, buffer + later));
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  const store = createRefStore(h.ports);
  const inbound = success(await store.read({ reference: ref("work-item/inbound") }));
  const moved = splitEntryList(inbound.content, inboundGrammar).parts.filter(part => part.kind === "entry");
  expect(moved.map(entry => entry.bytes.split("\n")[0])).toEqual(["### **Buffered**", "### **Later**", "### **Held**"]);
  expect(inbound.content).toContain("_Created:_ `2026-01-04`");
  expect(inbound.content).toContain("Later prose.");
  const queue = success(await store.read({ reference: ref("personal/errand-queue") }));
  expect(splitEntryList(queue.content, queueGrammar).parts.filter(part => part.kind === "entry")).toHaveLength(2);
}, 30_000);

it.each([
  ["malformed disposition", inbox.replace("### **Held**\n\n", "### **Held**\n\n- _Disposition:_ `execute`\n\n")],
  ["missing target", inbox.replaceAll("_WU_Target:_ `alpha`", "_WU_Target:_ `missing`")],
  ["undated routing", inbox],
])("refuses %s before landing and succeeds after repair", async (problem, personal) => {
  const h = await importFixture();
  await seed(h, personal, problem === "undated routing" ? draft.replace("2026-01-02", "unknown") : draft);
  const failed = await h.migrate();
  expect(failed).toMatchObject({ status: "refused", refusal: { code: "import-refused", report: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.any(String), remedy: { text: expect.stringContaining("retry") } }),
  ]) } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  await seed(h);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect(success(await createRefStore(h.ports).read({ reference: ref("work-item/inbound") })).content).toContain("Held prose.");
}, 30_000);

it.each([
  { defect: "missing inbox grammar", kind: "personal/inbox", entry: undefined, rule: undefined },
  { defect: "missing queue grammar", kind: "personal/errand-queue", entry: undefined, rule: undefined },
  { defect: "empty queue sections", kind: "personal/errand-queue", entry: { shape: "heading", sections: [] }, rule: undefined },
  { defect: "missing inbound grammar", kind: "work-item/inbound", entry: undefined, rule: undefined },
  { defect: "empty inbound sections", kind: "work-item/inbound", entry: { shape: "heading", sections: [] }, rule: undefined },
  { defect: "unmatched pending entries", kind: "personal/inbox", entry: { shape: "heading", sections: ["Other"] }, rule: "entry-id" },
] as const)("explains $defect before landing and accepts the repaired registry", async ({ kind, entry, rule }) => {
  const h = await importFixture();
  await seed(h);
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  h.ports.registry = { ...registry, [kind]: { ...registry[kind], entry } };
  const trial = await h.migrate(true);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  if (trial.status !== "ok") throw new Error("No trial report");
  expect(trial.result.refused).toEqual(rule ? [expect.objectContaining({ rule })] : []);
  expect(trial.result.notices).toEqual(expect.arrayContaining([expect.objectContaining({
    condition: expect.stringContaining(kind), remedy: { text: expect.stringMatching(/grammar|section|entr/iu) },
  })]));
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  h.ports.registry = registry;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});

it("preserves a queue source parser's condition without calling it an entry ID fault", async () => {
  const h = await importFixture();
  await seed(h);
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  h.ports.registry = { ...registry, "personal/inbox": { ...registry["personal/inbox"],
    parser: () => ({ success: false, error: "Inbox source is not accepted" }) } };
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { refused: [], notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("Inbox source is not accepted"),
      remedy: { text: expect.stringContaining("parser") } }),
  ]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
  h.ports.registry = registry;
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});

it("names the repeated pending entry ID and imports after correcting its source", async () => {
  const h = await importFixture();
  await seed(h, inbox.replace("### **Second**\n\n", "### **Second**\n\n- _Id:_ `12345678`\n"));
  const trial = await h.migrate(true);
  expect(trial).toMatchObject({ status: "ok", result: { refused: expect.arrayContaining([expect.objectContaining({ rule: "entry-id" })]),
    notices: expect.arrayContaining([expect.objectContaining({ condition: expect.stringContaining("12345678"),
      remedy: { text: expect.stringContaining("fresh ID") } })]) } });
  expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
  await seed(h);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
});
