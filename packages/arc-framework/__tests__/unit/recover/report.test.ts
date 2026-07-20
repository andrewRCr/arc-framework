/** Runtime contract coverage for complete recovery-audit reports. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RecoverAuditReportSchema } from "../../../src/lib/recover/report.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "fixtures", "session-envelope");

function report(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `recovery-audit-${name}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}

function earlyStop(): Record<string, unknown> {
  return {
    mode: "recover-audit",
    seedPath: null,
    seed: null,
    recover: null,
    verdict: {
      status: "stop",
      ready: false,
      stopReasons: [{ kind: "identity-missing", message: "missing" }],
      explainedDrift: [],
      loadSetAudit: null,
      locus: null,
      dirtyFiles: {
        expected: [],
        actual: [],
        pathSetMatch: false,
        dirtyStateConsistent: null,
        match: false,
        explainedByCommittedProgress: false,
      },
      taskCursor: null,
    },
  };
}

describe("recovery-audit report schema", () => {
  it.each(["ready", "dirty-path-drift"])("accepts the %s characterization fixture", (name) => {
    const value = report(name);
    expect(RecoverAuditReportSchema.parse(value)).toEqual(value);
  });

  it("accepts a valid early-stop report with no seed or recovery envelope", () => {
    expect(RecoverAuditReportSchema.parse(earlyStop())).toEqual(earlyStop());
  });

  it("rejects undeclared root keys and malformed seed summaries", () => {
    expect(RecoverAuditReportSchema.safeParse({ ...earlyStop(), undeclared: true }).success).toBe(false);
    expect(RecoverAuditReportSchema.safeParse({
      ...report("ready"),
      seed: { ...(report("ready").seed as object), schemaVersion: 2 },
    }).success).toBe(false);
  });

  it("rejects ready reports without complete live state", () => {
    expect(RecoverAuditReportSchema.safeParse({ ...report("ready"), recover: null }).success).toBe(false);
    expect(RecoverAuditReportSchema.safeParse({ ...report("ready"), seed: null }).success).toBe(false);
    expect(RecoverAuditReportSchema.safeParse({ ...report("ready"), seedPath: null }).success).toBe(false);
  });

  it("rejects contradictory early and progressed report state", () => {
    expect(RecoverAuditReportSchema.safeParse({ ...earlyStop(), recover: report("ready").recover }).success)
      .toBe(false);
    expect(RecoverAuditReportSchema.safeParse({ ...earlyStop(), seed: report("ready").seed }).success)
      .toBe(false);
  });
});
