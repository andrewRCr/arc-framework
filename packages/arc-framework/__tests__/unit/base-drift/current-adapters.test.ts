import { describe, expect, it, vi } from "vitest";

import {
  createCompletedMetaResolver,
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../../../src/lib/base-drift/current-adapters.js";
import type { BaseDriftCommitInput, IntegrationEvent } from "../../../src/lib/git/base-drift-types.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { analyzeIntegrationEvidence } from "../../../src/lib/git/base-integration-evidence.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";

const BASE = "b".repeat(40);
const COMMIT = "c".repeat(40);
const PARENT = "a".repeat(40);
const META_PATH = ".arc/completed/2026-q3/01_widget/meta-widget.md";
const UNREADABLE_META_PATH = ".arc/completed/2026-q3/02_other/meta-other.md";
const PR_LESS_META_PATH = ".arc/completed/2026-q3/03_prless/meta-prless.md";
const meta = (pr: number): string => [
  "# Metadata: widget",
  "",
  "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
  "| --------- | --------- | ---------- | --------- | ------------ |",
  "| Shipped | — | — | — | — |",
  "",
  `- **PR URL:** https://github.com/o/r/pull/${pr}`,
  "",
  "---",
  "",
].join("\n");

function input(subject: string, acceptedPrNumber?: number): BaseDriftCommitInput {
  return {
    oid: COMMIT,
    parents: [PARENT],
    subject,
    ...(acceptedPrNumber === undefined ? {} : { acceptedPrNumber }),
  };
}

describe("current path-treatment adapter", () => {
  it("binds explicit work-unit and projection coordinates without ambient identity", () => {
    const classify = createCurrentBaseDriftAdapters(
      vi.fn() as unknown as GitExec,
      createLifecycleHarness().store,
      workUnitPathTreatmentContext("example"),
    ).classifyReconciliation;

    expect(classify("packages/arc-framework/src/example.ts")).toBe("reviewable");
    expect(classify(".arc/active/tasks-example.md")).toBe("evidence-neutral");
    expect(classify(".arc/active/tasks-sibling.md")).toBe("reviewable");
    expect(classify(".arc/system/.internal/candidates/example.json")).toBe("evidence-neutral");
    expect(classify(".arc/backlog/ROADMAP.md")).toBe("regenerable");
  });

  it("leaves work-unit paths reviewable when no identity is supplied", () => {
    const classify = createCurrentBaseDriftAdapters(vi.fn() as unknown as GitExec, createLifecycleHarness().store)
      .classifyReconciliation;

    expect(classify(".arc/active/tasks-example.md")).toBe("reviewable");
    expect(classify(".arc/backlog/ROADMAP.md")).toBe("regenerable");
  });
});

describe("completed-meta integration resolver", () => {
  it("builds the base archive index once and uniquely enriches topology by PR", async () => {
    const exec = vi.fn<GitExec>(async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\n` };
      if (args[0] === "show" && args[1] === `${BASE}:${META_PATH}`) return { stdout: meta(7) };
      if (args[0] === "diff-tree") return { stdout: "" };
      throw new Error(`unexpected: ${args.join(" ")}`);
    });
    const resolver = createCompletedMetaResolver(exec, BASE);
    const event: IntegrationEvent = { commits: [COMMIT], proof: "topology", prNumber: 7 };
    const result = await resolver.enrichTopologyEvent(event, input("merge", 7));
    expect(result).toEqual({
      status: "available",
      value: { slug: "widget", prNumber: 7, prUrl: "https://github.com/o/r/pull/7" },
    });
    await resolver.proveSingleParentEvents([]);
    expect(exec.mock.calls.filter(([, args]) => args[0] === "ls-tree")).toHaveLength(1);
  });

  it("proves a squash only from matching same-commit archive and suffix facts", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: "" };
      if (args[0] === "diff-tree") return { stdout: `A\0${META_PATH}\0` };
      if (args[0] === "show") return { stdout: meta(9) };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    await expect(resolver.proveSingleParentEvents([input("delivery (#9)", 9)])).resolves.toEqual({
      status: "available",
      value: [{
        commits: [COMMIT], slug: "widget", prNumber: 9, prUrl: "https://github.com/o/r/pull/9",
      }],
    });
    await expect(resolver.proveSingleParentEvents([input("delivery (#8)", 8)])).resolves.toEqual({
      status: "available",
      value: [],
    });
  });

  it("does not replace topology PR identity with a conflicting same-commit meta", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: "" };
      if (args[0] === "diff-tree") return { stdout: `A\0${META_PATH}\0` };
      if (args[0] === "show") return { stdout: meta(9) };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    const event: IntegrationEvent = { commits: [COMMIT], proof: "topology", prNumber: 7 };
    await expect(resolver.enrichTopologyEvent(event, input("merge", 7))).resolves.toEqual({
      status: "available",
      value: null,
    });
  });

  it("prefers an exact archive PR identity over a PR-less same-commit meta", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\n` };
      if (args[0] === "diff-tree") return { stdout: `A\0${PR_LESS_META_PATH}\0` };
      if (args[0] === "show" && args[1] === `${BASE}:${META_PATH}`) return { stdout: meta(7) };
      if (args[0] === "show" && args[1] === `${COMMIT}:${PR_LESS_META_PATH}`) {
        return { stdout: makeMetaFixture("prless", { state: "Shipped" }) };
      }
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    const event: IntegrationEvent = { commits: [COMMIT], proof: "topology", prNumber: 7 };
    await expect(resolver.enrichTopologyEvent(event, input("merge", 7))).resolves.toEqual({
      status: "available",
      value: { slug: "widget", prNumber: 7, prUrl: "https://github.com/o/r/pull/7" },
    });
  });

  it("does not claim a unique archive PR identity from a partial archive read", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\n${UNREADABLE_META_PATH}\n` };
      if (args[0] === "show" && args[1] === `${BASE}:${META_PATH}`) return { stdout: meta(7) };
      if (args[0] === "show" && args[1] === `${BASE}:${UNREADABLE_META_PATH}`) {
        throw new Error("unreadable meta");
      }
      if (args[0] === "diff-tree") return { stdout: "" };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    const event: IntegrationEvent = { commits: [COMMIT], proof: "topology", prNumber: 7 };
    await expect(resolver.enrichTopologyEvent(event, input("merge", 7))).resolves.toEqual({
      status: "partial",
      value: null,
    });
  });

  it("surfaces malformed status framing as resolver degradation", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: "" };
      if (args[0] === "diff-tree") return { stdout: `A\0${META_PATH}` };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCompletedMetaResolver(exec, BASE);
    await expect(resolver.proveSingleParentEvents([input("delivery (#9)", 9)])).resolves.toEqual({
      status: "partial",
      value: [],
    });
  });
});

describe("stored completed-record integration resolver", () => {
  const offBranchExec = vi.fn<GitExec>(async (_cmd, args) => { throw new Error(`unexpected: ${args.join(" ")}`); });
  async function archived(prs: Readonly<Record<string, number>>): Promise<Store> {
    const h = createLifecycleHarness();
    for (const [name, pr] of Object.entries(prs)) {
      await h.seedMeta(name, { state: "Shipped", currentWorkflow: null, prUrl: `https://github.com/o/r/pull/${pr}` },
        { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    }
    return h.store;
  }
  const topology = (prNumber: number): IntegrationEvent => ({ commits: [COMMIT], proof: "topology", prNumber });

  it("names a merge by the pull request one archived meta names", async () => {
    const resolver = createCurrentBaseDriftAdapters(offBranchExec, await archived({ widget: 7 })).resolverFactory(BASE);
    await expect(resolver.enrichTopologyEvent(topology(7), input("merge", 7))).resolves.toEqual({
      status: "available",
      value: { slug: "widget", prNumber: 7, prUrl: "https://github.com/o/r/pull/7" },
    });
  });

  it.each([
    { generation: "live", laterPr: null, unique: true },
    { generation: "archived with a different PR", laterPr: 43, unique: true },
    { generation: "archived with the same PR", laterPr: 42, unique: false },
  ])("matches archived PR 42 when the next generation of shared is $generation", async ({ laterPr, unique }) => {
    const h = createLifecycleHarness();
    const archive = (pr: number, quarter: string) => h.seedMeta("shared",
      { state: "Shipped", currentWorkflow: null, prUrl: `https://github.com/o/r/pull/${pr}` },
      { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) });
    await archive(42, "2026-q3");
    if (laterPr === null) await h.seedMeta("shared");
    else await archive(laterPr, "2026-q4");

    const resolver = createCurrentBaseDriftAdapters(offBranchExec, h.store).resolverFactory(BASE);
    const identity = { slug: "shared", prNumber: 42, prUrl: "https://github.com/o/r/pull/42" };
    const merge = { ...input("Merge pull request #42", 42), parents: [PARENT, BASE] };
    expect.soft(await resolver.enrichTopologyEvent(topology(42), merge)).toEqual({
      status: "available", value: unique ? identity : null,
    });
    expect.soft(await resolver.proveSingleParentEvents([input("delivery (#42)", 42)])).toEqual({
      status: "available", value: unique ? [{ commits: [COMMIT], ...identity }] : [],
    });
  });

  it("names no work unit for a pull request two archived metas name, as for one no archived meta names", async () => {
    const resolver = createCurrentBaseDriftAdapters(offBranchExec, await archived({ widget: 7, gadget: 7, other: 8 }))
      .resolverFactory(BASE);
    for (const prNumber of [7, 9]) {
      await expect(resolver.enrichTopologyEvent(topology(prNumber), input("merge", prNumber)))
        .resolves.toEqual({ status: "available", value: null });
      await expect(resolver.proveSingleParentEvents([input(`delivery (#${prNumber})`, prNumber)]))
        .resolves.toEqual({ status: "available", value: [] });
    }
  });

  it("reconciles a squash merge through the stored record", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "log") return { stdout: `${COMMIT}\0${PARENT}\0delivery (#9)\0` };
      throw new Error(`unexpected: ${args.join(" ")}`);
    };
    const resolver = createCurrentBaseDriftAdapters(exec, await archived({ widget: 9 })).resolverFactory(BASE);
    await expect(analyzeIntegrationEvidence({ exec, baseOid: BASE, headOid: PARENT, resolver })).resolves.toMatchObject({
      coverage: "complete",
      unclassifiedCommitCount: 0,
      events: [{ commits: [COMMIT], proof: "resolver", slug: "widget", prNumber: 9 }],
    });
  });
});
