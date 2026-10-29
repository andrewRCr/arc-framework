/** Import refuses unaccounted pending prose before removing its source section. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

const heading = "## Inbound Buffer — Pending Integration\n\n";
const dated = "### **Routed**\n\n- _Routed from:_ drain (2026-01-02).\n\nRouted prose.\n\n";
const pending = "Pending observation must survive.\n\n";
const repaired = `### **Recovered**\n\n- _Routed from:_ drain (2026-01-03).\n\n${pending}`;

describe.each(["default", "separate"] as const)("buffer span import in %s", layout => {
  it.each([
    { shape: "prose only", body: pending },
    { shape: "an unrecognized heading", body: `#### Pending\n\n${pending}` },
    { shape: "prose before a dated entry", body: pending + dated },
    { shape: "prose after a separator", body: `${dated}---\n\n${pending}` },
  ])("retains $shape and imports after an explicit source repair", async ({ body }) => {
    const h = await importFixture(layout), path = join(h.root, ".arc/active/draft-alpha.md");
    const content = `# Draft: Alpha\n\n${heading}${body}## Decisions\n\nKeep this section.\n`;
    const seed = async (value: string): Promise<void> => {
      await writeFile(path, value);
      await h.git("git", ["add", ".arc/active/draft-alpha.md"]);
      await h.git("git", ["commit", "-m", "Seed pending source prose"]);
      const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      await h.git("git", ["update-ref", "refs/heads/feat/alpha", head]);
    };
    await seed(content);
    const trial = await h.migrate(true);
    expect(trial).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
      expect.objectContaining({ condition: expect.stringMatching(/buffer.*alpha.*unaccounted/iu),
        remedy: { text: expect.stringMatching(/repair.*retry/iu) } }),
    ]) } });
    expect(await h.migrate()).toMatchObject({ status: "refused", refusal: { code: "import-refused" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    expect(await readFile(path, "utf8")).toBe(content);
    await seed(content.replace(body, `${dated}${repaired}`));
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports), owner = { type: "work-item", name: "alpha" };
    const inbound = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/inbound", owner }) }));
    expect(inbound.content).toContain(pending.trim());
    expect(inbound.content).toContain("Routed prose.");
    const draft = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/draft", owner }) }));
    expect(draft.content).not.toContain(heading.trim());
    expect(draft.content).toContain("Keep this section.");
  }, 60_000);

  it("accepts blank framing and comment examples around complete routed entries", async () => {
    const h = await importFixture(layout), path = join(h.root, ".arc/active/draft-alpha.md");
    const framing = "<!-- Buffer guidance\n---\nNot a real separator or pending prose.\n-->\n\n";
    await writeFile(path, `# Draft: Alpha\n\n${heading}${framing}${dated}<!-- Closing guidance. -->\n\n## Decisions\n\nKeep this section.\n`);
    await h.git("git", ["add", ".arc/active/draft-alpha.md"]);
    await h.git("git", ["commit", "-m", "Seed complete buffer with comment examples"]);
    await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports), owner = { type: "work-item", name: "alpha" };
    const inbound = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/inbound", owner }) }));
    expect(inbound.content).toContain("Routed prose.");
    const draft = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/draft", owner }) }));
    expect(draft.content).not.toContain(heading.trim());
    expect(draft.content).toContain("Keep this section.");
  }, 60_000);
});
