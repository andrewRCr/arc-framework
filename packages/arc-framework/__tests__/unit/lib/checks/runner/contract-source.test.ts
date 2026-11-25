/** Source wire contracts preserve exact portable presentation metadata. */
import { expect, it } from "vitest";
import { SourceManifestSchema } from "../../../../../src/lib/checks/runner/contract.js";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

const digest = `sha256:${"a".repeat(64)}`;

it.each([40, 64])("preserves a manifest and %s-character code coordinates", length => {
  const objectId = "1".repeat(length);
  const paths = ["Z.ts", "a\\name.ts", "e\u0301.ts", "é.ts", "\uE000.ts", "\u{10000}.ts"];
  const manifest = { version: 1, coordinates: { tree: objectId, head: objectId, base: objectId, merged: [objectId] },
    entries: [...paths.map(path => ({ path, kind: "file", mode: 0o755, digest, bytes: 0 })),
      { path: "\u{10001}.link", kind: "symlink", target: "é.ts" }] };
  expect(assertSchemaAccepts(SourceManifestSchema, manifest)).toEqual(manifest);
});

const file = { path: "a.ts", kind: "file", mode: 0o644, digest, bytes: 1 };
function manifest(entries: unknown[] = [file], fields: Record<string, unknown> = {}) {
  return { version: 1, coordinates: { tree: "1".repeat(40), merged: [] }, entries, ...fields };
}

it.each(["", "/a", "a//b", "a/./b", "a/../b", ".git/config", "src/.git/config", "bad\0name", "bad\uD800"])(
  "refuses an unrepresentable or metadata path %j", path => {
    assertSchemaRefuses(SourceManifestSchema, manifest([{ ...file, path }]));
  },
);

it.each(["", "bad\0link", "bad\uDFFF"])("refuses unrepresentable symlink target %j", target => {
  assertSchemaRefuses(SourceManifestSchema, manifest([{ path: "link", kind: "symlink", target }]));
});

it.each([-1, 0.5, 0o100000])("refuses a non-permission mode %j", mode => {
  assertSchemaRefuses(SourceManifestSchema, manifest([{ ...file, mode }]));
});

it.each([-1, 0.5, 2 ** 53])("refuses an inexact or negative byte count %j", bytes => {
  assertSchemaRefuses(SourceManifestSchema, manifest([{ ...file, bytes }]));
});

it.each(["short", `sha256:${"A".repeat(64)}`, `sha1:${"a".repeat(40)}`])("refuses a noncanonical byte digest %j", digest => {
  assertSchemaRefuses(SourceManifestSchema, manifest([{ ...file, digest }]));
});

it.each(["", "1".repeat(39), "A".repeat(40)])("refuses invalid code coordinates %j", tree => {
  assertSchemaRefuses(SourceManifestSchema, manifest([], { coordinates: { tree, merged: [] } }));
});

it("requires unique paths", () => {
  assertSchemaRefuses(SourceManifestSchema, manifest([file, file]));
});

it("requires paths sorted by UTF-8 bytes rather than UTF-16 units", () => {
  assertSchemaRefuses(SourceManifestSchema, manifest([{ ...file, path: "\u{10000}.ts" }, { ...file, path: "\uE000.ts" }]));
});

it.each([
  manifest([], { version: 2 }),
  manifest([], { testCounts: 3 }),
  manifest([{ ...file, reportPath: "report.json" }]),
  manifest([], { coordinates: { tree: "1".repeat(40), merged: [], worker: "host" } }),
])("refuses a different version or extra wire fields: %j", input => {
  assertSchemaRefuses(SourceManifestSchema, input);
});

it("preserves an empty manifest with omitted unborn HEAD and optional base", () => {
  const manifest = { version: 1, coordinates: { tree: "1".repeat(40), merged: [] }, entries: [] };
  expect(assertSchemaAccepts(SourceManifestSchema, manifest)).toEqual(manifest);
});
