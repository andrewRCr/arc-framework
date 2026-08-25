import { lint } from "markdownlint/promise";
import { describe, expect, it } from "vitest";

import {
  renderDeliveryPlanSection,
  replaceDeliveryPlanSection,
} from "../../../src/lib/delivery/task-list-render.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { displayWidth } from "../../../src/lib/markdown/index.js";
import {
  DeliveryPlanV1Schema,
  type DeliveryPlanV1,
} from "../../../src/lib/delivery/schema.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";

function digest(label: string) {
  return canonicalDigest({ label });
}

function plan(options: {
  readonly projection?: "stack-to-main" | "wu-integration-target";
  readonly shared?: boolean;
  readonly oneMember?: boolean;
  readonly unicode?: boolean;
  readonly longAcceptance?: boolean;
  readonly longSeamTitle?: boolean;
  readonly unbrokenAcceptance?: boolean;
} = {}): DeliveryPlanV1 {
  const firstId = digest("first-id");
  const secondId = digest("second-id");
  const members = [{
    chunkKey: options.unicode === true ? "native-stack-tail" : "first",
    title: options.unicode === true
      ? "Native 表 stack composition and lifecycle tail 👩‍💻"
      : "First member",
    contract: "Publish the first contract",
    taskIds: ["1.1"],
    designElementIds: ["requirements:first"],
    mainlineLandability: "independently-landable" as const,
    deliverableId: firstId,
    semanticFingerprint: digest("first-fingerprint"),
  }, ...options.oneMember === true ? [] : [{
    chunkKey: "second",
    title: "Second | member",
    contract: "Publish the second contract",
    taskIds: options.shared === true ? ["1.1", "1.2"] : ["1.2"],
    designElementIds: [],
    mainlineLandability: "independently-landable" as const,
    deliverableId: secondId,
    semanticFingerprint: digest("second-fingerprint"),
  }]];
  return DeliveryPlanV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    planId: PLAN_ID,
    planRevision: 1,
    previousPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec.md", revisionDigest: digest("spec") }],
      elements: [{ elementId: "requirements:first", semanticDigest: digest("element") }],
    },
    tasks: {
      inventoryDigest: digest("tasks"),
      parents: [
        {
          taskId: "1.1",
          semanticDigest: digest("task-1"),
          role: { kind: "implementation" },
        },
        {
          taskId: "1.2",
          semanticDigest: digest("task-2"),
          role: { kind: "implementation" },
        },
        {
          taskId: "2.1",
          semanticDigest: null,
          role: { kind: "verification", scope: "work-unit" },
        },
      ],
    },
    entry: "from-tasks",
    projection: { kind: options.projection ?? "stack-to-main" },
    members,
    seams: options.oneMember === true ? [] : [{
      seamKey: "contract",
      title: options.longSeamTitle === true
        ? Array.from({ length: 30 }, (_, index) => `boundary-${String(index + 1)}`).join(" ")
        : options.longAcceptance === true ? "Landing to suffix reconciliation" : "Cross-member contract",
      acceptance: options.unbrokenAcceptance === true
        ? "x".repeat(150)
        : options.longAcceptance === true
        ? "Every pushed member head is one validated authored cut and carries the protected-base state at every lifecycle-contribution path without introducing a second authority."
        : "Both | sides agree",
      incidentDeliverableIds: [firstId, secondId],
      ownerDeliverableId: secondId,
      designElementIds: options.longAcceptance === true
        ? ["req:entry", "constraint:base", "arch:authority"]
        : [],
      semanticFingerprint: digest("seam-fingerprint"),
    }],
    planDigest: digest("plan"),
  });
}

const starter = [
  "# Tasks",
  "",
  "Preamble stays byte-identical.",
  "",
  "## Delivery Plan",
  "",
  "_Not authored yet._",
  "",
  "### `[ ]` **9.9 Task-shaped provisional member**",
  "",
  "## **Phase 1:** Build",
  "",
  "Phase content stays byte-identical.",
  "",
].join("\n");

describe("delivery task-list projection", () => {
  it("replaces one unmarked locus, preserves phase bytes, and passes MD060 as a full document", async () => {
    const result = replaceDeliveryPlanSection(starter, plan());
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") throw new Error("expected rendered task list");
    expect(result.content).toContain("<!-- arc:delivery-plan:start -->\n## Delivery Plan");
    expect(result.content).toContain("<!-- arc:delivery-plan:end -->");
    expect(result.content.startsWith("# Tasks\n\nPreamble stays byte-identical.\n\n")).toBe(true);
    const phaseBytes = "## **Phase 1:** Build\n\nPhase content stays byte-identical.\n";
    expect(result.content.slice(result.content.indexOf("## **Phase 1:** Build"))).toBe(phaseBytes);
    expect(result.content).not.toContain("markdownlint-disable");
    const lintResult = await lint({
      strings: { "tasks.md": result.content },
      config: { default: false, MD060: { style: "aligned" } },
    });
    expect(lintResult["tasks.md"]).toEqual([]);
  });

  it("replaces only the existing sentinel range on a successor render", () => {
    const first = replaceDeliveryPlanSection(starter, plan());
    if (first.status !== "rendered") throw new Error("expected first render");
    expect(first.content).toContain("- **Plan Revision:** `1`");
    const prefixed = `UNTOUCHED PREFIX\n${first.content}UNTOUCHED SUFFIX`;
    const secondPlan = structuredClone(plan({ shared: true }));
    secondPlan.planRevision = 2;
    secondPlan.previousPlanDigest = digest("previous-plan");
    const second = replaceDeliveryPlanSection(prefixed, secondPlan);
    expect(second.status).toBe("rendered");
    if (second.status !== "rendered") throw new Error("expected successor render");
    expect(second.content.startsWith("UNTOUCHED PREFIX\n# Tasks")).toBe(true);
    expect(second.content.endsWith("UNTOUCHED SUFFIX")).toBe(true);
    expect(second.content).toContain("`1.1` (shared)");
    expect(second.content).toContain("- **Plan Revision:** `2`");
    expect(second.content).not.toContain("- **Plan Revision:** `1`");
    expect(second.content).toContain(
      "<!-- arc:delivery-plan:end -->\n\n## **Phase 1:** Build",
    );
    expect(second.content).not.toContain(
      "<!-- arc:delivery-plan:end -->\n\n\n## **Phase 1:** Build",
    );
  });

  it("refuses absent, duplicate, reversed, and partial replacement loci", () => {
    expect(replaceDeliveryPlanSection("# Tasks\n", plan())).toEqual({
      status: "refused",
      reason: "replacement-locus-missing",
    });
    expect(replaceDeliveryPlanSection(`${starter}\n## Delivery Plan\n`, plan())).toEqual({
      status: "refused",
      reason: "replacement-locus-duplicate",
    });
    expect(replaceDeliveryPlanSection([
      "<!-- arc:delivery-plan:end -->",
      "## Delivery Plan",
      "<!-- arc:delivery-plan:start -->",
    ].join("\n"), plan())).toEqual({
      status: "refused",
      reason: "replacement-locus-malformed",
    });
    expect(replaceDeliveryPlanSection("<!-- arc:delivery-plan:start -->\n## Delivery Plan\n", plan()))
      .toEqual({ status: "refused", reason: "replacement-locus-malformed" });
  });

  it("renders shared tasks, named seams, and stack landability without provider position", () => {
    const renderedPlan = structuredClone(plan({ shared: true }));
    renderedPlan.planRevision = 2;
    renderedPlan.previousPlanDigest = digest("previous-plan");
    const section = renderDeliveryPlanSection(renderedPlan);
    expect(section).toContain([
      "## Delivery Plan",
      "",
      "- **Plan Revision:** `2`",
      `- **Plan Digest:** \`${digest("plan")}\``,
      "- **Projection:** `stack-to-main`",
    ].join("\n"));
    expect(section).toContain("- **Landability:** All members are `independently-landable`.");
    expect(section).toMatch(/\| #\s+\| Member\s+\| Chunk key\s+\|/u);
    expect(section).toMatch(/\| #\s+\| Tasks\s+\| Design elements\s+\|/u);
    expect(section).toContain("`1.1` (shared)");
    expect(section).toContain("`1.1` (shared), `1.2`");
    expect(section).not.toContain("<br>");
    expect(section).not.toContain("Status");
    expect(section).not.toContain("landed (as of landing)");
    expect(section).toContain("Second \\| member");
    expect(section).toContain("Both | sides agree");
    expect(section).toMatch(/\| 1\s+\| Cross-member contract\s+\| 1, 2\s+\| 2\s+\|/u);
  });

  it("aligns all delivery tables and wraps acceptance prose for the Markdown gate", async () => {
    const section = renderDeliveryPlanSection(plan({
      shared: true,
      unicode: true,
      longAcceptance: true,
    }));
    const results = await lint({
      strings: { "tasks.md": section },
      config: {
        default: false,
        MD013: { line_length: 120, tables: false },
        MD060: { style: "aligned" },
      },
    });

    expect(results["tasks.md"]).toEqual([]);
    expect(Math.max(...section.split("\n").map(displayWidth))).toBeLessThanOrEqual(120);
  });

  it("wraps a long breakable seam label for the Markdown gate", async () => {
    const section = renderDeliveryPlanSection(plan({ longSeamTitle: true }));
    const results = await lint({
      strings: { "tasks.md": section },
      config: {
        default: false,
        MD013: { line_length: 120, tables: false },
        MD060: { style: "aligned" },
      },
    });

    expect(results["tasks.md"]).toEqual([]);
    expect(Math.max(...section.split("\n")
      .filter((line) => !line.startsWith("|"))
      .map(displayWidth))).toBeLessThanOrEqual(120);
  });

  it("preserves an indivisible acceptance token while keeping the Markdown gate green", async () => {
    const token = "x".repeat(150);
    const section = renderDeliveryPlanSection(plan({ unbrokenAcceptance: true }));
    const lines = section.split("\n");
    const tokenLine = lines.find((line) => line.includes(token));
    const results = await lint({
      strings: { "tasks.md": section },
      config: {
        default: false,
        MD013: { line_length: 120, tables: false },
        MD060: { style: "aligned" },
      },
    });

    expect(results["tasks.md"]).toEqual([]);
    expect(tokenLine).toBeDefined();
    expect(displayWidth(tokenLine ?? "")).toBeGreaterThan(120);
    expect(Math.max(...lines.filter((line) => line !== tokenLine).map(displayWidth))).toBeLessThanOrEqual(120);
  });

  it("keeps nonuniform stack landability visible instead of overstating the summary", () => {
    const mixed = structuredClone(plan());
    mixed.members[1]!.mainlineLandability = "integration-only";

    expect(renderDeliveryPlanSection(mixed)).toContain(
      "- **Landability:** 1 `independently-landable`, 2 `integration-only`.",
    );
  });

  it("renders one-member plans in the same shape and omits non-stack landability", () => {
    const section = renderDeliveryPlanSection(plan({
      projection: "wu-integration-target",
      oneMember: true,
    }));
    expect(section).toMatch(/\| #\s+\| Member\s+\| Chunk key\s+\|/u);
    expect(section).toMatch(/\| #\s+\| Tasks\s+\| Design elements\s+\|/u);
    expect(section).not.toContain("Status");
    expect(section).toContain("- **Projection:** `wu-integration-target`");
    expect(section).not.toContain("Landability");
    expect(section).toMatch(/\| 1\s+\| First member\s+\| `first`\s+\|/u);
    expect(section).toContain("_None._");
    expect(section).not.toContain("#### Acceptance");
  });
});
