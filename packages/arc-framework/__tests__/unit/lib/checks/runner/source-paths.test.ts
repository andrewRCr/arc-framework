/** Literal UTF-8 path framing refuses loss, traversal and administrative paths. */
import { expect, it } from "vitest";
import { decodeSourcePaths } from "../../../../../src/lib/checks/runner/source-paths.js";

it("preserves literal Unicode, BOM, newline and backslash names without normalization", () => {
  const paths = ["é", "e\u0301", "😀/name", "\ufeffname", "line\nname", "literal\\name"];
  expect(decodeSourcePaths(Buffer.from(`${paths.join("\0")}\0`))).toEqual(paths);
});
it("accepts an empty source listing", () => {
  expect(decodeSourcePaths(Buffer.alloc(0))).toEqual([]);
});

it.each([
  Buffer.from([0xff, 0]), Buffer.from([0xc3, 0]), Buffer.from("unterminated"), Buffer.from("\0"),
  Buffer.from("same\0same\0"), ...["/absolute", ".", "..", "a/../b", "a/./b", "a//b", ".git/config", "a/.git/config"]
    .map(path => Buffer.from(`${path}\0`)),
])("refuses unrepresentable raw paths %j", bytes => {
  expect(() => decodeSourcePaths(bytes)).toThrow();
});
