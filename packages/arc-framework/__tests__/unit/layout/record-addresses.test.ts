/** Semantic record addresses agree with the independent existing stores' path builders. */
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { ArcLayoutAddressSchema, resolveArcPath } from "../../../src/lib/layout/index.js";
import { resolveCandidateRecordRelativePath } from "../../../src/lib/work-unit/candidate-record-store.js";
import { resolveSubmissionBoundaryPath } from "../../../src/lib/work-unit/submission-boundary-store.js";
import { resolveTransitionRecordRelativePath, writeTransitionRecord, type TransitionRecordFs } from "../../../src/lib/work-unit/transition-record-store.js";
import { serializeTransitionRecord, type TransitionRecord } from "../../../src/lib/work-unit/transition-record.js";
import { join } from "node:path";

const slug = (name: string) => SlugSchema.parse(name);

describe("internal record addresses", () => {
  it.each(["sample", "renamed-work-item", "item-1"])("resolves Candidate records named %s as the existing store does", (name) => {
    expect(resolveArcPath({ kind: "candidate-record", slug: slug(name)})).toBe(resolveCandidateRecordRelativePath(name));
  });

  it.each(["sample", "renamed-work-item", "item-1"])("resolves integration boundary records named %s as the existing store does", (name) => {
    expect(resolveArcPath({ kind: "integration-boundary-record", slug: slug(name)})).toBe(resolveSubmissionBoundaryPath(name));
  });

  it.each(["decompose", "rename", "abandon"] as const)("resolves the actual persisted %s transition at its origin", async (kind) => {
    const record: TransitionRecord = { schemaVersion: 1, origin: "retired-origin", kind,
      successors: kind === "rename" ? ["renamed"] : kind === "decompose" ? ["child-one", "child-two"] : [],
      edges: kind === "decompose" ? [{ dependent: "dependent", disposition: { kind: "replace", replacementTargets: ["child-one"]}},
        { dependent: "other", disposition: { kind: "drop", reason: "No remaining prerequisite"}}] : []};
    const files = new Map<string, string>();
    const fs: TransitionRecordFs = { lstat: async() => ({ isDirectory: () => true, isSymbolicLink: () => false}),
      mkdir: async() => undefined, writeFile: async (path, content) => {files.set(path, content);}};
    await writeTransitionRecord("/repo", record, fs);
    const projected = resolveArcPath({ kind: "transition-record", origin: slug(record.origin)});
    expect(projected).toBe(resolveTransitionRecordRelativePath(record.origin));
    expect(files.get(join("/repo", projected))).toBe(serializeTransitionRecord(record));
  });
});

it.each([
  { kind: "candidate-record", slug: "../outside"},
  { kind: "integration-boundary-record", slug: "Uppercase"},
  { kind: "transition-record", origin: "nested/origin"},
  { kind: "inbox", scope: { kind: "identity", identity: "../../outside"}},
])("refuses an unsafe internal-record or identity coordinate: %j", (address) => {
  expect(ArcLayoutAddressSchema.safeParse(address).success).toBe(false);
});

describe("editor-document addresses", () => {
  it("resolves the CLI-owned document directory", () => {
    expect(resolveArcPath({ kind: "editor-document-root" })).toBe(".arc/system/.internal/schemas");
  });

  it.each(["slug", "review-resolve-request", "decompose-cut-map"])("resolves the document for %s", (name) => {
    expect(resolveArcPath({ kind: "editor-document", schema: slug(name) }))
      .toBe(`.arc/system/.internal/schemas/${name}.schema.json`);
  });

  it.each(["../outside", "Uppercase", "bad_slug"])("refuses an invalid schema coordinate: %s", (schema) => {
    const address = { kind: "editor-document", schema };
    expect(ArcLayoutAddressSchema.safeParse(address).success).toBe(false);
    expect(() => resolveArcPath(address as never)).toThrow(expect.objectContaining({ code: "layout.invalid-address" }));
  });
});
