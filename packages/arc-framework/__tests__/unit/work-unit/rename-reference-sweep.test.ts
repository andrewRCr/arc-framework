import { describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../../src/lib/active/meta-reader.js";
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
  it("rewrites bounded code spans, dependency edges, and the cohort member section", async () => {
    const meta = renderMetaFile("sibling", {
      state: "Planning",
      owner: "andrew",
      dependsOn: ["sample", "sample-extra"],
      cohort: "sample",
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
    expect(rewrittenMeta.dependsOn).toEqual(["renamed-sample", "sample-extra"]);
    expect(rewrittenMeta.cohort).toBe("sample");
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
    const content = renderMetaFile("sibling", {
      state: "Planning",
      owner: "andrew",
      dependsOn: [],
    });
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
});
