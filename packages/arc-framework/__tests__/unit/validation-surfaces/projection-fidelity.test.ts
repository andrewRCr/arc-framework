/** Independent runtime and JSON Schema acceptance parity for registered roots. */

import { Ajv2020, type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { type z } from "zod";

import { MetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import { ArcConfigSchema } from "../../../src/lib/config/schema.js";
import { AuditEntrySchema } from "../../../src/lib/release/schema.js";
import { PersistedLocalSyncStateSchema } from "../../../src/lib/user-sync/schema.js";
import {
  VALIDATION_SURFACE_SCHEMA_IDS,
  createValidationSurfacesRegistry,
} from "../../../src/lib/validation-surfaces/registry.js";

interface CorpusCase {
  readonly label: string;
  readonly value: unknown;
  readonly accepted: boolean;
}

function projectedValidators(): ReadonlyMap<string, ValidateFunction> {
  const bundle = createValidationSurfacesRegistry().toJSONSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of Object.values(bundle.schemas)) ajv.addSchema(schema as AnySchema);
  return new Map(Object.keys(bundle.schemas).map((id) => {
    const validator = ajv.getSchema(`${id}.schema.json`);
    if (validator === undefined) throw new Error(`Missing projected validator: ${id}`);
    return [id, validator];
  }));
}

const validators = projectedValidators();

function assertAcceptanceParity(id: string, schema: z.ZodType, corpus: readonly CorpusCase[]): void {
  const projected = validators.get(id);
  if (projected === undefined) throw new Error(`Missing validator: ${id}`);
  for (const example of corpus) {
    const runtimeAccepted = schema.safeParse(example.value).success;
    const projectedAccepted = projected(example.value) as boolean;
    expect(runtimeAccepted, `${example.label}: runtime`).toBe(example.accepted);
    expect(projectedAccepted, `${example.label}: projected ${JSON.stringify(projected.errors)}`).toBe(
      example.accepted,
    );
  }
}

const commitInterlocks = {
  command: "release-commit",
  commitInterlock: { value: "on-workflow", source: "git-config" },
  pushInterlock: { value: "on-workflow", source: "git-config" },
} as const;

const auditBase = {
  schemaVersion: 2,
  timestamp: "2026-07-21T00:00:00.000Z",
  command: "release-commit",
  args: [],
  wu: null,
  interlockState: commitInterlocks,
} as const;

const metaRecord = {
  state: "Active",
  owner: "andrew",
  branch: "feat/cli-validation-surfaces",
  workClass: "Heavy",
  priority: "P2",
  cohort: "cli-substrate-adoption",
  dependsOn: [],
  origin: "internal",
  design: ["spec-cli-validation-surfaces.md"],
  taskList: "tasks-cli-validation-surfaces.md",
  reviewRubric: null,
  currentWorkflow: null,
  lastCompleted: null,
  nextTask: "Task 6.2.a",
  blockers: null,
  nextAction: "Begin Task 6.2.a",
  prUrl: null,
  completed: null,
} as const;

const syncBase = {
  materializedManifestHash: "manifest",
  sourceCommit: "commit",
  sourceOperation: "save",
} as const;

describe("validation-surface projection fidelity", () => {
  it("matches audit-entry runtime acceptance", () => {
    assertAcceptanceParity(VALIDATION_SURFACE_SCHEMA_IDS.auditEntry, AuditEntrySchema, [
      {
        label: "proceeded commit",
        value: {
          ...auditBase,
          decision: "proceeded",
          refusalCode: null,
          outcome: { kind: "commit", hash: "abc123" },
        },
        accepted: true,
      },
      {
        label: "refused commit",
        value: {
          ...auditBase,
          decision: "refused",
          refusalCode: 10,
          outcome: { kind: "refused" },
        },
        accepted: true,
      },
      {
        label: "decision and refusal mismatch",
        value: {
          ...auditBase,
          decision: "proceeded",
          refusalCode: 10,
          outcome: { kind: "commit", hash: "abc123" },
        },
        accepted: false,
      },
      {
        label: "command and outcome mismatch",
        value: {
          ...auditBase,
          decision: "proceeded",
          refusalCode: null,
          outcome: { kind: "push", refStatus: "fast-forward" },
        },
        accepted: false,
      },
    ]);
  });

  it("matches semantic meta-record runtime acceptance", () => {
    assertAcceptanceParity(VALIDATION_SURFACE_SCHEMA_IDS.metaRecord, MetaRecordSchema, [
      { label: "complete record", value: metaRecord, accepted: true },
      { label: "missing owner", value: { ...metaRecord, owner: undefined }, accepted: false },
      { label: "extra field", value: { ...metaRecord, extra: true }, accepted: false },
      { label: "invalid state", value: { ...metaRecord, state: "Paused" }, accepted: false },
    ]);
  });

  it("matches authorable config runtime acceptance", () => {
    assertAcceptanceParity(VALIDATION_SURFACE_SCHEMA_IDS.arcConfig, ArcConfigSchema, [
      { label: "known key", value: { "branch.protection": "full" }, accepted: true },
      { label: "unknown dotted key", value: { "future.setting": "value" }, accepted: true },
      {
        label: "compatible review sources",
        value: {
          "review.frontline_sources": "[coderabbit-cli, project-reviewer]",
          "review.standard_sources": "[coderabbit-pr, codex-pr, delegated-agent]",
        },
        accepted: true,
      },
      { label: "invalid known value", value: { "branch.protection": "sometimes" }, accepted: false },
      {
        label: "frontline-incompatible source",
        value: { "review.frontline_sources": "[coderabbit-pr]" },
        accepted: false,
      },
      {
        label: "standard-incompatible source",
        value: { "review.standard_sources": "[project-reviewer]" },
        accepted: false,
      },
      {
        label: "standard source without list syntax",
        value: { "review.standard_sources": "coderabbit-pr" },
        accepted: false,
      },
      {
        label: "quoted-empty standard sources",
        value: { "review.standard_sources": "" },
        accepted: false,
      },
      {
        label: "safe-integer midrange",
        value: {
          "hooks.body_max_lines": "9000000000000000",
          "review.chunking_threshold_lines": "9007199254740989",
        },
        accepted: true,
      },
      {
        label: "unsafe integer above maximum",
        value: { "review.chunking_threshold_lines": "9007199254740992" },
        accepted: false,
      },
      {
        label: "integer below field minimum",
        value: { "hooks.subject_max_length": "9" },
        accepted: false,
      },
      { label: "malformed key", value: { "Future-setting": "value" }, accepted: false },
      { label: "non-string unknown value", value: { "future.setting": 1 }, accepted: false },
    ]);
  });

  it("matches persisted sync-state runtime acceptance", () => {
    assertAcceptanceParity(VALIDATION_SURFACE_SCHEMA_IDS.localSyncState, PersistedLocalSyncStateSchema, [
      ...[2, 3, 4].map((version) => ({
        label: `version ${String(version)}`,
        value: { version, ...syncBase },
        accepted: true,
      })),
      {
        label: "malformed required field",
        value: { version: 4, ...syncBase, sourceCommit: "" },
        accepted: false,
      },
      {
        label: "malformed optional extension remains tolerated",
        value: { version: 4, ...syncBase, partialPush: "legacy" },
        accepted: true,
      },
      {
        label: "unknown additive field",
        value: { version: 4, ...syncBase, future: { retained: true } },
        accepted: true,
      },
    ]);
  });
});
