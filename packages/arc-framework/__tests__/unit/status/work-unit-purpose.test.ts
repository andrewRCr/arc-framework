import { describe, expect, it } from "vitest";

import { join } from "node:path";

import {
  extractWorkUnitPurpose,
  readWorkUnitPurpose,
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
    ["- **Purpose:** Read `file.md` safely. Keep it local.", "Read `file.md` safely."],
    ["- **Purpose:** Read ``a`b.md`` safely. Keep it local.", "Read ``a`b.md`` safely."],
    ["- **Purpose:** Read file.md through the source", "Read file.md through the source"],
    ["- **Purpose:** One sentence without punctuation", "One sentence without punctuation"],
    ["## Purpose\nA heading is not a field.", null],
    ["- **Purpose:**\n\n## Goals\nOther prose.", null],
    ["**Purpose:** —", null],
    ["# Brief\nNo purpose field.", null],
  ])("reads the field in %s", (content, expected) => {
    expect(extractWorkUnitPurpose(content)).toBe(expected);
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
