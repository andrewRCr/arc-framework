import { describe, expect, it } from "vitest";

import {
  parseMetaRecord,
  renderMetaFile,
} from "../../../../src/lib/active/meta-reader.js";
import { rewriteRenamedMeta } from "../../../../src/lib/work-unit/mutators/rewrite-renamed-meta.js";

describe("rewriteRenamedMeta", () => {
  it("rewrites the title, branch, and slug-bearing pointers only", () => {
    const content = renderMetaFile("sample", {
      State: "Active",
      Owner: "andrew",
      Branch: "feat/sample",
      Class: "Heavy",
      Priority: "P2",
      Design: "draft-sample.md, shared-design.md",
      "Task List": "tasks-sample.md",
      Origin: "internal",
    });

    const rewritten = rewriteRenamedMeta(content, "sample", "renamed-sample");
    const record = parseMetaRecord(rewritten);

    expect(rewritten).toMatch(/^# Metadata: renamed-sample$/mu);
    expect(record.Branch).toBe("feat/renamed-sample");
    expect(record.Design).toBe("draft-renamed-sample.md, shared-design.md");
    expect(record["Task List"]).toBe("tasks-renamed-sample.md");
    expect(record.State).toBe("Active");
    expect(record.Owner).toBe("andrew");
    expect(record.Origin).toBe("internal");
  });

  it("leaves sentinel pointers and a branchless stub unchanged", () => {
    const content = renderMetaFile("sample", {
      Branch: "[none]",
      Design: "[none]",
      "Task List": "[none]",
    });

    const record = parseMetaRecord(rewriteRenamedMeta(content, "sample", "renamed-sample"));

    expect(record.Branch).toBe("[none]");
    expect(record.Design).toBe("[none]");
    expect(record["Task List"]).toBe("[none]");
  });
});
