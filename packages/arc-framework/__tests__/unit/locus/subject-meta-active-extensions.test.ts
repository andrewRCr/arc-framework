/** Active-extension input seam for checkout-directed subject projection. */

import { posix } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { LoadSetProjectionInput } from "../../../src/lib/load-set/projection.js";
import {
  projectCheckoutSubjectMeta,
  type SubjectMetaIO,
} from "../../../src/lib/locus/subject-meta.js";

const resolverInputs = vi.hoisted(() => [] as LoadSetProjectionInput[]);

vi.mock("../../../src/lib/load-set/projection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/load-set/projection.js")>();
  return {
    ...actual,
    resolveLoadSetManifest(input: LoadSetProjectionInput) {
      resolverInputs.push(input);
      return actual.resolveLoadSetManifest(input);
    },
  };
});

function subjectIO(files: ReadonlyMap<string, string>): SubjectMetaIO {
  return {
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return content;
    },
    pathExists: async (path) => files.has(path),
    realpath: async (path) => posix.normalize(path),
    lstat: async () => ({ isSymbolicLink: () => false }),
  };
}

function fixture() {
  const cwd = "/repo-wt";
  const metaPath = `${cwd}/.arc/active/meta-demo.md`;
  const taskListPath = `${cwd}/.arc/active/tasks-demo.md`;
  const cohortDocPath = `${cwd}/.arc/backlog/planned/release/core/cohort-core.md`;
  const files = new Map([
    [metaPath, `# Metadata: demo

- **State:** \`Active\`
- **Owner:** \`andrew\`
- **Branch:** \`feat/demo\`
- **Cohort:** \`release/core\`
- **Task List:** \`tasks-demo.md\`
- **Current Workflow:** [none]
- **Next Action:** Continue
`],
    [taskListPath, "## **Phase 1:** Demo\n\n### `[ ]` **1.1 Do it**\n"],
    [cohortDocPath, "# Cohort\n"],
  ]);
  return {
    options: {
      cwd,
      subjectKey: "demo",
      identity: "andrew",
      metaRoot: { kind: "maintainer" as const },
      candidates: [{
        kind: "read" as const,
        name: "meta-demo.md",
        path: metaPath,
        text: files.get(metaPath) ?? "",
      }],
      io: subjectIO(files),
    },
  };
}

describe("checkout subject active-extension seam", () => {
  it("passes supplied active extensions unchanged to one load-set projection", async () => {
    resolverInputs.length = 0;
    const { options } = fixture();
    const activeExtensions = ["release-notes", "security-review"] as const;

    const result = await projectCheckoutSubjectMeta({ ...options, activeExtensions });

    expect(resolverInputs).toHaveLength(1);
    expect(resolverInputs[0]?.activeExtensions).toBe(activeExtensions);
    expect(result).toMatchObject({
      kind: "resolved",
      sessionType: "execution",
      workflow: "process-task-loop",
      stage: null,
      taskCursor: { status: "found", cursor: { section: { id: "1.1" }, leaf: { id: "1.1" } } },
      cohortDocPath: ".arc/backlog/planned/release/core/cohort-core.md",
    });
    expect(result.kind === "resolved" ? result.loadSet.entries : []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining("extensions/") }),
    ]));
  });

  it("makes omission output-identical to an explicit empty extension list", async () => {
    const { options } = fixture();

    const omitted = await projectCheckoutSubjectMeta(options);
    const explicit = await projectCheckoutSubjectMeta({ ...options, activeExtensions: [] });

    expect(omitted).toEqual(explicit);
  });
});
