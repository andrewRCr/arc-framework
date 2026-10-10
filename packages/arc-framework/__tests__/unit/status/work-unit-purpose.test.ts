import { describe, expect, it } from "vitest";

import { join } from "node:path";

import {
  extractWorkUnitPurpose,
  readWorkUnitPurpose,
  selectWorkUnitDesign,
  type WorkUnitArtifactReaders,
} from "../../../src/lib/status/work-unit-purpose.js";
import type { ProjectReadinessRecordSource } from "../../../src/lib/status/project-view.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

describe("extractWorkUnitPurpose", () => {
  it.each([
    ["- **Purpose:** Route concerns to their home. Keep decisions visible.", "Route concerns to their home."],
    ["**Purpose:** Who owns this? Find out.", "Who owns this?"],
    ["- **Purpose:** Make it work! Then simplify.", "Make it work!"],
    ["- **Purpose:** Route each concern\n  to its home.\n\n## Goals\nOther prose.", "Route each concern to its home."],
    ["- **Purpose:** Place concerns by\n  **decision coupling**, never shared domain. Keep it bounded.", "Place concerns by **decision coupling**, never shared domain."],
    ["- **Purpose:** Place work by the\n  **decision it shapes:** shared domain is insufficient. Keep routing bounded.", "Place work by the **decision it shapes:** shared domain is insufficient."],
    ["- **Purpose:** Keep Markdown\n  --- separators literal. Keep output stable.", "Keep Markdown --- separators literal."],
    ["**Purpose:** Keep Markdown\n--- separators literal. Keep output stable.", "Keep Markdown --- separators literal."],
    ["- **Purpose:** Preserve `\n**Origin:** literal text\n` safely. Keep output stable.", "Preserve ` **Origin:** literal text ` safely."],
    ["- **Purpose:** Thesis without punctuation\n**Origin:** Internal.", "Thesis without punctuation"],
    ["- **Purpose:** Handle unmatched ` safely. Keep parser behavior stable.", "Handle unmatched ` safely."],
    ["- **Purpose:** Handle escaped \\` safely. Keep parser behavior stable.", "Handle escaped \\` safely."],
    ["- **Purpose:** Read `file.md` safely. Keep it local.", "Read `file.md` safely."],
    ["- **Purpose:** Read ``a`b.md`` safely. Keep it local.", "Read ``a`b.md`` safely."],
    ["- **Purpose:** Read file.md through the source", "Read file.md through the source"],
    ["- **Purpose:** One sentence without punctuation", "One sentence without punctuation"],
    ["```md\n- **Purpose:** Example purpose.\n```", null],
    ["<!--\n- **Purpose:** Comment purpose.\n-->", null],
    ["```md\n- **Purpose:** Example purpose.\n```\n\n- **Purpose:** Actual purpose.", "Actual purpose."],
    ["## Purpose\nA heading is not a field.", null],
    ["- **Purpose:**\n\n## Goals\nOther prose.", null],
    ["**Purpose:** —", null],
    ["# Brief\nNo purpose field.", null],
  ])("reads the field in %s", (content, expected) => {
    expect(extractWorkUnitPurpose(content)).toBe(expected);
  });
});

describe("selectWorkUnitDesign", () => {
  it.each([
    "../outside.md", "../../../outside.md", "/outside.md", "nested/design.md",
    "..\\outside.md", "nested\\design.md", "C:\\outside.md", "C:outside.md",
    "\\\\server\\share\\design.md", ".", "..",
  ])("ignores a non-sibling Design entry %s", async (name) => {
    const meta = makeMetaFixture("demo", { design: [name] });
    expect(await selectWorkUnitDesign(meta, () => Promise.resolve("**Purpose:** Outside thesis."))).toBeNull();
  });

  it("continues to a valid Design entry after an invalid readable entry", async () => {
    const meta = makeMetaFixture("demo", { design: ["../outside.md", "spec-demo.md"] });
    const selected = await selectWorkUnitDesign(meta, (name) => Promise.resolve(
      name === "spec-demo.md" ? "**Purpose:** Valid thesis." : "**Purpose:** Outside thesis.",
    ));
    expect(selected).toEqual({ name: "spec-demo.md", content: "**Purpose:** Valid thesis.", purpose: "Valid thesis." });
  });
});

describe("readWorkUnitPurpose", () => {
  const metaPath = join("/checkout", "active", "meta-demo.md");
  const source: ProjectReadinessRecordSource = { kind: "active-meta", location: "active", path: metaPath };

  function readersFor(files: Record<string, string>, refFiles: Record<string, { mode: string; content: string }> = {}): WorkUnitArtifactReaders {
    return {
      fs: {
        readFile: async (path) => {
          const content = files[path];
          if (content === undefined) throw new Error("unreadable");
          return content;
        },
      },
      readAtRef: async (ref, path) => {
        const entry = refFiles[`${ref}:${path}`];
        return entry === undefined ? null : { mode: entry.mode, bytes: new TextEncoder().encode(entry.content) };
      },
    };
  }

  it.each(["draft", "spec-outline", "spec-detailed"])("reads a %s artifact beside its meta", async (prefix) => {
    const artifact = `${prefix}-demo.md`;
    const readers = readersFor({
      [metaPath]: makeMetaFixture("demo", { design: [artifact] }),
      [join("/checkout", "active", artifact)]: "- **Purpose:** Its own thesis. More context.",
    });
    expect(await readWorkUnitPurpose(source, readers)).toBe("Its own thesis.");
  });

  it.each([
    ["**Purpose:** First thesis.", "**Purpose:** Second thesis.", "First thesis."],
    ["# Brief", "**Purpose:** Second thesis.", "Second thesis."],
    ["```md\n- **Purpose:** Example purpose.\n```", "**Purpose:** Second thesis.", "Second thesis."],
    ["**Purpose:**", "**Purpose:** Second thesis.", null],
    ["**Purpose:** —", "**Purpose:** Second thesis.", null],
    ["# Brief", "# Another brief", null],
  ])("selects the first listed artifact with a field", async (first, second, expected) => {
    const readers = readersFor({
      [metaPath]: makeMetaFixture("demo", { design: ["prd-demo.md", "rfc-demo.md"] }),
      [join("/checkout", "active", "prd-demo.md")]: first,
      [join("/checkout", "active", "rfc-demo.md")]: second,
    });
    expect(await readWorkUnitPurpose(source, readers)).toBe(expected);
  });

  it.each([{ design: [] }, { design: ["missing.md"] }])("returns null for absent designs $design", async ({ design }) => {
    expect(await readWorkUnitPurpose(source, readersFor({ [metaPath]: makeMetaFixture("demo", { design }) }))).toBeNull();
  });

  it.each([false, true])("keeps checkout and ref Purpose reads beside metadata (fallback: %s)", async (fallback) => {
    const design = ["../outside.md", ...(fallback ? ["spec-demo.md"] : [])];
    const meta = makeMetaFixture("demo", { design });
    const readers = readersFor({
      [metaPath]: meta,
      [join("/checkout", "outside.md")]: "**Purpose:** Outside thesis.",
      [join("/checkout", "active", "spec-demo.md")]: "**Purpose:** Valid thesis.",
    }, {
      "refs/heads/feat/demo:active/meta-demo.md": { mode: "100644", content: meta },
      "refs/heads/feat/demo:outside.md": { mode: "100644", content: "**Purpose:** Outside thesis." },
      "refs/heads/feat/demo:active/spec-demo.md": { mode: "100644", content: "**Purpose:** Valid thesis." },
    });
    const expected = fallback ? "Valid thesis." : null;
    expect(await readWorkUnitPurpose(source, readers)).toBe(expected);
    expect(await readWorkUnitPurpose({
      kind: "in-flight-meta", location: "active", path: "refs/heads/feat/demo:active/meta-demo.md",
    }, readers)).toBe(expected);
  });

  it("returns null for a record without its own meta", async () => {
    expect(await readWorkUnitPurpose({ kind: "completed-index", location: "completed" }, readersFor({}))).toBeNull();
  });

  it("reads an archived meta's own artifact", async () => {
    const archivedPath = join("/checkout", "completed", "meta-demo.md");
    const readers = readersFor({
      [archivedPath]: makeMetaFixture("demo", { state: "Shipped", design: ["spec-demo.md"] }),
      [join("/checkout", "completed", "spec-demo.md")]: "**Purpose:** Archived thesis.",
    });
    expect(await readWorkUnitPurpose({ kind: "completed-index", location: "completed", path: archivedPath }, readers)).toBe("Archived thesis.");
  });

  it.each([
    ["100644", "Selected ref thesis."],
    ["100755", "Selected ref thesis."],
    ["120000", null],
    ["160000", null],
  ])("reads only regular entries from the selected ref (%s)", async (mode, expected) => {
    const refMeta = "active/meta-demo.md";
    const readers = readersFor({
      [metaPath]: makeMetaFixture("demo", { design: ["stale.md"] }),
      [join("/checkout", "active", "spec-demo.md")]: "**Purpose:** Stale checkout thesis.",
    }, {
      [`refs/heads/feat/demo:${refMeta}`]: { mode: "100644", content: makeMetaFixture("demo", { design: ["spec-demo.md"] }) },
      "refs/heads/feat/demo:active/spec-demo.md": { mode, content: "**Purpose:** Selected ref thesis." },
    });
    expect(await readWorkUnitPurpose({ kind: "in-flight-meta", location: "active", path: `refs/heads/feat/demo:${refMeta}` }, readers)).toBe(expected);
  });
});
