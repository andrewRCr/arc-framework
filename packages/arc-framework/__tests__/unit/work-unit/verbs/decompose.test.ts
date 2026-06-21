/**
 * Unit tests for the `decompose` executor's batch N-member cohort scaffold — the
 * first of `runDecompose`'s four legs.
 *
 * The leg generalizes the shipped single-member `arc stub --cohort` to a batch:
 * one call mints N member subdirs, each carrying a `meta-<member>.md` +
 * `draft-<member>.md` skeleton, with fields set from the cut-map and origin. It
 * is a direct writer over `primitives` (not N `executeTransition` calls), so the
 * fs seam is injected and every behavior is asserted over the captured writes.
 * The executor writes **skeletons only** — design-content distribution stays the
 * workflow's conservation gate, honoring the no-fabricate-content contract.
 */

import { describe, it, expect } from "vitest";

import {
  scaffoldCohortMembers,
  type ScaffoldCohortMembersContext,
  type ScaffoldCohortMembersParams,
} from "../../../../src/lib/work-unit/verbs/decompose.js";
import type { NewMemberEntry } from "../../../../src/lib/work-unit/decompose-cut-map.js";

const CWD = "/repo";

interface Harness {
  ctx: ScaffoldCohortMembersContext;
  writes: { path: string; content: string }[];
  mkdirs: string[];
}

/** A `scaffoldCohortMembers` context capturing every mkdir + write over an in-memory fs. */
function buildHarness(): Harness {
  const writes: Harness["writes"] = [];
  const mkdirs: string[] = [];
  const ctx: ScaffoldCohortMembersContext = {
    cwd: CWD,
    fs: {
      mkdir: async (path) => {
        mkdirs.push(String(path));
        return undefined;
      },
      writeFile: async (path, content) => {
        writes.push({ path: String(path), content });
      },
    },
  };
  return { ctx, writes, mkdirs };
}

/** A new-member cut entry with the per-test fields varied over a sane default. */
function member(slug: string, over: Partial<NewMemberEntry> = {}): NewMemberEntry {
  return {
    kind: "new-member",
    slug,
    workClass: "Light",
    dependsOn: [],
    receives: ["problem-statement"],
    ...over,
  };
}

const ORIGIN_CONTEXT: ScaffoldCohortMembersParams["originContext"] = {
  origin: "[internal]",
  owner: "andrew",
  priority: "P1",
};

/** Pull the captured write for a member's meta / draft by repo-relative tail. */
function writeFor(writes: Harness["writes"], tail: string): { path: string; content: string } {
  const hit = writes.find((w) => w.path.endsWith(tail));
  if (hit === undefined) throw new Error(`no write ending in "${tail}" (saw ${writes.map((w) => w.path).join(", ")})`);
  return hit;
}

describe("scaffoldCohortMembers — batch N-member scaffold", () => {
  it("scaffolds N (≥ 2) member dirs, each with a meta- and draft- skeleton", async () => {
    const { ctx, writes, mkdirs } = buildHarness();

    const result = await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta"), member("gamma")],
      internalEdges: [],
    });

    expect(result.map((m) => m.slug)).toEqual(["alpha", "beta", "gamma"]);
    // One dir + two files (meta, draft) per member.
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/neo/alpha");
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/neo/gamma");
    expect(writes).toHaveLength(6);
    expect(result[0]).toEqual({
      slug: "alpha",
      metaPath: ".arc/backlog/planned/neo/alpha/meta-alpha.md",
      draftPath: ".arc/backlog/planned/neo/alpha/draft-alpha.md",
    });
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("# Metadata: beta");
    expect(writeFor(writes, "/neo/beta/draft-beta.md").content).toContain("# Draft: beta");
  });

  it("inherits Origin, sets Design to the member's own draft, State Planning, and per-member Class", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: { origin: "https://example.test/issue/7", owner: "andrew", priority: "P1" },
      members: [member("alpha", { workClass: "Heavy" }), member("beta", { workClass: "Light" })],
      internalEdges: [],
    });

    const alpha = writeFor(writes, "/neo/alpha/meta-alpha.md").content;
    // Origin inherited from the origin WU (a real URL renders as an autolink).
    expect(alpha).toContain("<https://example.test/issue/7>");
    // Design points at the member's own draft.
    expect(alpha).toContain("`draft-alpha.md`");
    expect(alpha).toContain("Planning");
    expect(alpha).toContain("`Heavy`");
    // Class is per-member from the cut — not inherited across members.
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("`Light`");
    // Owner + Priority inherited from the origin.
    expect(alpha).toContain("andrew");
    expect(alpha).toContain("P1");
  });

  it("dual-places the cohort path in the member meta and the draft header", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta")],
      internalEdges: [],
    });

    expect(writeFor(writes, "/neo/alpha/meta-alpha.md").content).toContain("**Cohort:** `neo`");
    expect(writeFor(writes, "/neo/alpha/draft-alpha.md").content).toContain("**Cohort:** `neo`");
  });

  it("distributes Depends On by actual need — outgoing + internal edges, never blanket-inherited", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [
        member("alpha", { dependsOn: ["external-x"] }),
        member("beta"),
        member("gamma"),
      ],
      // beta depends on alpha (delivery order); gamma carries no edge.
      internalEdges: [{ from: "beta", to: "alpha" }],
    });

    // alpha keeps only its genuine outgoing edge.
    const alpha = writeFor(writes, "/neo/alpha/meta-alpha.md").content;
    expect(alpha).toContain("**Depends On:** `external-x`");
    // beta gains the internal edge to alpha.
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("**Depends On:** `alpha`");
    // gamma depends on nothing — no blanket inheritance from the origin or siblings.
    expect(writeFor(writes, "/neo/gamma/meta-gamma.md").content).toContain("**Depends On:** [none]");
  });

  it("merges a member's outgoing and internal edges without duplication", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta", { dependsOn: ["alpha", "external-x"] })],
      internalEdges: [{ from: "beta", to: "alpha" }],
    });

    const beta = writeFor(writes, "/neo/beta/meta-beta.md").content;
    // alpha appears once though it arrives from both the outgoing and the internal edge.
    expect(beta).toContain("**Depends On:** `alpha`, `external-x`");
  });
});

describe("scaffoldCohortMembers — the three parent-position placement arms", () => {
  const cases: { arm: string; cohort: string; dir: string }[] = [
    { arm: "standalone → top-level cohort", cohort: "neo", dir: ".arc/backlog/planned/neo/alpha" },
    { arm: "in-cohort → sub-cohort", cohort: "lifecycle/neo", dir: ".arc/backlog/planned/lifecycle/neo/alpha" },
    { arm: "at-cap → lateral fan-out (origin's existing cohort)", cohort: "agile/parallelism", dir: ".arc/backlog/planned/agile/parallelism/alpha" },
  ];

  for (const { arm, cohort, dir } of cases) {
    it(`places members correctly: ${arm}`, async () => {
      const { ctx, writes, mkdirs } = buildHarness();

      const result = await scaffoldCohortMembers(ctx, {
        cohort,
        originContext: ORIGIN_CONTEXT,
        members: [member("alpha"), member("beta")],
        internalEdges: [],
      });

      expect(mkdirs).toContain(`/repo/${dir}`);
      expect(result[0]!.metaPath).toBe(`${dir}/meta-alpha.md`);
      expect(writeFor(writes, `${dir}/draft-alpha.md`)).toBeDefined();
      // The dual-placed Cohort field carries the full path, whatever the arm.
      expect(writeFor(writes, `${dir}/meta-alpha.md`).content).toContain(`**Cohort:** \`${cohort}\``);
    });
  }
});
