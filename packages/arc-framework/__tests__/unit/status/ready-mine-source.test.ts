import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadReadyMineSlice } from "../../../src/lib/status/ready-mine-source.js";

/** A minimal meta-file body with the readiness fields the source parses. */
function meta(fields: { owner?: string; dependsOn?: string; cohort?: string; class?: string } = {}): string {
  return [
    "# Metadata: x",
    "",
    "- **State:** Planning",
    `- **Owner:** ${fields.owner ?? "andrew"}`,
    `- **Depends On:** ${fields.dependsOn ?? "[none]"}`,
    `- **Cohort:** ${fields.cohort ?? "[none]"}`,
    ...(fields.class !== undefined ? [`- **Class:** ${fields.class}`] : []),
    "",
    "---",
  ].join("\n");
}

describe("loadReadyMineSlice", () => {
  let root: string;

  /** Write a meta under `<root>/.arc/<segments...>/<wu>/meta-<wu>.md`. */
  async function seed(segments: string[], wu: string, body: string): Promise<void> {
    const dir = join(root, ".arc", ...segments, wu);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `meta-${wu}.md`), body, "utf8");
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-ready-mine-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("loads owned, unblocked planned WUs sized by Class, excluding blocked and not-mine", async () => {
    // Ready: owned, deps all shipped (absent from the pipeline).
    await seed(["backlog", "planned"], "ready-heavy", meta({ class: "heavy", cohort: "ranger" }));
    // Blocked: depends on a still-planned WU.
    await seed(["backlog", "planned"], "blocked-one", meta({ dependsOn: "ready-heavy" }));
    // Not mine: different owner.
    await seed(["backlog", "planned"], "theirs", meta({ owner: "blair" }));
    // Blocked by an in-flight (active) dependency.
    await seed(["active"], "active-dep", meta());
    await seed(["backlog", "planned"], "waits-on-active", meta({ dependsOn: "active-dep" }));
    // A provisional WU is still pending — a dep on it blocks.
    await seed(["backlog", "provisional"], "prov-dep", meta());
    await seed(["backlog", "planned"], "waits-on-prov", meta({ dependsOn: "prov-dep" }));

    const slice = await loadReadyMineSlice({ cwd: root, identity: "andrew" });

    expect(slice).toEqual([
      { workUnit: "ready-heavy", state: "Planning", class: "Heavy", cohort: "ranger", dependsOn: [] },
    ]);
  });

  it("treats a dependency on a shipped (absent) WU as satisfied", async () => {
    await seed(["backlog", "planned"], "alpha", meta({ dependsOn: "long-gone", class: "light" }));

    const slice = await loadReadyMineSlice({ cwd: root, identity: "andrew" });

    expect(slice.map((r) => r.workUnit)).toEqual(["alpha"]);
  });

  it("returns an empty slice when there is no planned directory", async () => {
    await mkdir(join(root, ".arc"), { recursive: true });

    const slice = await loadReadyMineSlice({ cwd: root, identity: "andrew" });

    expect(slice).toEqual([]);
  });
});
