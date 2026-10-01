import { describe, it, expect } from "vitest";

import {
  buildLifecycleIndex,
  buildLifecycleIndexFromMetas,
  buildLifecycleIndexFromRecords,
  type DirEntry,
  type LifecycleIndexFs,
} from "../../../src/lib/work-unit/lifecycle-index.js";

/**
 * Build an in-memory {@link LifecycleIndexFs} from an absolute-path → content
 * map. `readdir` synthesizes immediate children (with file-type info) from the
 * path set and throws ENOENT for a directory with no descendants (mirroring a
 * missing dir); `readFile` returns content, throws ENOENT for an absent path,
 * and throws for any path listed in `unreadable` (a present-but-unreadable
 * meta). Every `readdir` call is recorded in `reads` for scan-count assertions.
 */
function buildMemFs(
  files: Record<string, string>,
  unreadable: string[] = [],
): LifecycleIndexFs & { reads: string[] } {
  const reads: string[] = [];
  const allPaths = [...Object.keys(files), ...unreadable];
  const unreadableSet = new Set(unreadable);

  const enoent = (p: string): Error => {
    const err = new Error(`ENOENT: ${p}`) as Error & { code?: string };
    err.code = "ENOENT";
    return err;
  };

  return {
    reads,
    readFile: async (p) => {
      if (unreadableSet.has(p)) throw new Error(`EIO: ${p}`);
      if (p in files) return files[p]!;
      throw enoent(p);
    },
    readdir: async (dir) => {
      reads.push(dir);
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const children = new Map<string, boolean>();
      for (const p of allPaths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) children.set(rest, false);
        else children.set(rest.slice(0, slash), true);
      }
      if (children.size === 0) throw enoent(dir);
      const entries: DirEntry[] = [...children].map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      }));
      return entries;
    },
  };
}

/** Minimal valid meta — H1 plus the flat-bullet `State` and optional `Cohort` / `Depends On`. */
function meta(state: string, cohort?: string, dependsOn?: string[]): string {
  const lines = ["# Metadata: x", "", `- **State:** ${state}`];
  if (cohort !== undefined) lines.push(`- **Cohort:** ${cohort}`);
  if (dependsOn !== undefined) {
    const value = dependsOn.length === 0 ? "[none]" : dependsOn.map((s) => `\`${s}\``).join(", ");
    lines.push(`- **Depends On:** ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

const cwd = "/repo";
const A = (p: string): string => `/repo/.arc/${p}`;

describe("buildLifecycleIndex — per-tier walk", () => {
  it("enumerates active/ flat (non-recursive) and resolves its location", async () => {
    const fs = buildMemFs({
      [A("active/meta-alpha.md")]: meta("Active"),
      // A meta buried in a subdirectory is NOT discovered — active/ is flat.
      [A("active/subdir/meta-buried.md")]: meta("Active"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("alpha")?.location).toBe("active");
    expect(index.has("buried")).toBe(false);
  });

  it("walks backlog/planned/ recursively into nested cohort dirs", async () => {
    const fs = buildMemFs({
      [A("backlog/planned/some-cohort/meta-beta.md")]: meta("Planning"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("beta")).toMatchObject({
      location: "planned",
      path: ".arc/backlog/planned/some-cohort/meta-beta.md",
    });
  });

  it("walks backlog/provisional/ for the provisional location", async () => {
    const fs = buildMemFs({ [A("backlog/provisional/meta-gamma.md")]: meta("Planning") });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("gamma")?.location).toBe("provisional");
  });

  it("resolves archived slugs under completed/ and ignores cohort-doc closeout dirs", async () => {
    const fs = buildMemFs({
      [A("completed/2026-q2/15_delta/meta-delta.md")]: meta("Shipped"),
      // A closeout dir holds a cohort-*.md, never a meta-*.md — naturally skipped.
      [A("completed/2026-q2/15a_cohort-some-cohort/cohort-some-cohort.md")]: "# Cohort\n",
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("delta")?.location).toBe("completed");
    expect(index.has("some-cohort")).toBe(false);
    expect(index.size).toBe(1);
  });
});

describe("buildLifecycleIndex — one source per slug", () => {
  it("keeps the active copy of a slug that the backlog and archive also hold", async () => {
    const fs = buildMemFs({
      [A("completed/2026-q2/01_resumed/meta-resumed.md")]: meta("Shipped"),
      [A("backlog/planned/meta-resumed.md")]: meta("Planning"),
      [A("active/meta-resumed.md")]: meta("Active"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("resumed")).toMatchObject({
      phase: "Active",
      location: "active",
      path: ".arc/active/meta-resumed.md",
    });
    expect(index.size).toBe(1);
  });

  it("keeps the lexically first path when one tier holds a slug twice", async () => {
    const fs = buildMemFs({
      [A("backlog/planned/alpha/meta-twin.md")]: meta("Planning", "alpha"),
      [A("backlog/planned/zeta/meta-twin.md")]: meta("Planning", "zeta"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("twin")).toMatchObject({ cohort: "alpha", path: ".arc/backlog/planned/alpha/meta-twin.md" });
  });

  it("orders same-tier copies by code unit, not by the host locale", async () => {
    // Locale collation puts `a/` before `B/`; code-unit order puts `B/` first on every host.
    const fs = buildMemFs({
      [A("backlog/planned/a/meta-twin.md")]: meta("Planning", "a"),
      [A("backlog/planned/B/meta-twin.md")]: meta("Planning", "B"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("twin")).toMatchObject({ cohort: "B", path: ".arc/backlog/planned/B/meta-twin.md" });
  });

  it("reads only regular files, so a named pipe called meta-*.md never blocks the walk", async () => {
    const reads: string[] = [];
    const fs: LifecycleIndexFs = {
      readdir: async (dir) => {
        if (dir !== A("active")) throw new Error(`ENOENT: ${dir}`);
        return [
          { name: "meta-pipe.md", isDirectory: () => false, isFile: () => false },
          { name: "meta-good.md", isDirectory: () => false, isFile: () => true },
        ];
      },
      readFile: async (path) => {
        reads.push(path);
        if (path === A("active/meta-pipe.md")) return new Promise<string>(() => {});
        return meta("Active");
      },
    };

    const index = await buildLifecycleIndex({ cwd, fs });

    expect([...index.keys()]).toEqual(["good"]);
    expect(reads).toEqual([A("active/meta-good.md")]);
  });
});

describe("buildLifecycleIndex — meta-field reads", () => {
  it("reads phase from State, cohort from the Cohort field, and slug from the filename", async () => {
    const fs = buildMemFs({
      [A("active/meta-alpha.md")]: meta("Integrating", "lifecycle-state-machine"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("alpha")).toEqual({
      slug: "alpha",
      phase: "Integrating",
      location: "active",
      cohort: "lifecycle-state-machine",
      dependsOn: [],
      path: ".arc/active/meta-alpha.md",
    });
  });

  it("parses the Depends On edges into the entry, empty when absent or [none]", async () => {
    const fs = buildMemFs({
      [A("active/meta-alpha.md")]: meta("Active", undefined, ["dep-a", "dep-b"]),
      [A("backlog/planned/meta-beta.md")]: meta("Planning", undefined, []),
      [A("backlog/planned/meta-gamma.md")]: meta("Planning"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("alpha")?.dependsOn).toEqual(["dep-a", "dep-b"]);
    expect(index.get("beta")?.dependsOn).toEqual([]);
    expect(index.get("gamma")?.dependsOn).toEqual([]);
  });

  it("records a null cohort when the field is absent or the [none] sentinel", async () => {
    const fs = buildMemFs({
      [A("active/meta-alpha.md")]: meta("Active"),
      [A("backlog/planned/meta-beta.md")]: meta("Planning", "[none]"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.get("alpha")?.cohort).toBeNull();
    expect(index.get("beta")?.cohort).toBeNull();
  });
});

describe("buildLifecycleIndex — build-once & resilience", () => {
  it("contributes nothing for a missing lifecycle directory, without throwing", async () => {
    // Only active/ is populated; the three other roots are absent.
    const fs = buildMemFs({ [A("active/meta-alpha.md")]: meta("Active") });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect([...index.keys()]).toEqual(["alpha"]);
  });

  it("skips an unreadable meta rather than aborting the scan", async () => {
    const fs = buildMemFs(
      { [A("active/meta-good.md")]: meta("Active") },
      [A("active/meta-bad.md")],
    );

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.has("good")).toBe(true);
    expect(index.has("bad")).toBe(false);
  });

  it("skips a malformed meta (unparseable core block) rather than aborting", async () => {
    const malformed = "# Metadata: bad\n\n| **State** | **Owner** |\n|-----------|-----------|\n";
    const fs = buildMemFs({
      [A("active/meta-good.md")]: meta("Active"),
      [A("active/meta-bad.md")]: malformed,
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.has("good")).toBe(true);
    expect(index.has("bad")).toBe(false);
  });

  it("skips a meta whose State is not a codified phase", async () => {
    const fs = buildMemFs({
      [A("active/meta-good.md")]: meta("Active"),
      [A("active/meta-legacy.md")]: meta("Paused (2026-04-12)"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    expect(index.has("good")).toBe(true);
    expect(index.has("legacy")).toBe(false);
  });

  it("scans each directory exactly once per invocation — one index, read by reference", async () => {
    const fs = buildMemFs({
      [A("active/meta-alpha.md")]: meta("Active"),
      [A("backlog/planned/some-cohort/meta-beta.md")]: meta("Planning"),
    });

    const index = await buildLifecycleIndex({ cwd, fs });

    // No directory is walked twice (no double-walk feeding separate projections).
    expect(new Set(fs.reads).size).toBe(fs.reads.length);
    // The built map is queried by reference — reads do not re-trigger a scan.
    const before = fs.reads.length;
    index.get("alpha");
    index.get("beta");
    expect(fs.reads.length).toBe(before);
  });

  it("returns a fresh map per invocation — no persisted cache", async () => {
    const fs = buildMemFs({ [A("active/meta-alpha.md")]: meta("Active") });

    const first = await buildLifecycleIndex({ cwd, fs });
    const second = await buildLifecycleIndex({ cwd, fs });

    expect(first).not.toBe(second);
    expect([...first.keys()]).toEqual([...second.keys()]);
  });
});

describe("buildLifecycleIndexFromMetas — files-in (sync, fs-free)", () => {
  it("indexes in-memory metas across tiers, resolving location from each path", () => {
    const index = buildLifecycleIndexFromMetas([
      { path: ".arc/active/meta-alpha.md", content: meta("Active", "c") },
      { path: ".arc/backlog/planned/c/meta-beta.md", content: meta("Planning", "c") },
      { path: ".arc/completed/2026-q2/01_gamma/meta-gamma.md", content: meta("Shipped", "c") },
    ]);

    expect(index.get("alpha")).toMatchObject({ location: "active", cohort: "c" });
    expect(index.get("beta")?.location).toBe("planned");
    expect(index.get("gamma")?.location).toBe("completed");
    expect(index.size).toBe(3);
  });

  it("skips a malformed or unresolvable meta rather than throwing", () => {
    const index = buildLifecycleIndexFromMetas([
      { path: ".arc/active/meta-good.md", content: meta("Active") },
      { path: ".arc/active/meta-bad.md", content: "# Metadata: bad\n\n| **State** |\n|---|\n" },
      { path: ".arc/active/meta-legacy.md", content: meta("Paused (2026-04-12)") },
    ]);

    expect([...index.keys()]).toEqual(["good"]);
  });

  it("keeps the active copy of a duplicated slug whatever order the metas arrive in", () => {
    const index = buildLifecycleIndexFromMetas([
      { path: ".arc/active/meta-resumed.md", content: meta("Active") },
      { path: ".arc/completed/2026-q2/01_resumed/meta-resumed.md", content: meta("Shipped") },
    ]);

    expect(index.get("resumed")).toMatchObject({ phase: "Active", location: "active" });
  });

  it("skips an active meta below a subdirectory of active/", () => {
    const index = buildLifecycleIndexFromMetas([
      { path: ".arc/active/meta-flat.md", content: meta("Active") },
      { path: ".arc/active/sub/meta-nested.md", content: meta("Active") },
    ]);

    expect([...index.keys()]).toEqual(["flat"]);
  });
});

describe("buildLifecycleIndexFromRecords — record-fed (sync, fs-free)", () => {
  it("indexes resolved lifecycle fields without raw meta text", () => {
    const index = buildLifecycleIndexFromRecords([
      {
        slug: "active-alpha",
        state: "Active",
        location: "active",
        cohort: "ops",
        dependsOn: ["done-dep"],
        path: ".arc/active/meta-active-alpha.md",
      },
      {
        slug: "parked-beta",
        state: "Active",
        location: "planned",
        cohort: null,
        dependsOn: [],
      },
      {
        slug: "shipped-gamma",
        state: "Shipped",
        location: "completed",
        cohort: "archive",
        dependsOn: [],
      },
      {
        slug: "legacy",
        state: "Paused",
        location: "active",
        cohort: null,
        dependsOn: [],
      },
    ]);

    expect(index.get("active-alpha")).toEqual({
      slug: "active-alpha",
      phase: "Active",
      location: "active",
      cohort: "ops",
      dependsOn: ["done-dep"],
      path: ".arc/active/meta-active-alpha.md",
    });
    expect(index.get("parked-beta")).toMatchObject({
      phase: "Active",
      location: "planned",
      cohort: null,
      dependsOn: [],
    });
    expect(index.get("parked-beta")?.path).toContain("meta-parked-beta.md");
    expect(index.get("shipped-gamma")?.location).toBe("completed");
    expect(index.has("legacy")).toBe(false);
  });

  it("preserves caller-supplied custom, nested, and archived record paths exactly", () => {
    const records = [
      { slug: "active", state: "Active", location: "active", path: "custom/live.md" },
      { slug: "nested", state: "Planning", location: "planned", path: ".arc/backlog/planned/coh/nested/record.md" },
      { slug: "archived", state: "Shipped", location: "completed", path: ".arc/completed/2026-q3/09_archived/custom.md" },
    ] as const;

    const index = buildLifecycleIndexFromRecords(records);

    for (const record of records) expect(index.get(record.slug)?.path).toBe(record.path);
  });
});
