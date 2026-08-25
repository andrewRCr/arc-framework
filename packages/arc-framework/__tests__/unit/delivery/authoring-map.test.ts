import { describe, expect, it } from "vitest";

import {
  parseDeliveryAuthoringMap,
  renderDeliveryAuthoringMap,
  validateDeliveryAuthoringMap,
} from "../../../src/lib/delivery/authoring-map.js";
import {
  createDeliveryAuthoringSnapshot,
  type DeliveryAuthoringSnapshotV1,
} from "../../../src/lib/delivery/authoring-schema.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";

function snapshot(): DeliveryAuthoringSnapshotV1 {
  const firstTask = canonicalDigest({ goal: "First" });
  const secondTask = canonicalDigest({ goal: "Second" });
  const parents = [
    { taskId: "1.1", semanticDigest: firstTask, role: { kind: "implementation" as const } },
    { taskId: "1.2", semanticDigest: secondTask, role: { kind: "implementation" as const } },
    {
      taskId: "2.1",
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  return createDeliveryAuthoringSnapshot({
    mapId: "authoring-map",
    originalWorkUnitId: "delivery-plan-record",
    planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
    expectedCurrentPlanDigest: null,
    design: {
      artifacts: [{ artifactId: "spec.md", revisionDigest: canonicalDigest({ spec: 1 }) }],
      elements: [{ elementId: "requirements:first", semanticDigest: canonicalDigest({ element: 1 }) }],
    },
    tasks: {
      inventoryDigest: canonicalDigest(parents),
      parents,
    },
    source: {
      entry: "from-tasks",
      inputs: { taskListPath: ".arc/active/tasks-delivery-plan-record.md" },
      facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1", "1.2"] }] },
      identitySequence: ["phase:1", "task:1.1", "task:1.2"],
    },
  });
}

const filledSlots = {
  projection: { kind: "stack-to-main" },
  boundary: { kind: "phase-aligned" },
  members: [{
    chunkKey: "first",
    title: "First member",
    contract: "Publish the first contract",
    designElementIds: ["requirements:first"],
    mainlineLandability: "independently-landable",
  }],
  seams: [],
} as const;

describe("delivery authoring map", () => {
  it("repeats the canonical machine material and emits only explicit unfilled slots", () => {
    const proposed = snapshot();
    const markdown = renderDeliveryAuthoringMap(proposed);
    const parsed = parseDeliveryAuthoringMap(markdown);
    const {
      candidatePlanDigest,
      candidateProjectionDigest,
      candidateOutcome,
      ...expectedMachine
    } = proposed;
    void candidatePlanDigest;
    void candidateProjectionDigest;
    void candidateOutcome;

    expect(parsed.status).toBe("parsed");
    if (parsed.status !== "parsed") throw new Error("expected parsed map");
    expect(parsed.machine).toEqual(expectedMachine);
    expect(parsed.slots).toEqual({
      projection: null,
      boundary: null,
      members: null,
      seams: null,
    });
    expect(markdown).not.toContain("ownerDeliverableId");
    expect(markdown).not.toContain("mainlineLandability\": \"");
  });

  it("refuses malformed maps before inspecting slots", () => {
    const proposed = snapshot();
    const malformed = renderDeliveryAuthoringMap(proposed).replace("```json", "```yaml");
    expect(validateDeliveryAuthoringMap(malformed, proposed)).toEqual({
      status: "refused",
      reason: "map-malformed",
    });
  });

  it("accepts CRLF line endings", () => {
    const proposed = snapshot();
    const crlf = renderDeliveryAuthoringMap(proposed, filledSlots).replaceAll("\n", "\r\n");
    expect(validateDeliveryAuthoringMap(crlf, proposed)).toEqual({
      status: "valid",
      slots: filledSlots,
    });
  });

  it("refuses every unfilled starter slot with its typed code", () => {
    const proposed = snapshot();
    expect(validateDeliveryAuthoringMap(renderDeliveryAuthoringMap(proposed), proposed)).toEqual({
      status: "refused",
      reason: "slot-unfilled",
    });
  });

  it("refuses a mutated derived value", () => {
    const proposed = snapshot();
    const mutated = renderDeliveryAuthoringMap(proposed, filledSlots)
      .replace("delivery-plan-record", "another-work-unit");
    expect(validateDeliveryAuthoringMap(mutated, proposed)).toEqual({
      status: "refused",
      reason: "derived-value-mutated",
    });
  });

  it("refuses a reordered identity sequence separately", () => {
    const proposed = snapshot();
    const reordered = renderDeliveryAuthoringMap(proposed, filledSlots)
      .replace(
        '"taskIds": [\n      "1.1",\n      "1.2",\n      "2.1"',
        '"taskIds": [\n      "1.2",\n      "1.1",\n      "2.1"',
      );
    expect(validateDeliveryAuthoringMap(reordered, proposed)).toEqual({
      status: "refused",
      reason: "identity-sequence-reordered",
    });
  });

  it("detects an edit made only to the canonical JSON snapshot", () => {
    const proposed = snapshot();
    const editedSnapshot = {
      ...proposed,
      originalWorkUnitId: "renamed-unit" as typeof proposed.originalWorkUnitId,
    };
    expect(validateDeliveryAuthoringMap(
      renderDeliveryAuthoringMap(proposed, filledSlots),
      editedSnapshot,
    )).toEqual({ status: "refused", reason: "derived-value-mutated" });
  });

  it("refuses an author-supplied seam owner as a derived mutation", () => {
    const proposed = snapshot();
    const withOwner = {
      ...filledSlots,
      seams: [{
        seamKey: "contract",
        title: "Contract",
        acceptance: "Both members agree",
        incidentChunkKeys: ["first", "second"],
        designElementIds: [],
        ownerDeliverableId: canonicalDigest({ owner: "second" }),
      }],
    };
    expect(validateDeliveryAuthoringMap(
      renderDeliveryAuthoringMap(proposed, withOwner),
      proposed,
    )).toEqual({ status: "refused", reason: "derived-value-mutated" });
  });

  it("accepts a filled map whose machine and authored identity sequences still match", () => {
    const proposed = snapshot();
    expect(validateDeliveryAuthoringMap(
      renderDeliveryAuthoringMap(proposed, filledSlots),
      proposed,
    )).toEqual({ status: "valid", slots: filledSlots });
  });
});
