import { describe, expect, it } from "vitest";

import {
  parseMetaRecord,
  renderMetaFile,
} from "../../../../src/lib/active/meta-reader.js";
import { rewriteRenamedMeta } from "../../../../src/lib/work-unit/mutators/rewrite-renamed-meta.js";

describe("rewriteRenamedMeta", () => {
  it("rewrites the title, branch, and slug-bearing pointers only", () => {
    const content = renderMetaFile("sample", {
      state: "Active",
      owner: "andrew",
      branch: "feat/sample",
      workClass: "Heavy",
      priority: "P2",
      design: ["draft-sample.md", "shared-design.md"],
      taskList: "tasks-sample.md",
      origin: "internal",
    });

    const rewritten = rewriteRenamedMeta(content, "sample", "renamed-sample");
    const record = parseMetaRecord(rewritten);

    expect(rewritten).toMatch(/^# Metadata: renamed-sample$/mu);
    expect(record.branch).toBe("feat/renamed-sample");
    expect(record.design).toEqual(["draft-renamed-sample.md", "shared-design.md"]);
    expect(record.taskList).toBe("tasks-renamed-sample.md");
    expect(record.state).toBe("Active");
    expect(record.owner).toBe("andrew");
    expect(record.origin).toBe("internal");
  });

  it("leaves sentinel pointers and a branchless stub unchanged", () => {
    const content = renderMetaFile("sample", {
      state: "Planning",
      owner: "andrew",
      branch: null,
      design: [],
      taskList: null,
    });

    const record = parseMetaRecord(rewriteRenamedMeta(content, "sample", "renamed-sample"));

    expect(record.branch).toBeNull();
    expect(record.design).toEqual([]);
    expect(record.taskList).toBeNull();
  });
});
