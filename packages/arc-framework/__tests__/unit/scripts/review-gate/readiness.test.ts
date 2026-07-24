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
}

function buildFs(files: Record<string, string>, options: FakeFsOptions = {}): ReviewReadinessFs {
  const directories = new Set<string>([ROOT]);
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
    State: "Integrating",
    Branch: "feat/demo",
    "Task List": "tasks-demo.md",
  })}
## Completion Notes

The exact candidate is composed and ready for integration.
`;
}

function shippedMeta(): string {
  return `${renderMetaFile("demo", {
    State: "Shipped",
    Branch: "[none]",
    "Task List": "tasks-demo.md",
    "PR URL": "https://github.com/owner/repo/pull/42",
    Completed: "2026-07-23",
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
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "manual",
      },
    }, { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) });

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
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "manual",
      },
    }, { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) });

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
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "manual",
      },
    }, { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: content }) });

    expect(result.state).toBe("ready");
  });

  it("accepts a unique completed archive with exact PR identity and a coherent readiness view", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "work-unit",
        slug: "demo",
        archiveCadence: "with-integration",
      },
    }, {
      fs: buildFs({
        [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
        [`${ROOT}/.arc/backlog/ROADMAP.md`]: roadmap,
      }),
    });

    expect(result.state).toBe("ready");
  });

  it("accepts an exact Errand identity without work-unit products", async () => {
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "fix/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "errand",
        slug: "demo",
      },
    }, { fs: buildFs({}) });

    expect(result.state).toBe("ready");
  });

  it("rejects a feature branch presented as an Errand even when its slug matches", async () => {
    const result = await evaluateReviewReadiness({
      schemaVersion: 1,
      treeRoot: ROOT,
      target: {
        repository: "owner/repo",
        pullRequest: 42,
        headSha: SHA,
      },
      pullRequest: {
        repository: "owner/repo",
        number: 42,
        state: "open",
        headBranch: "feat/demo",
        headSha: SHA,
      },
      vehicle: {
        kind: "errand",
        slug: "demo",
      },
    }, { fs: buildFs({}) });

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

  it("accepts a well-formed final cohort closeout and ignores unrelated malformed inputs", async () => {
    const roadmap = `${composeProjectReadinessView({
      title: "Roadmap: Project Status",
      renderedRef: "abc1234",
      records: [],
    })}\n`;
    const meta = shippedMeta().replace("- **Cohort:** [none]", "- **Cohort:** alpha");
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

    expect(result.state).toBe("ready");
  });

  it.each([
    ["wrong slug", { headBranch: "feat/other" }, "vehicle-branch-mismatch"],
    ["stale head", { headSha: "b".repeat(40) }, "stale-head"],
    ["closed PR", { state: "closed" as const }, "pull-request-closed"],
    ["wrong repository", { repository: "owner/other" }, "pull-request-mismatch"],
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
