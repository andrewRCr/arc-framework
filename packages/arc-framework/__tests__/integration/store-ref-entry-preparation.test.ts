import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { splitEntryList } from "../../src/lib/store/concurrency/index.js";
import { makeGitExec } from "../helpers/integration.js";

describe("ref entry preparation", () => {
  it("stamps identical UID-less puts over absence identically after declaring the grammar", async () => {
    const stored: string[] = [];
    const content = "# List\r\n\r\n## Entries\r\n\r\n### **Typed entry**\r\n\r\nbody\r\n";
    for (const operation of ["write", "batch"] as const) {
      const fixture = await createRefFixture();
      await seed(fixture, fixture.reference("work-item/meta"));
      const reference = fixture.reference("work-item/inbound");
      const registry = fixture.ports.registry;
      if (!registry) throw new Error("No fixture registry");
      const undeclared = createRefStore({ ...fixture.ports, registry: { ...registry,
        "work-item/inbound": { ...registry["work-item/inbound"], entry: undefined } } });
      const mutation = { action: "put" as const, reference, expected: null, content };
      const refused = operation === "write" ? await undeclared.write({ ...mutation, provenance: testProvenance })
        : await undeclared.batch({ writes: [mutation], provenance: testProvenance });
      expect(refused).toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "unhomed-kind" } });
      const store = createRefStore({ ...fixture.ports, random: () => { throw new Error("Stamping used port randomness"); } });
      if (operation === "write") success(await store.write({ ...mutation, provenance: testProvenance }));
      else success(await store.batch({ writes: [mutation], provenance: testProvenance }));
      const record = success(await store.read({ reference }));
      const entries = splitEntryList(record.content, { shape: "heading", sections: ["Entries"] }).parts.filter((part) => part.kind === "entry");
      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).toMatch(/^[0-9a-f]{8}$/u);
      expect(record.content.replace(/- _Id:_ `[0-9a-f]{8}`\r\n/gu, "")).toBe(content);
      stored.push(record.content);
    }
    expect(stored[0]).toBe(stored[1]);
  });

  it.each(["personal/inbox", "personal/working-memory"] as const)("preserves existing IDs, bytes, and already-stamped updates for %s", async (kind) => {
    const fixture = await createRefFixture();
    const reference = fixture.reference(kind);
    const field = kind === "personal/working-memory";
    const section = field ? "Memories" : "Errand";
    const header = (name: string) => field ? `**${name}:**\r\n_Remove when:_ settled` : `### **${name}**`;
    const content = `## ${section}\r\n\r\n${header("First")}\r\n${field ? "" : "- "}_Id:_ \`1234abcd\`\r\n\r\nbody\r\n\r\n${header("Second")}\r\n\r\nnew body\r\n`;
    const record = await seed(fixture, reference, content);
    const ids = splitEntryList(record.content, { shape: field ? "field-header" : "heading", sections: [section] }).parts
      .filter((part) => part.kind === "entry").map((part) => part.id);
    expect(ids[0]).toBe("1234abcd");
    expect(ids[1]).toMatch(/^[0-9a-f]{8}$/u);
    expect(new Set(ids).size).toBe(2);
    expect(record.content.replace(new RegExp(`${field ? "" : "- "}_Id:_ \`${ids[1]}\`\\r\\n`, "u"), "")).toBe(content);
    success(await fixture.store.write({ action: "put", reference: record.reference, expected: record.version,
      content: record.content, provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference: record.reference })).content).toBe(record.content);
  });

  it("rechecks the projection cap after the backend adds entry IDs without publishing a partial batch", async () => {
    const fixture = await createRefFixture();
    const reference = fixture.reference("personal/inbox");
    const header = "## Errand\n\n### **Large entry**\n\n";
    const content = header + "x".repeat(1_048_576 - Buffer.byteLength(header));
    const counter = fixture.reference("project-registry/counter");
    const git = makeGitExec(fixture.root);
    expect(await fixture.store.batch({ writes: [
      { action: "put", reference: counter, expected: null, content: "{}" },
      { action: "put", reference, expected: null, content },
    ], provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.size-cap", reference } });
    expect((await git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    success(await fixture.store.write({ action: "put", reference, expected: null, content: header + "short", provenance: testProvenance }));
  });

  it.each(["duplicate ID", "missing removal trigger"] as const)("refuses %s atomically and admits the corrected batch", async (defect) => {
    const fixture = await createRefFixture();
    const duplicate = defect === "duplicate ID";
    const reference = fixture.reference(duplicate ? "personal/inbox" : "personal/working-memory");
    const counter = fixture.reference("project-registry/counter");
    const broken = duplicate ? "## Errand\n\n### **First**\n- _Id:_ `1234abcd`\n\n### **Second**\n- _Id:_ `1234abcd`\n"
      : "## Memories\n\n**Memory:**\nbody\n";
    const fixed = duplicate ? broken.replace("### **Second**\n- _Id:_ `1234abcd`", "### **Second**")
      : broken.replace("**Memory:**", "**Memory:**\n_Remove when:_ settled");
    const batch = (content: string) => ({ writes: [
      { action: "put" as const, reference: counter, expected: null, content: "{}" },
      { action: "put" as const, reference, expected: null, content },
    ], provenance: testProvenance });
    expect(await fixture.store.batch(batch(broken))).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      reference, condition: expect.stringContaining(duplicate ? "1234abcd" : "Memory") } });
    expect((await makeGitExec(fixture.root)("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    success(await fixture.store.batch(batch(fixed)));
    expect(success(await fixture.store.read({ reference })).content).toContain("_Id:_");
    expect(success(await fixture.store.read({ reference: counter })).content).toBe("{}");
  });
});
