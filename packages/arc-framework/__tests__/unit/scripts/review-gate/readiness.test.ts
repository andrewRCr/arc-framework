import { describe, expect, it } from "vitest";

import { renderMetaFile } from "../../../../src/lib/active/meta-reader.js";
import { composeProjectReadinessView } from "../../../../src/lib/status/project-view.js";
import type {
  DeliveryMemberLookup,
  DeliveryMemberLookupResult,
} from "../../../../src/scripts/review-gate/core/delivery-member-lookup.js";
import {
  evaluateReviewReadiness,
  ReviewTargetSchema,
  type ReviewReadinessFs,
  ReviewVehicleSchema,
} from "../../../../src/scripts/review-gate/readiness.js";

const SHA = "a".repeat(40);
const ROOT = "/tree";
const PLAN_ID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const DELIVERABLE_ID = `sha256:${"b".repeat(64)}`;

function fileInfo(kind: "file" | "directory" | "symlink") {
  return {
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
  };
}

interface FakeFsOptions {
  kinds?: Record<string, "file" | "directory" | "symlink">;
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
    stat: async (path) => {
      const kind = options.kinds?.[path];
      if (kind === "symlink") {
        if (path in files) return fileInfo("file");
        if (directories.has(path)) return fileInfo("directory");
      }
      if (kind !== undefined) return fileInfo(kind);
      if (path in files) return fileInfo("file");
      if (directories.has(path)) return fileInfo("directory");
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

function memberVehicle(
  overrides: Partial<{ planId: string; deliverableId: string; workUnitSlug: string }> = {},
) {
  return {
    kind: "delivery-member" as const,
    planId: PLAN_ID,
    deliverableId: DELIVERABLE_ID,
    workUnitSlug: "demo",
    ...overrides,
  };
}

function resolvedMember(
  overrides: Partial<{
    planId: string;
    deliverableId: string;
    workUnitId: string;
    isFinalMember: boolean;
  }> = {},
): DeliveryMemberLookupResult {
  return {
    status: "resolved",
    member: {
      planId: PLAN_ID,
      deliverableId: DELIVERABLE_ID,
      workUnitId: "demo",
      base: "d".repeat(40),
      baseRef: "main",
      headRef: "delivery/demo/member-1",
      head: SHA,
      candidateHead: SHA,
      isFinalMember: false,
      ...overrides,
    },
  };
}

function memberLookup(
  result: DeliveryMemberLookupResult,
  heads: string[] = [],
): DeliveryMemberLookup {
  return {
    resolveMemberByHead: async (headObjectId) => {
      heads.push(headObjectId);
      return result;
    },
    resolveMemberByRef: async () => result,
    resolveMemberByVehicle: async () => result,
  };
}

function readinessRequest(
  vehicle:
    | { kind: "work-unit"; slug: string; archiveCadence: "with-integration" | "manual" }
    | { kind: "errand"; slug: string }
    | { kind: "delivery-member"; planId: string; deliverableId: string; workUnitSlug: string },
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

describe("review repository schema", () => {
  it("rejects all-dot segments without rejecting a leading dot in a named segment", () => {
    const target = {
      repository: "owner/repo",
      pullRequest: 42,
      headSha: SHA,
    };

    expect(ReviewTargetSchema.safeParse({ ...target, repository: "../.." }).success).toBe(false);
    expect(ReviewTargetSchema.safeParse({ ...target, repository: ".owner/repo" }).success).toBe(true);
  });
});

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

  it("accepts a symbolic-link lifecycle directory when its target is a directory", async () => {
    const completed = `${ROOT}/.arc/completed`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs(
          { [`${completed}/2026-q3/07_demo/meta-demo.md`]: shippedMeta() },
          { kinds: { [completed]: "symlink" } },
        ),
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
      "non-regular",
      buildFs({}, { kinds: { [`${ROOT}/.arc/active/meta-demo.md`]: "directory" } }),
      "non-regular-artifact",
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

  it("accepts a symbolic-link artifact when its target is a regular file", async () => {
    const path = `${ROOT}/.arc/active/meta-demo.md`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [path]: manualMeta() }, { kinds: { [path]: "symlink" } }) },
    );

    expect(result.state).toBe("ready");
  });

  it("uses the latest completed archive when an older copy remains", async () => {
    const older = shippedMeta().replace(
      "https://github.com/owner/repo/pull/42",
      "https://github.com/owner/repo/pull/41",
    );
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q2/03_demo/meta-demo.md`]: older,
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
        }),
      },
    );

    expect(result.state).toBe("ready");
  });

  it.each([
    ["missing", buildFs({}, { missingRoot: true }), "missing-root"],
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

  it("accepts a symbolic-link root when its target is a directory", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs: buildFs({}, { kinds: { [ROOT]: "symlink" } }) },
    );

    expect(result.state).toBe("ready");
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

  it("rejects malformed lifecycle candidates used by readiness rendering", async () => {
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
        ),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code: "malformed-artifact",
        path: ".arc/active/meta-unrelated.md",
      }],
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

  it("rejects an unreadable completed record candidate", async () => {
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
        }, { unreadable: [`${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`] }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{
        code: "unreadable-artifact",
        path: ".arc/completed/2026-q2/03_unrelated/meta-unrelated.md",
      }],
    });
  });

  it("accepts a symbolic-link lifecycle candidate when its target is a regular file", async () => {
    const path = `${ROOT}/.arc/completed/2026-q2/03_unrelated/meta-unrelated.md`;
    const result = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({
          [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta(),
          [path]: shippedMeta(),
        }, { kinds: { [path]: "symlink" } }),
      },
    );

    expect(result.state).toBe("ready");
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

describe("evaluateReviewReadiness with a delivery-member vehicle", () => {
  it("parses a well-formed member vehicle", () => {
    expect(ReviewVehicleSchema.parse(memberVehicle())).toEqual(memberVehicle());
  });

  it.each([
    ["plan id", memberVehicle({ planId: "not-a-uuid" })],
    ["deliverable id", memberVehicle({ deliverableId: `sha256:${"b".repeat(63)}` })],
    ["deliverable digest algorithm", memberVehicle({ deliverableId: `sha1:${"b".repeat(64)}` })],
    ["work-unit slug", memberVehicle({ workUnitSlug: "Demo_Unit" })],
  ])("rejects a malformed %s", (_field, vehicle) => {
    expect(ReviewVehicleSchema.safeParse(vehicle).success).toBe(false);
  });

  it.each([
    ["base", { ...memberVehicle(), base: "main" }],
    ["archive cadence", { ...memberVehicle(), archiveCadence: "manual" }],
  ])("rejects a member vehicle carrying a %s", (_field, vehicle) => {
    expect(ReviewVehicleSchema.safeParse(vehicle).success).toBe(false);
  });

  it("echoes the member vehicle unchanged in both the ready and the invalid payload", async () => {
    const readyResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember()) },
    );
    const invalidResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03", state: "closed" }),
      { fs: buildFs({}) },
    );

    expect(readyResult).toMatchObject({ state: "ready", payload: { vehicle: memberVehicle() } });
    expect(invalidResult).toMatchObject({ state: "invalid", payload: { vehicle: memberVehicle() } });
  });

  it.each([
    ["a delivery projection", "delivery/plan/03"],
    ["a bare ref with no type prefix", "member-03"],
    ["a feature branch naming another slug", "feat/unrelated"],
  ])("never produces the branch-mismatch fact for a member on %s", async (_case, headBranch) => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember()) },
    );

    expect(result.state).toBe("ready");
  });

  it("keeps the branch-mismatch and Errand-branch facts for the slug-bearing kinds", async () => {
    const workUnitResult = await evaluateReviewReadiness(
      readinessRequest(
        { kind: "work-unit", slug: "demo", archiveCadence: "manual" },
        { headBranch: "delivery/plan/03" },
      ),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) },
    );
    const errandResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}) },
    );

    expect(workUnitResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "vehicle-branch-mismatch", path: "pullRequest.headBranch" }] },
    });
    expect(errandResult).toMatchObject({
      state: "invalid",
      payload: {
        facts: [
          { code: "vehicle-branch-mismatch" },
          { code: "errand-branch-mismatch" },
        ],
      },
    });
  });

  it.each([
    [
      "pull-request-mismatch",
      { number: 41 } as const,
    ],
    [
      "pull-request-closed",
      { state: "closed" } as const,
    ],
    [
      "stale-head",
      { headSha: "c".repeat(40) } as const,
    ],
  ])("applies the %s fact to a member as to the other kinds", async (code, pullRequest) => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03", ...pullRequest }),
      { fs: buildFs({}) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [expect.objectContaining({ code })] },
    });
  });

  it("reaches its own arm rather than either work-unit cadence arm", async () => {
    const memberResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember()) },
    );
    const manualResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({}) },
    );
    const archivedResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      { fs: buildFs({}) },
    );

    expect(memberResult.state).toBe("ready");
    expect(manualResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ path: ".arc/active/meta-demo.md" }] },
    });
    expect(archivedResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ path: ".arc/completed" }] },
    });
  });
});

describe("delivery-member authentication against delivery state", () => {
  it("refuses a member as unavailable when no lookup port is bound", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "delivery-state-unavailable" }] },
    });
  });

  it("leaves work-unit and Errand evaluation unchanged when no lookup port is bound", async () => {
    const workUnitResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }) },
    );
    const errandResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs: buildFs({}) },
    );

    expect(workUnitResult.state).toBe("ready");
    expect(errandResult.state).toBe("ready");
  });

  it.each([
    ["unavailable", { status: "unavailable" } as const, "delivery-state-unavailable"],
    ["unbound", { status: "unbound" } as const, "delivery-member-unbound"],
  ])("refuses an %s lookup answer with its own fact", async (_case, answer, code) => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(answer) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code, path: "pullRequest.headSha" }] },
    });
  });

  it.each([
    ["plan", { planId: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e" }, "vehicle.planId"],
    ["deliverable", { deliverableId: `sha256:${"c".repeat(64)}` }, "vehicle.deliverableId"],
    ["work unit", { workUnitId: "other-unit" }, "vehicle.workUnitSlug"],
  ])("refuses a disagreeing %s with one mismatch fact naming its path", async (_field, drift, path) => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember(drift)) },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "delivery-member-mismatch", path }] },
    });
  });

  it("emits one mismatch fact per disagreeing field", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      {
        fs: buildFs({}),
        deliveryMemberLookup: memberLookup(resolvedMember({
          planId: "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
          deliverableId: `sha256:${"c".repeat(64)}`,
          workUnitId: "other-unit",
        })),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      payload: {
        facts: [
          { code: "delivery-member-mismatch", path: "vehicle.planId" },
          { code: "delivery-member-mismatch", path: "vehicle.deliverableId" },
          { code: "delivery-member-mismatch", path: "vehicle.workUnitSlug" },
        ],
      },
    });
  });

  it("admits a fully agreeing resolution, authenticating the live pull-request head", async () => {
    const heads: string[] = [];
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember(), heads) },
    );

    expect(result.state).toBe("ready");
    expect(heads).toEqual([SHA]);
  });

  it("admits an assertion whose plan id differs from the resolution's only in case", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest(
        memberVehicle({ planId: PLAN_ID.toUpperCase() }),
        { headBranch: "delivery/plan/03" },
      ),
      { fs: buildFs({}), deliveryMemberLookup: memberLookup(resolvedMember()) },
    );

    expect(result.state).toBe("ready");
  });

  it("refuses the plan's final member and admits a non-final one", async () => {
    const finalResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      {
        fs: buildFs({}),
        deliveryMemberLookup: memberLookup(resolvedMember({ isFinalMember: true })),
      },
    );
    const nonFinalResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      {
        fs: buildFs({}),
        deliveryMemberLookup: memberLookup(resolvedMember({ isFinalMember: false })),
      },
    );

    expect(finalResult).toMatchObject({
      state: "invalid",
      payload: { facts: [{ code: "delivery-member-terminal", path: "vehicle.deliverableId" }] },
    });
    expect(nonFinalResult.state).toBe("ready");
  });
});

describe("delivery-member evaluation without work-unit lifecycle readiness", () => {
  it("admits a member over a tree carrying no lifecycle artifacts", async () => {
    const reads: string[] = [];
    const bare = buildFs({});
    const watched: ReviewReadinessFs = {
      stat: async (path) => {
        reads.push(path);
        return bare.stat(path);
      },
      readFile: async (path) => {
        reads.push(path);
        return bare.readFile(path);
      },
      readdir: async (path) => {
        reads.push(path);
        return bare.readdir(path);
      },
    };

    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs: watched, deliveryMemberLookup: memberLookup(resolvedMember()) },
    );

    expect(result.state).toBe("ready");
    expect(reads.filter((path) => path !== ROOT)).toEqual([]);
  });

  it.each([
    ["missing", { missingRoot: true }, "missing-root"],
    ["non-directory", { kinds: { [ROOT]: "file" as const } }, "non-directory-root"],
  ])("refuses a %s supplied root with the same fact the other kinds produce", async (_case, options, code) => {
    const fs = buildFs({}, options);
    const memberResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs, deliveryMemberLookup: memberLookup(resolvedMember()) },
    );
    const errandResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs },
    );

    expect(memberResult).toMatchObject({ state: "invalid", diagnostics: [{ code, path: ROOT }] });
    expect(errandResult).toMatchObject({ state: "invalid", diagnostics: [{ code, path: ROOT }] });
  });

  it("admits a symbolic-link root consistently for member and local vehicles", async () => {
    const fs = buildFs({}, { kinds: { [ROOT]: "symlink" } });
    const memberResult = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      { fs, deliveryMemberLookup: memberLookup(resolvedMember()) },
    );
    const errandResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs },
    );

    expect(memberResult.state).toBe("ready");
    expect(errandResult.state).toBe("ready");
  });

  it("reports an unusable root ahead of the delivery fault", async () => {
    const result = await evaluateReviewReadiness(
      readinessRequest(memberVehicle(), { headBranch: "delivery/plan/03" }),
      {
        fs: buildFs({}, { missingRoot: true }),
        deliveryMemberLookup: memberLookup({ status: "unbound" }),
      },
    );

    expect(result).toMatchObject({
      state: "invalid",
      diagnostics: [{ code: "missing-root" }],
    });
  });

  it("leaves both work-unit cadence arms and the Errand arm unchanged", async () => {
    const lookup = memberLookup({ status: "unavailable" });
    const manualResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "manual" }),
      { fs: buildFs({ [`${ROOT}/.arc/active/meta-demo.md`]: manualMeta() }), deliveryMemberLookup: lookup },
    );
    const archivedResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "work-unit", slug: "demo", archiveCadence: "with-integration" }),
      {
        fs: buildFs({ [`${ROOT}/.arc/completed/2026-q3/07_demo/meta-demo.md`]: shippedMeta() }),
        deliveryMemberLookup: lookup,
      },
    );
    const errandResult = await evaluateReviewReadiness(
      readinessRequest({ kind: "errand", slug: "demo" }, { headBranch: "fix/demo" }),
      { fs: buildFs({}), deliveryMemberLookup: lookup },
    );

    expect(manualResult.state).toBe("ready");
    expect(archivedResult.state).toBe("ready");
    expect(errandResult.state).toBe("ready");
  });
});
