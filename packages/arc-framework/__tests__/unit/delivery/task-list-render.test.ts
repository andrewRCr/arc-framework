import { describe, expect, it } from "vitest";

import {
  renderDeliveryPlanSection,
  replaceDeliveryPlanSection,
} from "../../../src/lib/delivery/task-list-render.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
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
  readonly landed?: boolean;
  readonly oneMember?: boolean;
} = {}): DeliveryPlanV1 {
  const firstId = digest("first-id");
  const secondId = digest("second-id");
  const members = [{
    status: options.landed === true ? "landed" as const : "live" as const,
    chunkKey: "first",
    title: "First member",
    contract: "Publish the first contract",
    taskIds: ["1.1"],
    designElementIds: ["requirements:first"],
    mainlineLandability: "independently-landable" as const,
    deliverableId: firstId,
    assuranceSubjectId: digest("first-assurance"),
    semanticFingerprint: digest("first-fingerprint"),
  }, ...options.oneMember === true ? [] : [{
    status: "live" as const,
    chunkKey: "second",
    title: "Second | member",
    contract: "Publish the second contract",
    taskIds: options.shared === true ? ["1.1", "1.2"] : ["1.2"],
    designElementIds: [],
    mainlineLandability: "independently-landable" as const,
    deliverableId: secondId,
    assuranceSubjectId: digest("second-assurance"),
    semanticFingerprint: digest("second-fingerprint"),
  }]];
  return DeliveryPlanV1Schema.parse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: "delivery-plan-record",
    planId: PLAN_ID,
    planRevision: options.landed === true ? 2 : 1,
    previousPlanDigest: options.landed === true ? digest("previous-plan") : null,
    design: {
      artifacts: [{ artifactId: "spec.md", revisionDigest: digest("spec") }],
      elements: [{ elementId: "requirements:first", semanticDigest: digest("element") }],
    },
    tasks: {
      inventoryDigest: digest("tasks"),
      implementation: [
        { taskId: "1.1", semanticDigest: digest("task-1") },
        { taskId: "1.2", semanticDigest: digest("task-2") },
      ],
      verificationTaskId: "2.1",
    },
    entry: "from-tasks",
    projection: { kind: options.projection ?? "stack-to-main" },
    members,
    seams: options.oneMember === true ? [] : [{
      seamKey: "contract",
      title: "Cross-member contract",
      acceptance: "Both | sides agree",
      incidentDeliverableIds: [firstId, secondId],
      ownerDeliverableId: secondId,
      designElementIds: [],
      assuranceSubjectId: digest("seam-assurance"),
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
  "## **Phase 1:** Build",
  "",
  "Phase content stays byte-identical.",
  "",
].join("\n");

describe("delivery task-list projection", () => {
  it("replaces one unmarked top-level section and installs exact sentinels", () => {
    const result = replaceDeliveryPlanSection(starter, plan());
    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") throw new Error("expected rendered task list");
    expect(result.content).toContain("<!-- arc:delivery-plan:start -->\n## Delivery Plan");
    expect(result.content).toContain("<!-- arc:delivery-plan:end -->");
    expect(result.content.startsWith("# Tasks\n\nPreamble stays byte-identical.\n\n")).toBe(true);
    expect(result.content.endsWith("## **Phase 1:** Build\n\nPhase content stays byte-identical.\n")).toBe(true);
  });

  it("replaces only the existing sentinel range on a successor render", () => {
    const first = replaceDeliveryPlanSection(starter, plan());
    if (first.status !== "rendered") throw new Error("expected first render");
    expect(first.content).toContain("- **Plan Revision:** `1`");
    const prefixed = `UNTOUCHED PREFIX\n${first.content}UNTOUCHED SUFFIX`;
    const second = replaceDeliveryPlanSection(prefixed, plan({ shared: true, landed: true }));
    expect(second.status).toBe("rendered");
    if (second.status !== "rendered") throw new Error("expected successor render");
    expect(second.content.startsWith("UNTOUCHED PREFIX\n# Tasks")).toBe(true);
    expect(second.content.endsWith("UNTOUCHED SUFFIX")).toBe(true);
    expect(second.content).toContain("`1.1` (shared)");
    expect(second.content).toContain("- **Plan Revision:** `2`");
    expect(second.content).not.toContain("- **Plan Revision:** `1`");
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

  it("renders shared tasks, landed values, named seams, and stack landability", () => {
    const section = renderDeliveryPlanSection(plan({ shared: true, landed: true }));
    expect(section).toContain([
      "## Delivery Plan",
      "",
      "- **Plan Revision:** `2`",
      `- **Plan Digest:** \`${digest("plan")}\``,
      "- **Projection:** `stack-to-main`",
      "",
      "| # | Member | Chunk key | Tasks | Design elements | Status | Landability |",
    ].join("\n"));
    expect(section).toContain("| Landability |");
    expect(section).toContain("`1.1` (shared)");
    expect(section).toContain("landed (as of landing)");
    expect(section).toContain("Second \\| member");
    expect(section).toContain("Both \\| sides agree");
    expect(section).toContain("| Cross-member contract | 1, 2 | 2 |");
  });

  it("renders one-member plans in the same shape and omits non-stack landability", () => {
    const section = renderDeliveryPlanSection(plan({
      projection: "wu-integration-target",
      oneMember: true,
    }));
    expect(section).toContain("| # | Member | Chunk key | Tasks | Design elements | Status |");
    expect(section).toContain("- **Projection:** `wu-integration-target`");
    expect(section).not.toContain("Landability");
    expect(section).toContain("| 1 | First member | `first` |");
    expect(section).toContain("_None._");
  });
});
