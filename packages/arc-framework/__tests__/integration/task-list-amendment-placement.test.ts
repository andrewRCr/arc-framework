import { describe, expect, it } from "vitest";

import {
  amendmentPlacementTaskList,
  amendmentPlacementTaskListPath,
} from "../fixtures/amendment-task-list.js";
import { buildDeliveryTaskInventory } from "../../src/lib/delivery/task-inventory.js";
import { resolveTaskListCursor } from "../../src/lib/task-list/cursor.js";
import { scanTaskListStructure } from "../../src/lib/task-list/scanner.js";
import { scanTaskListSegmentation } from "../../src/lib/task-list/segmentation.js";

const content = amendmentPlacementTaskList();

function segmentation() {
  return scanTaskListSegmentation({ path: amendmentPlacementTaskListPath, content });
}

describe("amendment placement across shipped task-list consumers", () => {
  it("carries all three corrective id forms in their authored positions", () => {
    const scan = scanTaskListStructure(content);
    expect(scan.status).toBe("scanned");
    if (scan.status !== "scanned") return;

    const parents = scan.events
      .filter((event) => event.type === "parent")
      .map((event) => event.item.id);
    const subtasks = scan.events
      .filter((event) => event.type === "subtask")
      .map((event) => event.item.id);

    expect(parents).toEqual(["1.1", "1.R", "1.R2", "1.2", "2.1", "2.2", "3.1"]);
    expect(subtasks).toContain("2.1.R");
  });

  it("resolves both declared segments, so the segment-verifier checks are live", () => {
    const result = segmentation();

    expect(result.segments.map((segment) => segment.closingPhase.id)).toEqual(["1", "2"]);
    expect(result.segments.every((segment) => segment.mode !== "layer")).toBe(true);
  });

  it("accepts a corrective parent placed ahead of its phase's segment verifier", () => {
    const result = segmentation();

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "segment-verifier-orphan",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "segment-verifier-missing",
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("selects the first open corrective parent and its open leaf as the cursor", () => {
    const result = resolveTaskListCursor(content);

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.cursor.section.id).toBe("1.R");
    expect(result.cursor.leaf.id).toBe("1.R.a");
  });

  it("builds a delivery inventory that treats corrective parents as implementation work", () => {
    const result = buildDeliveryTaskInventory(content);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.inventory.parents.map((parent) => ({ taskId: parent.taskId, role: parent.role })))
      .toEqual([
        { taskId: "1.1", role: { kind: "implementation" } },
        { taskId: "1.R", role: { kind: "implementation" } },
        { taskId: "1.R2", role: { kind: "implementation" } },
        { taskId: "1.2", role: { kind: "verification", scope: "segment" } },
        { taskId: "2.1", role: { kind: "implementation" } },
        { taskId: "2.2", role: { kind: "verification", scope: "segment" } },
        { taskId: "3.1", role: { kind: "verification", scope: "work-unit" } },
      ]);
  });
});
