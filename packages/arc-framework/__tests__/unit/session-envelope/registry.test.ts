/** Unit coverage for session-envelope schema registry composition. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SchemaError } from "../../../src/lib/kernel/index.js";
import {
  SESSION_ENVELOPE_SCHEMA_IDS,
  createSessionEnvelopeRegistry,
} from "../../../src/lib/session-envelope/registry.js";
import { LoadSetManifestSchema } from "../../../src/lib/load-set/types.js";
import { CompactionSeedSchema } from "../../../src/lib/compaction-seed/schema.js";
import { TaskListCursorSchema } from "../../../src/lib/task-list/cursor.js";
import { TaskListCursorFileResultSchema } from "../../../src/lib/task-list/file-cursor.js";

describe("session-envelope schema registry", () => {
  it("composes fresh kernel registries with the shared family records", () => {
    const first = createSessionEnvelopeRegistry();
    const second = createSessionEnvelopeRegistry();

    expect(first.ids()).toEqual([
      "compaction-seed",
      "load-set-manifest",
      "priority",
      "slug",
      "task-list-cursor",
      "task-list-cursor-file-result",
      "work-class",
      "work-unit-state",
    ]);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest)).toBe(LoadSetManifestSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.taskListCursor)).toBe(TaskListCursorSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.taskListCursorFileResult))
      .toBe(TaskListCursorFileResultSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.compactionSeed)).toBe(CompactionSeedSchema);

    first.register(z.boolean(), {
      id: "fixture-extension",
      version: 1,
      migrationPosture: "strict-current",
    });
    expect(second.get("fixture-extension")).toBeUndefined();
  });

  it("registers every family root at version 1 with strict-current posture", () => {
    const registry = createSessionEnvelopeRegistry();
    for (const id of Object.values(SESSION_ENVELOPE_SCHEMA_IDS)) {
      expect(registry.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
    }
  });

  it("retains kernel duplicate protection", () => {
    const registry = createSessionEnvelopeRegistry();
    expect(() => registry.register(z.string(), {
      id: SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest,
      version: 1,
      migrationPosture: "strict-current",
    })).toThrow(SchemaError);
  });
});
