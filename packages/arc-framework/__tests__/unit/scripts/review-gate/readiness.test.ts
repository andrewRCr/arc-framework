import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../../src/lib/active/meta-reader.js";
import { composeProjectReadinessView } from "../../../../src/lib/status/project-view.js";
import {
  evaluateReviewReadiness,
  type ReviewReadinessFs,
} from "../../../../src/scripts/review-gate/readiness.js";

const SHA = "a".repeat(40);
const ROOT = "/tree";

function fileInfo(kind: "file" | "directory" | "symlink") {
  return {
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => kind === "symlink",
  };
}

interface FakeFsOptions {
  kinds?: Record<string, "file" | "directory" | "symlink">;
  realpaths?: Record<string, string>;
  unreadable?: readonly string[];
  unreadableDirectories?: readonly string[];
  missingRoot?: boolean;
}

function buildFs(files: Record<string, string>, options: FakeFsOptions = {}): ReviewReadinessFs {
  const directories = new Set<string>(options.missingRoot === true ? [] : [ROOT]);
  for (const path of [...Object.keys(files), ...Object.keys(options.kinds ?? {})]) {
    const segments = path.split("/");
    while (segments.length > 2) {
      segments.pop();
      directories.add(segments.join("/") || "/");
    }
  }
  return {
    lstat: async (path) => {
      const kind = options.kinds?.[path];
      if (kind !== undefined) return fileInfo(kind);
      if (path in files) return fileInfo("file");
      if (directories.has(path)) return fileInfo("directory");
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },
    realpath: async (path) => {
      const canonical = options.realpaths?.[path];
      if (canonical !== undefined) return canonical;
      if (path in files || path in (options.kinds ?? {}) || directories.has(path)) return path;
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
    },
    readFile: async (path) => {
      if (options.unreadable?.includes(path) === true) {
        throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
      }
      const content = files[path];
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      return content;
    },
    readdir: async (path) => {
      if (options.unreadableDirectories?.includes(path) === true) {
        throw Object.assign(new Error(`EACCES: ${path}`), { code: "EACCES" });
      }
      if (!directories.has(path)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      const prefix = path === "/" ? "/" : `${path}/`;
      const names = new Set<string>();
      for (const candidate of [...Object.keys(files), ...Object.keys(options.kinds ?? {}), ...directories]) {
        if (!candidate.startsWith(prefix)) continue;
        const name = candidate.slice(prefix.length).split("/")[0];
        if (name !== undefined && name !== "") names.add(name);
      }
      return [...names].map((name) => {
        const child = `${prefix}${name}`.replace("//", "/");
        return {
          name,
          isDirectory: () => directories.has(child),
        };
      });
    },
  };
}

function manualMeta(): string {
  return `${renderMetaFile("demo", {
    state: "Integrating",
    owner: "andrew",
    branch: "feat/demo",
    taskList: "tasks-demo.md",
  })}
## Completion Notes

The exact candidate is composed and ready for integration.
`;
}

function shippedMeta(): string {
  return `${renderMetaFile("demo", {
    state: "Shipped",
    owner: "andrew",
    branch: null,
    taskList: "tasks-demo.md",
    prUrl: "https://github.com/owner/repo/pull/42",
    completed: "2026-07-23",
  })}
## Completion Notes

The exact candidate shipped with its archive products.
`;
}

function readinessRequest(
  vehicle:
    | { kind: "work-unit"; slug: string; archiveCadence: "with-integration" | "manual" }
    | { kind: "errand"; slug: string },
  pullRequest: Partial<{
    repository: string;
    number: number;
    state: "open" | "closed";
    headBranch: string;
    headSha: string;
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    treeRoot: ROOT,
    target: {
      repository: "owner/repo",
      pullRequest: 42,
      headSha: SHA,
    },
    pullRequest: {
      repository: "owner/repo",
      number: 42,
      state: "open" as const,
      headBranch: "feat/demo",
      headSha: SHA,
      ...pullRequest,
    },
    vehicle,
  };
}

describe("evaluateReviewReadiness", () => {
  it("accepts a manual-cadence work unit without inventing Release Notes applicability", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) },
    );

    expect(result).toMatchObject({
      mode: "review-readiness",
      state: "ready",
      nextAction: "none",
      diagnostics: [],
      payload: {
        vehicle: {
          kind: "work-unit",
          slug: "demo",
          archiveCadence: "manual",
        },
      },
    });
  });

  it("rejects a present Release Notes section that does not follow the archive format", async () => {
    const content = `${manualMeta()}
## Release Notes Entry

An uncategorized note is not a complete public release entry.
`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      nextAction: "stop",
      payload: {
        facts: [{
          code: "malformed-release-notes",
          path: ".arc/active/meta-demo.md",
        }],
      },
    });
  });

  it("rejects placeholder-only Completion Notes", async () => {
    const content = manualMeta().replace(
      "The exact candidate is composed and ready for integration.",
      "[none]",
    );
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "malformed-completion-notes" }] },
    });
  });

  it("rejects Completion Notes containing only multiple HTML comments", async () => {
    const content = manualMeta().replace(
      "The exact candidate is composed and ready for integration.",
      "<!-- first -->\n\n<!-- second -->",
    );
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "malformed-completion-notes" }] },
    });
  });

  it("accepts ordered Release Notes categories with wrapped entries and an optional breaking callout", async () => {
    const content = `${manualMeta()}
## Release Notes Entry

The release exposes one new integration control.

### Added

- A guarded readiness command whose description wraps
  without creating a second list item.

### Security

- Exact-head identity checks.

### Breaking Changes

Projects enabling the context must install the pinned workflow.
`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) },
    );

    expect(result.state).toBe("ready");
  });

  it("accepts a unique completed archive with exact PR identity", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
        }),
      },
    );

    expect(result.state).toBe("ready");
  });

  it("accepts an exact Errand identity without work-unit products", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs: buildFs({}) },
    );

    expect(result.state).toBe("ready");
  });

  it("rejects a feature branch presented as an Errand even when its slug matches", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }),
      { fs: buildFs({}) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: {
        facts: [{
          code: "errand-branch-mismatch",
          path: "pullRequest.headBranch",
        }],
      },
    });
  });

  it.each([
    ["missing", buildFs({}), "missing-artifact"],
    [
      "symlinked",
      buildFs(
        { [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() },
        { kinds: { [`${ROOT}/.arc/active/meta-demo.md`]: "symlink" } },
      ),
      "symlinked-artifact",
    ],
    [
      "non-regular",
      buildFs({}, { kinds: { [`${ROOT}/.arc/active/meta-demo.md`]: "directory" } }),
      "non-regular-artifact",
    ],
    [
      "escaping",
      buildFs(
        { [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() },
        { realpaths: { [`${ROOT}/.arc/active/meta-demo.md`]: "/outside/meta-demo.md" } },
      ),
      "escaping-artifact",
    ],
    [
      "unreadable",
      buildFs(
        { [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() },
        { unreadable: [`${ROOT}/.arc/active/meta-demo.md`] },
      ),
      "unreadable-artifact",
    ],
  ])("rejects a %s required artifact with its exact fact", async (_case, fs, code) => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: {
        facts: [{
          code,
          path: ".arc/active/meta-demo.md",
        }],
      },
    });
  });

  it("rejects a duplicate completed archive before trusting either candidate", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q2/03_demo/meta-demo.md`]: shippedMeta(),
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
        }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: {
        facts: [{
          code: "duplicate-artifact",
          path: ".arc/completed/**/meta-demo.md",
        }],
      },
    });
  });

  it.each([
    ["missing", buildFs({}, { missingRoot: true }), "missing-root"],
    ["symlinked", buildFs({}, { kinds: { [ROOT]: "symlink" } }), "symlinked-root"],
    ["non-directory", buildFs({}, { kinds: { [ROOT]: "file" } }), "non-directory-root"],
  ])("rejects a %s supplied root explicitly", async (_case, fs, code) => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{ code, path: ROOT }],
    });
  });

  it("propagates an unreadable archive-quarter enumeration", async () => {
    const quarter = `${ROOT}/.arc/completed/2026-q3`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs(
          { [`${quarter}/07_demo/meta-demo.md`]: shippedMeta() },
          { unreadableDirectories: [quarter] },
        ),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code: "unreadable-artifact",
        path: ".arc/completed/2026-q3",
      }],
    });
  });

  it("rejects malformed metadata and the wrong lifecycle cadence distinctly", async () => {
    const malformed = manualMeta().replace(
      /^\| `Integrating`.*$/mu,
      "| `Integrating` |",
    );
    const malformedResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: malformed }) },
    );
    const cadenceResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta().replace("`Integrating`", "`Active`"),
        }),
      },
    );

    expect(malformedResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "malformed-artifact" }] },
    });
    expect(cadenceResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "wrong-cadence" }] },
    });
  });

  it("requires a final cohort member's closeout sidecar", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const meta = shippedMeta().replace("- **Cohort:** [none]", "- **Cohort:** alpha");
    expect(meta).not.toBe(shippedMeta());
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: meta,
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: {
        facts: [{
          code: "missing-cohort-closeout",
          path: ".arc/completed/2026-q3/07a_cohort-alpha/cohort-alpha.md",
        }],
      },
    });
  });

  it("requires planned coordination while another cohort member remains open", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const meta = shippedMeta().replace("- **Cohort:** [none]", "- **Cohort:** alpha");
    const openMember = renderMetaFile("other", {
      state: "Active",
      owner: "andrew",
      branch: "feat/other",
      cohort: "alpha",
    });
    expect(meta).not.toBe(shippedMeta());
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: meta,
          [`${ROOT}/.arc/active/meta-other.md`]: openMember,
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code: "missing-cohort-coordination",
        path: ".arc/backlog/planned/alpha/cohort-alpha.md",
      }],
    });
  });

  it("rejects malformed and symlinked lifecycle candidates used by readiness rendering", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const meta = shippedMeta().replace("- **Cohort:** [none]", "- **Cohort:** alpha");
    expect(meta).not.toBe(shippedMeta());
    const closeout = `# Cohort: alpha

---

## Closeout

- **Closed:** 2026-07-23
- **Final member:** \`demo\`
- **Member archives:** \`07_demo\`
- **Outcome:** The cohort shipped.
- **Follow-up:** [none]

---
`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs(
          {
            [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: meta,
            [`${ROOT}/.arc/completed/2026-q3/07a_cohort-alpha/cohort-alpha.md`]: closeout,
            [`${ROOT}/.arc/active/meta-unrelated.md`]: "# malformed unrelated meta\n",
            [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
          },
          {
            kinds: {
              [`${ROOT}/.arc/backlog/planned/unrelated/meta-unrelated.md`]: "symlink",
            },
          },
        ),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "malformed-artifact",
          path: ".arc/active/meta-unrelated.md",
        }),
        expect.objectContaining({
          code: "symlinked-artifact",
          path: ".arc/backlog/planned/unrelated/meta-unrelated.md",
        }),
      ]),
    });
  });

  it("rejects a malformed completed record that readiness rendering would otherwise omit", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
          [`${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`]: "# malformed archived meta\n",
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code: "malformed-artifact",
        path: ".arc/completed/2026-q2/03_unrelated/meta-unrelated.md",
      }],
    });
  });

  it.each([
    [
      "symlinked",
      { kinds: { [`${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`]: "symlink" as const } },
      "symlinked-artifact",
    ],
    [
      "unreadable",
      { unreadable: [`${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`] },
      "unreadable-artifact",
    ],
  ])("rejects a %s completed record candidate", async (_case, options, code) => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
          [`${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`]: shippedMeta(),
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }, options),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code,
        path: ".arc/completed/2026-q2/03_unrelated/meta-unrelated.md",
      }],
    });
  });

  it("ignores completed cohort closeout documents as non-meta archive sidecars", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
          [`${ROOT}/.arc/completed/2026-q2/03a_cohort-alpha/cohort-alpha.md`]: "# Cohort: alpha\n",
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }),
      },
    );

    expect(result.state).toBe("ready");
  });

  it("does not treat the local-ref project view as exact-head readiness authority", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\nUnexpected stale content.\n`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
          [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
        }),
      },
    );

    expect(result.state).toBe("ready");
  });

  it.each([
    ["wrong slug", { headBranch: "feat/other" }, "vehicle-branch-mismatch"],
    ["stale head", { headSha: "b".repeat(40) }, "stale-head"],
    ["closed PR", { state: "closed" as const }, "pull-request-closed"],
    ["wrong repository", { repository: "owner/other" }, "pull-request-mismatch"],
    ["wrong PR number", { number: 43 }, "pull-request-mismatch"],
  ])("rejects %s before reading lifecycle products", async (_case, pullRequest, code) => {
    const result = await evaluateReviewReadiness(
      readinessRequest(
        { kind: "work-unit", slug: "demo", archiveCadence: "manual" },
        pullRequest,
      ),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: expect.arrayContaining([expect.objectContaining({ code })]) },
    });
  });

  it("rejects cadence-specific PR and branch identity mismatches", async () => {
    const manualResult = await evaluateReviewReadiness(
      readinessRequest(
        { kind: "work-unit", slug: "demo", archiveCadence: "manual" },
        { headBranch: "fix/demo" },
      ),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) },
    );
    const archived = shippedMeta().replace(
      "https://github.com/owner/repo/pull/42",
      "https://github.com/owner/repo/pull/41",
    );
    const archiveResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: archived,
        }),
      },
    );

    expect(manualResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "branch-mismatch" }] },
    });
    expect(archiveResult).toMatchObject({
      state: "invalid",
      payload: { facts: expect.arrayContaining([expect.objectContaining({ code: "pr-url-mismatch" })]) },
    });
  });
});
