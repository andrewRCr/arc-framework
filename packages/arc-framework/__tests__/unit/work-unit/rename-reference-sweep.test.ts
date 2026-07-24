import { describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { WorkUnitArtifactKindSchema } from "../../../src/lib/layout/index.js";
import { artifactMatcher } from "../../../src/lib/work-unit/mutators/relocate-artifacts.js";
import {
  rewriteCohortMemberHeading,
  sweepRenameReferences,
} from "../../../src/lib/work-unit/rename-reference-sweep.js";

describe("rewriteCohortMemberHeading", () => {
  it("rewrites only the exact member heading inside Members", () => {
    const content = [
      "# Cohort: group",
      "",
      "## Members",
      "",
      "### `sample`",
      "",
      "### `sibling`",
      "",
      "## Coordination",
      "",
      "### `sample`",
      "",
    ].join("\n");

    const rewritten = rewriteCohortMemberHeading(content, "sample", "renamed-sample");

    expect(rewritten).toContain("## Members\n\n### `renamed-sample`");
    expect(rewritten).toContain("### `sibling`");
    expect(rewritten).toContain("## Coordination\n\n### `sample`");
  });

  it("is byte-identical when the member section is absent", () => {
    const content = "## Members\n\n### `sibling`\n";
    expect(rewriteCohortMemberHeading(content, "sample", "renamed-sample")).toBe(content);
  });
});

describe("sweepRenameReferences", () => {
  it.each([
    ["meta", "# Metadata: sample", "# Metadata: renamed-sample"],
    ["draft", "# Draft: sample", "# Draft: renamed-sample"],
    ["spec", "# Spec (`brief`): sample", "# Spec (`brief`): renamed-sample"],
    ["spec", "# Spec (`outline`): sample", "# Spec (`outline`): renamed-sample"],
    ["spec", "# Spec (`detailed` · `PRD`): sample", "# Spec (`detailed` · `PRD`): renamed-sample"],
    ["spec", "# Spec (`detailed` · `RFC`): sample", "# Spec (`detailed` · `RFC`): renamed-sample"],
    ["tasks", "# Task List: sample", "# Task List: renamed-sample"],
    ["tasks", "# Tasks: sample", "# Tasks: renamed-sample"],
    ["notes", "# Notes: sample", "# Notes: renamed-sample"],
    ["research", "# Research: sample", "# Research: renamed-sample"],
    ["analysis", "# Analysis: sample", "# Analysis: renamed-sample"],
  ])("rewrites the registered %s basename-bound identity H1", async (prefix, title, expectedTitle) => {
    const path = `.arc/active/${prefix}-sample.md`;
    const files = new Map([[path, `${title}\n\nBody.\n`]]);

    await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    }, {
      listFiles: async () => [`active/${prefix}-sample.md`],
      readFile: async (candidate) => files.get(candidate) ?? "",
      writeFile: async (candidate, content) => { files.set(candidate, content); },
    });

    expect(files.get(path)).toBe(`${expectedTitle}\n\nBody.\n`);
  });

  it("rewrites the exact basename-bound plan resume anchor with the self title", async () => {
    const path = ".arc/backlog/planned/sample/draft-sample.md";
    const files = new Map([[
      path,
      "# Draft: sample\n\n> Resume with `--plan sample`; plain --plan sample stays prose.\n",
    ]]);

    await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    }, {
      listFiles: async () => ["backlog/planned/sample/draft-sample.md"],
      readFile: async (candidate) => files.get(candidate) ?? "",
      writeFile: async (candidate, content) => { files.set(candidate, content); },
    });

    expect(files.get(path)).toBe(
      "# Draft: renamed-sample\n\n> Resume with `--plan renamed-sample`; plain --plan sample stays prose.\n",
    );
  });

  it.each([
    ["later identity H1", "draft-sample.md", "# Other\n\n# Draft: sample\n"],
    ["mismatched basename", "draft-other.md", "# Draft: sample\n"],
    ["unknown companion", "decision-sample.md", "# Decision: sample\n"],
    ["unsupported title", "draft-sample.md", "# Draft: Sample\n"],
  ])("leaves %s content byte-identical", async (_label, basename, content) => {
    const path = `.arc/active/${basename}`;
    const files = new Map([[path, content]]);
    let wrote = false;

    await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    }, {
      listFiles: async () => [`active/${basename}`],
      readFile: async (candidate) => files.get(candidate) ?? "",
      writeFile: async () => { wrote = true; },
    });

    expect(wrote).toBe(false);
    expect(files.get(path)).toBe(content);
  });

  it("keeps the layout enum and broad companion relocation matcher independent from self-title rules", () => {
    expect(WorkUnitArtifactKindSchema.options).toEqual(["meta", "draft", "spec", "tasks", "notes"]);
    expect(artifactMatcher("sample").test("research-sample.md")).toBe(true);
    expect(artifactMatcher("sample").test("decision-sample.md")).toBe(true);
  });

  it("is idempotent after the self-title and plan anchor have been rewritten", async () => {
    const path = ".arc/active/draft-sample.md";
    const files = new Map([[path, "# Draft: sample\n\n`--plan sample`\n"]]);
    let writes = 0;
    const ctx = {
      listFiles: async () => ["active/draft-sample.md"],
      readFile: async (candidate: string) => files.get(candidate) ?? "",
      writeFile: async (candidate: string, content: string) => {
        writes += 1;
        files.set(candidate, content);
      },
    };
    const params = {
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    };

    await sweepRenameReferences(params, ctx);
    await sweepRenameReferences(params, ctx);

    expect(writes).toBe(1);
    expect(files.get(path)).toBe("# Draft: renamed-sample\n\n`--plan renamed-sample`\n");
  });

  it("rewrites bounded code spans, dependency edges, and the cohort member section", async () => {
    const meta = renderMetaFile("sibling", {
      "Depends On": "sample, sample-extra",
      Cohort: "sample",
    });
    const files = new Map<string, string>([
      ["/repo/.arc/active/meta-sibling.md", meta],
      ["/repo/.arc/backlog/planned/group/spec-sibling.md", "See `notes-sample.md`; sample prose; `cohort-sample.md`.\n"],
      ["/repo/.arc/backlog/planned/group/cohort-group.md", "## Members\n\n### `sample`\n"],
      ["/repo/.arc/completed/meta-history.md", "`meta-sample.md`\n"],
    ]);
    const written = new Map<string, string>();

    const result = await sweepRenameReferences({
      arcRoot: "/repo/.arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      cohortDocRelativePath: "backlog/planned/group/cohort-group.md",
    }, {
      listFiles: async () => [
        "active/meta-sibling.md",
        "backlog/planned/group/spec-sibling.md",
        "backlog/planned/group/cohort-group.md",
        "completed/meta-history.md",
      ],
      readFile: async (path) => files.get(path) ?? "",
      writeFile: async (path, content) => { written.set(path, content); },
    });

    const rewrittenMeta = parseMetaRecord(written.get("/repo/.arc/active/meta-sibling.md") ?? "");
    expect(rewrittenMeta["Depends On"]).toBe("renamed-sample, sample-extra");
    expect(rewrittenMeta.Cohort).toBe("sample");
    expect(written.get("/repo/.arc/backlog/planned/group/spec-sibling.md"))
      .toBe("See `notes-renamed-sample.md`; sample prose; `cohort-sample.md`.\n");
    expect(written.get("/repo/.arc/backlog/planned/group/cohort-group.md"))
      .toBe("## Members\n\n### `renamed-sample`\n");
    expect(written.has("/repo/.arc/completed/meta-history.md")).toBe(false);
    expect(result.changedPaths).toEqual([
      "/repo/.arc/active/meta-sibling.md",
      "/repo/.arc/backlog/planned/group/cohort-group.md",
      "/repo/.arc/backlog/planned/group/spec-sibling.md",
    ]);
  });

  it("leaves sentinel dependency fields unchanged", async () => {
    const content = renderMetaFile("sibling", { "Depends On": "[none]" });
    let wrote = false;
    await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    }, {
      listFiles: async () => ["active/meta-sibling.md"],
      readFile: async () => content,
      writeFile: async () => { wrote = true; },
    });
    expect(wrote).toBe(false);
  });

  it("withholds an integrating dependent's exact meta from the rename sweep", async () => {
    const content = renderMetaFile("integrating", { "Depends On": "sample" });
    let wrote = false;

    const result = await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      excludedPaths: [".arc/active/meta-integrating.md"],
    }, {
      listFiles: async () => ["active/meta-integrating.md"],
      readFile: async () => content,
      writeFile: async () => { wrote = true; },
    });

    expect(result.changedPaths).toEqual([]);
    expect(wrote).toBe(false);
  });

  it("rewrites a shared-visible dependent while leaving an excluded divergent peer byte-identical", async () => {
    const content = renderMetaFile("dependent", { "Depends On": "sample" });
    const files = new Map([
      [".arc/active/meta-shared.md", content],
      [".arc/active/meta-divergent.md", content],
    ]);

    const result = await sweepRenameReferences({
      arcRoot: ".arc",
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      excludedPaths: [".arc/active/meta-divergent.md"],
    }, {
      listFiles: async () => ["active/meta-divergent.md", "active/meta-shared.md"],
      readFile: async (path) => files.get(path) ?? "",
      writeFile: async (path, updated) => {
        files.set(path, updated);
      },
    });

    expect(result.changedPaths).toEqual([".arc/active/meta-shared.md"]);
    expect(files.get(".arc/active/meta-shared.md")).toContain("- **Depends On:** `renamed-sample`");
    expect(files.get(".arc/active/meta-divergent.md")).toBe(content);
  });
});
