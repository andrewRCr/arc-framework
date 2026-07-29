import { describe, expect, it, vi } from "vitest";

import {
  mergeProjectReadinessRecords,
  type ProjectReadinessAcceptedCandidate,
  type ProjectReadinessCompositionResult,
  type ProjectReadinessProvider,
  type ProjectReadinessRecordCandidate,
} from "../../../src/lib/status/project-view.js";
import {
  adaptProjectReadinessProvider,
  decomposeReadinessDeps,
  resolveLaunchReadiness,
  type DecomposeReadinessDeps,
} from "../../../src/lib/work-unit/decompose-launch-readiness.js";

function candidate(
  slug: string,
  fields: Partial<ProjectReadinessRecordCandidate> = {},
): ProjectReadinessAcceptedCandidate {
  const record = mergeProjectReadinessRecords([{
    slug,
    location: "planned",
    state: "Planning",
    priority: "P3",
    dependsOn: [],
    source: {
      kind: "backlog-stub",
      location: "planned",
      path: `.arc/backlog/planned/${slug}/meta-${slug}.md`,
    },
    ...fields,
  }])[0];
  if (record === undefined) throw new Error("candidate fixture requires one record");
  return {
    slug,
    path: record.source.path ?? "",
    lifecycleLocation: record.location,
    record,
  };
}

function composition(
  acceptedCandidates: ProjectReadinessAcceptedCandidate[],
  options: Pick<ProjectReadinessCompositionResult, "rejectedRecords" | "indeterminate"> = {
    rejectedRecords: [],
    indeterminate: false,
  },
): ProjectReadinessCompositionResult {
  const records = mergeProjectReadinessRecords(acceptedCandidates.map(({ record }) => record));
  return {
    acceptedCandidates,
    rejectedRecords: options.rejectedRecords,
    records,
    treeRecords: records,
    derivationWarnings: [],
    sourceWarnings: [],
    indeterminate: options.indeterminate,
    oracleResult: null,
    view: {
      title: "Readiness fixture",
      records,
      derivationWarnings: [],
      sourceWarnings: [],
      indeterminate: options.indeterminate,
    },
  };
}

const readyDeps: DecomposeReadinessDeps = {
  readinessProvider: {
    resolve: ({ candidates }) =>
      new Map(candidates.map(({ slug }) => [slug, { kind: "ready" as const }])),
  },
};

describe("resolveLaunchReadiness", () => {
  it("returns ready for one unparked planned record with shipped dependencies and a ready provider", () => {
    const target = candidate("member", { dependsOn: ["foundation"] });
    const shipped = candidate("foundation", {
      location: "completed",
      state: "Shipped",
      source: {
        kind: "completed-index",
        location: "completed",
        path: ".arc/completed/foundation/meta-foundation.md",
      },
    });
    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target, shipped]),
      deps: readyDeps,
    })).toEqual({ kind: "ready" });
  });

  it("preserves a missing adapted provider key as a typed refusal", () => {
    const provider: ProjectReadinessProvider = {
      resolve: () => new Map(),
    };

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([candidate("member")]),
      deps: { readinessProvider: adaptProjectReadinessProvider(provider) },
    })).toEqual({
      kind: "refused",
      blockers: [{
        code: "provider-missing-key",
        locus: "readiness-provider:member",
      }],
    });
  });

  it.each([
    ["missing", undefined, "dependency-missing"],
    ["active", { location: "active", state: "Active" }, "dependency-active"],
    ["integrating", { location: "active", state: "Integrating" }, "dependency-integrating"],
    ["parked", { location: "planned", state: "Active" }, "dependency-parked"],
  ] as const)("keeps a %s dependency distinguishable", (_label, dependencyFields, code) => {
    const target = candidate("member", { dependsOn: ["dependency"] });
    const dependency = dependencyFields === undefined
      ? []
      : [candidate("dependency", {
          ...dependencyFields,
          source: {
            kind: dependencyFields.location === "active" ? "active-meta" : "backlog-stub",
            location: dependencyFields.location,
            path: `.arc/${dependencyFields.location}/meta-dependency.md`,
          },
        })];

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target, ...dependency]),
      deps: readyDeps,
    })).toEqual({
      kind: "blocked",
      blockers: [{
        code,
        locus: `${target.path}:Depends On:dependency`,
      }],
    });
  });

  it("keeps a valid typed provider denial separate from dependency blockers", () => {
    const target = candidate("member");

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target]),
      deps: {
        readinessProvider: {
          resolve: () => new Map([[
            "member",
            {
              kind: "blocked",
              blockers: [{ code: "provider-blocked", locus: "provider:member" }],
            },
          ]]),
        },
      },
    })).toEqual({
      kind: "blocked",
      blockers: [{ code: "provider-blocked", locus: "provider:member" }],
    });
  });

  it("refuses matching rejected evidence without losing its source locus", () => {
    const target = candidate("member");

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target], {
        rejectedRecords: [{
          slugHint: "member",
          path: ".arc/backlog/planned/member/meta-member.md",
          locus: "meta",
          reason: "malformed",
        }],
        indeterminate: false,
      }),
      deps: readyDeps,
    })).toEqual({
      kind: "refused",
      blockers: [{
        code: "record-malformed",
        locus: ".arc/backlog/planned/member/meta-member.md:meta",
      }],
    });
  });

  it("treats an unidentified rejected record as a global indeterminate refusal", () => {
    const target = candidate("member");

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target], {
        rejectedRecords: [{
          slugHint: null,
          path: "[unknown-meta]",
          locus: "meta-malformed",
          reason: "malformed",
        }],
        indeterminate: true,
      }),
      deps: readyDeps,
    })).toEqual({
      kind: "refused",
      blockers: [
        {
          code: "composition-indeterminate",
          locus: "project-readiness-composition",
        },
        {
          code: "record-malformed",
          locus: "[unknown-meta]:meta-malformed",
        },
      ],
    });
  });

  it.each([
    [
      "missing",
      composition([]),
      [{ code: "record-missing", locus: "project-record:member" }],
    ],
    [
      "duplicate",
      composition([candidate("member"), candidate("member")]),
      [
        { code: "record-duplicate", locus: ".arc/backlog/planned/member/meta-member.md" },
        { code: "record-duplicate", locus: ".arc/backlog/planned/member/meta-member.md" },
      ],
    ],
    [
      "wrong lifecycle",
      composition([candidate("member", {
        location: "active",
        source: {
          kind: "active-meta",
          location: "active",
          path: ".arc/active/meta-member.md",
        },
      })]),
      [{ code: "record-wrong-lifecycle", locus: ".arc/active/meta-member.md" }],
    ],
    [
      "wrong state",
      composition([candidate("member", { state: "Active" })]),
      [{ code: "record-wrong-state", locus: ".arc/backlog/planned/member/meta-member.md:State" }],
    ],
    [
      "indeterminate",
      composition([candidate("member")], { rejectedRecords: [], indeterminate: true }),
      [{ code: "composition-indeterminate", locus: "project-readiness-composition" }],
    ],
  ] as const)("returns typed refused for a %s record composition", (_label, pinned, blockers) => {
    expect(resolveLaunchReadiness({
      slug: "member",
      composition: pinned,
      deps: readyDeps,
    })).toEqual({ kind: "refused", blockers });
  });

  it.each([
    [
      "missing key",
      new Map(),
      { code: "provider-missing-key", locus: "readiness-provider:member" },
    ],
    [
      "extra key",
      new Map([
        ["member", { kind: "ready" as const }],
        ["foreign", { kind: "ready" as const }],
      ]),
      { code: "provider-extra-key", locus: "readiness-provider:foreign" },
    ],
    [
      "malformed verdict",
      new Map([["member", { kind: "blocked" as const, blockers: [] }]]),
      { code: "provider-malformed", locus: "readiness-provider:member" },
    ],
    [
      "unknown verdict field",
      new Map([["member", { kind: "ready" as const, extra: true }]]),
      { code: "provider-malformed", locus: "readiness-provider:member" },
    ],
    [
      "non-map result",
      {},
      { code: "provider-malformed", locus: "readiness-provider:result" },
    ],
  ] as const)("refuses a provider %s", (_label, providerResult, blocker) => {
    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([candidate("member")]),
      deps: {
        readinessProvider: {
          resolve: () => providerResult as never,
        },
      },
    })).toEqual({ kind: "refused", blockers: [blocker] });
  });

  it("adapts the existing batch provider once and supplies a typed provider locus", () => {
    const resolve = vi.fn<ProjectReadinessProvider["resolve"]>(() =>
      new Map([["member", "blocked"]]));
    const target = candidate("member");

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target]),
      deps: {
        readinessProvider: adaptProjectReadinessProvider({ resolve }),
      },
    })).toEqual({
      kind: "blocked",
      blockers: [{
        code: "provider-blocked",
        locus: `${target.path}:provider`,
      }],
    });
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("keeps dependency-edge and adapted provider loci when the production provider blocks", () => {
    const target = candidate("member", { dependsOn: ["active-dependency"] });
    const dependency = candidate("active-dependency", {
      location: "active",
      state: "Active",
      source: {
        kind: "active-meta",
        location: "active",
        path: ".arc/active/meta-active-dependency.md",
      },
    });

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target, dependency]),
      deps: decomposeReadinessDeps,
    })).toEqual({
      kind: "blocked",
      blockers: [
        {
          code: "dependency-active",
          locus: `${target.path}:Depends On:active-dependency`,
        },
        {
          code: "provider-blocked",
          locus: `${target.path}:provider`,
        },
      ],
    });
  });

  it("refuses a missing or throwing provider instead of defaulting ready", () => {
    const pinned = composition([candidate("member")]);

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: pinned,
      deps: {} as DecomposeReadinessDeps,
    })).toEqual({
      kind: "refused",
      blockers: [{ code: "provider-missing", locus: "readiness-provider" }],
    });
    expect(resolveLaunchReadiness({
      slug: "member",
      composition: pinned,
      deps: {
        readinessProvider: {
          resolve: () => {
            throw new Error("provider unavailable");
          },
        },
      },
    })).toEqual({
      kind: "refused",
      blockers: [{ code: "provider-failed", locus: "readiness-provider" }],
    });
  });

  it("keeps a parked planned record blocked even when its provider is ready", () => {
    const target = candidate("member", { scheduling: "parked" });

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: composition([target]),
      deps: readyDeps,
    })).toEqual({
      kind: "blocked",
      blockers: [{
        code: "record-parked",
        locus: `${target.path}:scheduling`,
      }],
    });
  });

  it("returns equal readiness for equal pinned compositions and one shared dependency bundle", () => {
    const first = composition([candidate("member")]);
    const second = composition([candidate("member")]);

    expect(resolveLaunchReadiness({
      slug: "member",
      composition: first,
      deps: readyDeps,
    })).toEqual(resolveLaunchReadiness({
      slug: "member",
      composition: second,
      deps: readyDeps,
    }));
  });
});
