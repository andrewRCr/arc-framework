import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, it, expect, afterEach } from "vitest";

import {
  composeProjectReadinessView,
  composeProjectReadinessViewResult,
  depsOnlyReadinessProvider,
  mergeProjectReadinessRecords,
  resolveProjectReadinessViewInput,
  type ProjectReadinessProvider,
  type ProjectReadinessRecordCandidate,
} from "../../../src/lib/status/project-view.js";

let root: string | undefined;

async function writeMeta(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function meta(slug: string, state: string, fields: { owner?: string; priority?: string; cohort?: string; dependsOn?: string } = {}): string {
  const owner = fields.owner ?? "andrew";
  const priority = fields.priority ?? "P3";
  const cohort = fields.cohort ?? "[none]";
  const dependsOn = fields.dependsOn ?? "[none]";
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`${state}\` | \`${owner}\` | [none] | \`Heavy\` | \`${priority}\` |`,
    "",
    `- **Cohort:** ${cohort}`,
    `- **Depends On:** ${dependsOn}`,
    "",
    "---",
    "",
  ].join("\n");
}

describe("composeProjectReadinessView", () => {
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("renders active, ready, and blocked tiers deterministically from meta files", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "active", "meta-active-alpha.md"),
      meta("active-alpha", "Active", { priority: "P1", cohort: "agile-parallelism" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "ready-beta", "meta-ready-beta.md"),
      meta("ready-beta", "Planning", { priority: "P2" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-gamma", "meta-blocked-gamma.md"),
      meta("blocked-gamma", "Planning", { dependsOn: "`ready-beta`" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-delta", "meta-blocked-delta.md"),
      meta("blocked-delta", "Planning", { dependsOn: "`blocked-gamma`" }),
    );

    const input = await resolveProjectReadinessViewInput({
      cwd: root,
      title: "Roadmap: Test Project",
    });
    const view = composeProjectReadinessView({
      ...input,
      renderedRef: "abc1234",
    });

    expect(view).toContain("# Roadmap: Test Project");
    expect(view).toContain("Last rendered against `abc1234`");
    expect(view).toContain("| `Active` | active-alpha | P1");
    expect(view).toContain("## Ready");
    expect(view).toContain("| ready-beta | P2");
    expect(view).toContain("## Blocked");
    expect(view).toContain("### Depth 1");
    const depth1Section = view.slice(view.indexOf("### Depth 1"), view.indexOf("### Depth 2"));
    expect(depth1Section).toContain("| blocked-gamma | P3");
    expect(depth1Section).toContain("ready-beta");
    expect(view).toContain("### Depth 2");
    const depth2Section = view.slice(view.indexOf("### Depth 2"));
    expect(depth2Section).toContain("| blocked-delta | P3");
    expect(depth2Section).toContain("blocked-gamma");
  });

  it("renders from injected records without reading the filesystem", () => {
    const view = composeProjectReadinessView({
      renderedRef: "abc1234",
      title: "Roadmap: Injected",
      records: mergeProjectReadinessRecords([
        record("active-alpha", { location: "active", state: "Active", priority: "P1" }),
        record("ready-beta", { location: "planned", dependsOn: [], priority: "P2" }),
        record("blocked-gamma", { location: "planned", dependsOn: ["active-alpha"] }),
      ]),
    });

    expect(view).toContain("# Roadmap: Injected");
    expect(view).toContain("| `Active` | active-alpha | P1");
    expect(view).toContain("| ready-beta | P2");
    expect(view).toContain("| blocked-gamma | P3");
  });
});

describe("mergeProjectReadinessRecords", () => {
  it("lets an at-ref active meta supersede a backlog stub", () => {
    const records = mergeProjectReadinessRecords([
      record("superseded", {
        location: "planned",
        owner: "stub-owner",
        priority: "P3",
        cohort: "old-cohort",
      }),
      record("superseded", {
        location: "active",
        owner: "active-owner",
        priority: "P1",
        cohort: "new-cohort",
      }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "superseded",
        location: "active",
        owner: "active-owner",
        priority: "P1",
        cohort: "new-cohort",
        source: expect.objectContaining({ kind: "active-meta" }),
        sources: expect.arrayContaining([
          expect.objectContaining({ kind: "active-meta" }),
          expect.objectContaining({ kind: "backlog-stub" }),
        ]),
      }),
    ]);
  });

  it("keeps backlog-only records from their stub", () => {
    const records = mergeProjectReadinessRecords([
      record("backlog-only", { location: "planned", owner: "andrew", priority: "P2" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "backlog-only",
        location: "planned",
        owner: "andrew",
        priority: "P2",
        source: expect.objectContaining({ kind: "backlog-stub" }),
      }),
    ]);
  });

  it("uses backlog parking for tier membership while keeping active row fields", () => {
    const records = mergeProjectReadinessRecords([
      record("shelved", {
        location: "planned",
        state: "Active",
        owner: "stub-owner",
        priority: "P3",
      }),
      record("shelved", {
        location: "active",
        state: "Active",
        owner: "active-owner",
        priority: "P1",
      }),
    ]);
    const view = composeProjectReadinessView({
      renderedRef: "abc1234",
      title: "Roadmap",
      records,
    });

    expect(records).toEqual([
      expect.objectContaining({
        slug: "shelved",
        location: "planned",
        scheduling: "parked",
        owner: "active-owner",
        priority: "P1",
      }),
    ]);
    expect(view).toContain("## Parked");
    expect(view).toContain("| shelved   | P1       | active-owner");
    expect(view).not.toContain("| `Active` | shelved");
  });

  it("does not filter another identity's active meta from project scope", () => {
    const records = mergeProjectReadinessRecords([
      record("theirs", { location: "planned", owner: "andrew" }),
      record("theirs", { location: "active", owner: "blair" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "theirs",
        location: "active",
        owner: "blair",
      }),
    ]);
  });

  it("uses deterministic precedence for any source combination", () => {
    const records = mergeProjectReadinessRecords([
      record("combo", { location: "completed", state: "Shipped", priority: "P3" }),
      record("combo", { location: "provisional", priority: "P2" }),
      record("combo", { location: "planned", priority: "P1" }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({
        slug: "combo",
        location: "planned",
        priority: "P1",
        sources: [
          expect.objectContaining({ location: "planned" }),
          expect.objectContaining({ location: "provisional" }),
          expect.objectContaining({ location: "completed" }),
        ],
      }),
    ]);
  });
});

describe("project-readiness dependency classification", () => {
  it("warns for a dangling dependency and treats it as unsatisfied", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("ready-control", { location: "planned", dependsOn: [] }),
        record("typo-blocked", { location: "planned", dependsOn: ["ghost-dep"] }),
      ]),
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "dangling-dependency",
        workUnit: "typo-blocked",
        dependency: "ghost-dep",
      }),
    ]);
    expect(result.markdown).toContain("## Warnings");
    expect(result.markdown).toContain("ghost-dep");
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("ready-control");
    expect(readySection).not.toContain("typo-blocked");
    const blockedSection = result.markdown.slice(result.markdown.indexOf("## Blocked"));
    expect(blockedSection).toContain("typo-blocked");
    expect(blockedSection).toContain("ghost-dep");
  });

  it("satisfies dependencies that resolve shipped from completed records", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("done-dep", { location: "completed", state: "Shipped" }),
        record("ready-after-ship", { location: "planned", dependsOn: ["done-dep"] }),
      ]),
    });

    expect(result.warnings).toEqual([]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("ready-after-ship");
    expect(readySection).not.toContain("done-dep");
    expect(result.markdown).not.toContain("### Depth 1");
  });

  it("keeps pending, parked, and at-ref active dependencies unsatisfied", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("pending-dep", { location: "planned", state: "Planning" }),
        record("parked-dep", { location: "planned", state: "Active" }),
        record("active-dep", { location: "active", state: "Active" }),
        record("waits-pending", { location: "planned", dependsOn: ["pending-dep"] }),
        record("waits-parked", { location: "planned", dependsOn: ["parked-dep"] }),
        record("waits-active", { location: "planned", dependsOn: ["active-dep"] }),
      ]),
    });

    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).not.toContain("waits-pending");
    expect(readySection).not.toContain("waits-parked");
    expect(readySection).not.toContain("waits-active");
    const blockedSection = sectionBetween(result.markdown, "## Blocked", "## Parked");
    expect(blockedSection).toContain("waits-pending");
    expect(blockedSection).toContain("pending-dep");
    expect(blockedSection).toContain("waits-parked");
    expect(blockedSection).toContain("parked-dep");
    expect(blockedSection).toContain("waits-active");
    expect(blockedSection).toContain("active-dep");
  });

  it("elevates stale-location derivation warnings only for unshipped work", () => {
    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("live-drift", { location: "active", state: "Active" }),
        record("shipped-drift", { location: "completed", state: "Shipped" }),
      ]),
      derivationWarnings: [
        {
          code: "stale-location-dropped",
          workUnit: "live-drift",
          rendered: "Meta `meta-live-drift.md` at `main` points to `feat/live-drift`; dropped stale location.",
        },
        {
          code: "stale-location-dropped",
          workUnit: "shipped-drift",
          rendered: "Meta `meta-shipped-drift.md` at `main` points to `feat/shipped-drift`; dropped stale location.",
        },
      ],
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "stale-location-unshipped",
        workUnit: "live-drift",
      }),
    ]);
    expect(result.markdown).toContain("live-drift");
    expect(result.markdown).not.toContain("shipped-drift.md");
  });
});

describe("project-readiness provider socket", () => {
  it("carries dependency satisfaction and readiness as independent facts", () => {
    const readyProvider: ProjectReadinessProvider = {
      resolve: (records) => new Map(records.map((item) => [item.slug, "ready" as const])),
    };

    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("independent-facts", { location: "planned", dependsOn: ["ghost-dep"] }),
      ]),
      readinessProvider: readyProvider,
    });

    expect(result.facts).toEqual([
      {
        slug: "independent-facts",
        dependencySatisfaction: "unsatisfied",
        readiness: "ready",
        unsatisfiedDependencies: ["ghost-dep"],
      },
    ]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).not.toContain("independent-facts");
    expect(result.markdown).toContain("independent-facts");
  });

  it("lets a provider change readiness without changing dependency satisfaction", () => {
    const blockingProvider: ProjectReadinessProvider = {
      resolve: (records) =>
        new Map(records.map((item) => [item.slug, item.slug === "provider-blocked" ? "blocked" as const : "ready" as const])),
    };

    const result = composeProjectReadinessViewResult({
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("provider-ready", { location: "planned" }),
        record("provider-blocked", { location: "planned" }),
      ]),
      readinessProvider: blockingProvider,
    });

    expect(result.facts).toEqual([
      {
        slug: "provider-blocked",
        dependencySatisfaction: "satisfied",
        readiness: "blocked",
        unsatisfiedDependencies: [],
      },
      {
        slug: "provider-ready",
        dependencySatisfaction: "satisfied",
        readiness: "ready",
        unsatisfiedDependencies: [],
      },
    ]);
    const readySection = sectionBetween(result.markdown, "## Ready", "## Blocked");
    expect(readySection).toContain("provider-ready");
    expect(readySection).not.toContain("provider-blocked");
    const blockedSection = result.markdown.slice(result.markdown.indexOf("## Blocked"));
    expect(blockedSection).toContain("provider-blocked");
  });

  it("defaults to the deps-only provider", () => {
    const options = {
      renderedRef: "abc1234",
      title: "Roadmap",
      records: mergeProjectReadinessRecords([
        record("ready", { location: "planned" }),
        record("blocked", { location: "planned", dependsOn: ["ready"] }),
      ]),
    };

    const defaultResult = composeProjectReadinessViewResult(options);
    const explicitResult = composeProjectReadinessViewResult({
      ...options,
      readinessProvider: depsOnlyReadinessProvider,
    });

    expect(defaultResult).toEqual(explicitResult);
    expect(composeProjectReadinessView(options)).toEqual(defaultResult.markdown);
  });
});

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  return markdown.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

function record(
  slug: string,
  fields: Partial<ProjectReadinessRecordCandidate> = {},
): ProjectReadinessRecordCandidate {
  return {
    slug,
    location: "planned",
    state: "Planning",
    priority: "P3",
    dependsOn: [],
    ...fields,
  };
}
