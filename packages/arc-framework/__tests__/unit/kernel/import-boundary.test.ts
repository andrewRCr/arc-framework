import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

describe("kernel import boundary", () => {
  it("exposes exactly the designed value and type surface from an explicit barrel", () => {
    const packageRoot = resolve(import.meta.dirname, "../../..");
    const indexPath = join(packageRoot, "src/lib/kernel/index.ts");
    const sourceFile = ts.createSourceFile(
      indexPath,
      readFileSync(indexPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const values: string[] = [];
    const types: string[] = [];

    for (const statement of sourceFile.statements) {
      expect(ts.isExportDeclaration(statement)).toBe(true);
      if (!ts.isExportDeclaration(statement)) continue;
      expect(statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)).toBe(true);
      if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        (statement.isTypeOnly || element.isTypeOnly ? types : values).push(element.name.text);
      }
    }

    expect(values.sort()).toEqual([
      "ArcError", "ArchiveQuarterSchema", "ArchiveSequenceSchema", "CanonicalDigestSchema", "LocusTokenSchema",
      "PrioritySchema", "RemoteEvidenceSchema", "RemoteFailureReasonSchema", "ResultAsync",
      "SLUG_PATTERN", "SchemaError", "SlugSchema",
      "WORK_UNIT_STATE_ORDER", "WorkClassSchema", "WorkUnitStateSchema", "assertCanonicalDigest", "assertNever",
      "canonicalDigest", "canonicalize", "createKernelRegistry", "createRegistry", "digestBytes", "err",
      "errAsync", "fromAsyncThrowable", "fromThrowable", "isCanonicalDigest", "isManagedPath", "isSlugSafe", "ok",
      "okAsync",
      "sortByCanonicalBytes", "toArcError", "validateClass", "validateManagedPath", "validatePriority",
      "validateState", "withRemoteEvidence",
    ].sort());
    expect(types.sort()).toEqual([
      "ArcErrorCode", "ArchiveQuarter", "ArchiveSequence", "CanonicalDigest", "KernelJSONSchema", "KernelJSONSchemaBundle", "KernelRegistry",
      "KernelSchemaMeta", "ManagedPath", "MigrationPosture", "Priority", "RemoteEvidence",
      "RemoteFailureReason", "Result", "SchemaErrorCode", "Slug", "WorkClass", "WorkUnitState",
    ].sort());
  });

});
