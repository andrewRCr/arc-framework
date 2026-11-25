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
    { shape: "a meaningful opening blockquote", body: "> Pending observation must survive.\n\n" },
    { shape: "a meaningful opening blockquote before an entry", body: `> Pending observation must survive.\n\n${dated}` },
    { shape: "boilerplate mixed with a quoted concern", body: "> _Routed-in concerns pending integration by this work unit’s owner._\n> Pending observation must survive.\n\n" },
    { shape: "an unrecognized heading", body: `#### Pending\n\n${pending}` },
    { shape: "prose before a dated entry", body: pending + dated },
    { shape: "prose after a separator", body: `${dated}---\n\n${pending}` },
    { shape: "a blockquote after a separator", body: `${dated}---\n\n> Pending observation must survive.\n\n` },
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

  it.each([
    { shape: "blank framing and comment examples", intro: "" },
    { shape: "known introduction 1", intro: "> Routed-in concern pending holistic integration into the body at this WU's next planning iteration (`drain-inbox \u00a7 5`).\n\n" },
    { shape: "known introduction 2", intro: "> Routed-in concerns pending holistic integration into the body at this WU's next planning iteration (`drain-inbox \u00a7 5`); each carries its origin. Integrate — or consciously reject — at iteration.\n\n" },
    { shape: "known introduction 4", intro: "> Routed-in concerns pending holistic integration into the body at this work unit's next planning iteration; each carries its origin. Integrate — or consciously reject — at iteration.\n\n" },
    { shape: "known introduction 5", intro: "> Routed-in concerns pending integration at this work unit's first planning iteration. Integrate — or consciously reject — each one.\n\n" },
    { shape: "known introduction 6", intro: "> Routed-in concerns pending integration at this work unit's next planning iteration.\n\n" },
    { shape: "known introduction 7", intro: "> Routed-in concerns pending integration at this work unit's next planning iteration. Integrate — or consciously reject — each one.\n\n" },
    { shape: "a one-line intro blockquote", intro: "> _Routed-in concerns pending integration by this work unit’s owner._\n\n" },
    { shape: "a wrapped intro blockquote", intro: "> _Routed-in concerns pending holistic integration into the body\n> at this WU's next planning iteration._\n\n" },
  ])("accepts $shape around complete routed entries", async ({ intro }) => {
    const h = await importFixture(layout), path = join(h.root, ".arc/active/draft-alpha.md");
    const framing = "<!-- Buffer guidance\n---\nNot a real separator or pending prose.\n-->\n\n";
    await writeFile(path, `# Draft: Alpha\n\n${heading}${framing}${intro}${dated}<!-- Closing guidance. -->\n\n## Decisions\n\nKeep this section.\n`);
    await h.git("git", ["add", ".arc/active/draft-alpha.md"]);
    await h.git("git", ["commit", "-m", "Seed complete buffer with comment examples"]);
    await h.git("git", ["update-ref", "refs/heads/feat/alpha", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
    expect(await h.migrate()).toMatchObject({ status: "ok" });
    const store = createRefStore(h.ports), owner = { type: "work-item", name: "alpha" };
    const inbound = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/inbound", owner }) }));
    expect(inbound.content).toContain("Routed prose.");
    expect(inbound.content).not.toContain("Routed-in concerns");
    const draft = success(await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/draft", owner }) }));
    expect(draft.content).not.toContain(heading.trim());
    expect(draft.content).toContain("Keep this section.");
  }, 60_000);
});
