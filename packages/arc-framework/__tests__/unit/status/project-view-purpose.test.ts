import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  composeProjectReadinessViewResult,
  mergeProjectReadinessRecords,
  resolveProjectReadinessViewInput,
  type ProjectReadinessRecordCandidate,
} from "../../../src/lib/status/project-view.js";
import { resolveSlugQuery } from "../../../src/lib/work-unit/lifecycle-query.js";
import { buildLifecycleIndexFromRecords } from "../../../src/lib/work-unit/lifecycle-index.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

let root: string | undefined;
afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }); });

describe("project-view purpose facts", () => {
  it("reads designs only for an opted-in listing and leaves Markdown unchanged", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-purpose-listing-"));
    const folder = join(root, ".arc", "backlog", "planned", "topic");
    await mkdir(folder, { recursive: true });
    const artifactPath = join(folder, "draft-topic.md");
    await writeFile(join(folder, "meta-topic.md"), makeMetaFixture("topic", { state: "Planning", design: ["draft-topic.md"] }));
    await writeFile(artifactPath, "**Purpose:** One listing thesis. More context.\n");
    let designReads = 0;
    const fs = {
      readdir: (path: string) => readdir(path, { withFileTypes: true }),
      readFile: async (path: string) => {
        if (path === artifactPath) designReads += 1;
        return await readFile(path, "utf8");
      },
    };
    const plain = await resolveProjectReadinessViewInput({ cwd: root, fs });
    expect(designReads).toBe(0);
    const enriched = await resolveProjectReadinessViewInput({ cwd: root, fs, includePurpose: true });
    const render = (input: typeof plain) => composeProjectReadinessViewResult({ ...input, renderedRef: "fixed" });
    expect(render(enriched).facts[0]).toMatchObject({ purpose: "One listing thesis.", owner: "test-owner" });
    expect(render(enriched).markdown).toBe(render(plain).markdown);
  });

  it.each([
    { location: "provisional", state: "Planning", expectedState: "provisional" },
    { location: "planned", state: "Planning", expectedState: "planned" },
    { location: "active", state: "Planning", expectedState: "planning" },
    { location: "active", state: "Active", expectedState: "active" },
    { location: "completed", state: "Shipped", expectedState: "shipped" },
  ] as const)("agrees with the slug query for $location/$state", ({ location, state, expectedState }) => {
    const candidate: ProjectReadinessRecordCandidate = {
      slug: "topic", location, state, owner: "test-owner", priority: "P2", dependsOn: [],
    };
    const index = buildLifecycleIndexFromRecords([{ ...candidate, cohort: null }]);
    const query = resolveSlugQuery(index, "topic");
    const result = composeProjectReadinessViewResult({
      title: "Roadmap", renderedRef: "fixed", records: mergeProjectReadinessRecords([candidate]),
    });
    expect(result.facts[0]).toMatchObject({
      purpose: null, owner: "test-owner", state: expectedState, position: query.position,
    });
    expect(result.facts[0]?.state).toBe(query.state);
  });
});

describe("project-view horizon advisory", () => {
  it.each([
    { location: "provisional", state: "Planning", priority: "P2", horizon: "provisional", action: "Raise its priority" },
    { location: "planned", state: "Planning", priority: "P3", horizon: "planned at P3", action: "Raise its priority" },
    { location: "planned", state: "Active", priority: "P1", horizon: "parked", action: "Resume it" },
  ] as const)("explains the waiting horizon for $location/$state/$priority", ({ location, state, priority, horizon, action }) => {
    const result = composeProjectReadinessViewResult({
      title: "Roadmap", renderedRef: "fixed",
      records: mergeProjectReadinessRecords([{ slug: "topic", location, state, priority, dependsOn: [] }]),
    });
    const advisory = result.facts[0]?.horizonAdvisory;
    expect(advisory).toContain("topic");
    expect(advisory).toContain(horizon);
    expect(advisory).toContain("waits");
    expect(advisory).toContain(action);
    expect(advisory).toContain("separable part now");
    expect(advisory).not.toContain("\n");
  });

  it.each([
    { location: "planned", state: "Planning", priority: "P1" },
    { location: "planned", state: "Planning", priority: "P2" },
    { location: "active", state: "Planning", priority: "P3" },
    { location: "active", state: "Active", priority: "P3" },
    { location: "completed", state: "Shipped", priority: "P3" },
  ] as const)("has no advisory for $location/$state/$priority", ({ location, state, priority }) => {
    const result = composeProjectReadinessViewResult({
      title: "Roadmap", renderedRef: "fixed",
      records: mergeProjectReadinessRecords([{ slug: "topic", location, state, priority, dependsOn: [] }]),
    });
    expect(result.facts[0]?.horizonAdvisory).toBeNull();
  });
});
