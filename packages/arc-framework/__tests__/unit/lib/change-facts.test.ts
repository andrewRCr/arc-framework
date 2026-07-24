import { describe, expect, it } from "vitest";

import { affectedPaths, parseRawDiff, resolveChangeSet } from "../../../src/lib/change-facts.js";

const HASH = "a".repeat(40);
const ZERO_HASH = "0".repeat(40);
const COMPLETE_RENAME = `R${100}`;

function raw(...fields: string[]): Uint8Array {
  return new TextEncoder().encode(`${fields.join("\0")}\0`);
}

describe("parseRawDiff", () => {
  it("parses an added path without losing its modes", () => {
    expect(parseRawDiff(raw(`:000000 100644 ${ZERO_HASH} ${HASH} A`, "new file.ts"))).toEqual({
      changeSet: "known",
      changes: [
        {
          status: "added",
          path: "new file.ts",
          oldMode: "000000",
          newMode: "100644",
        },
      ],
    });
  });

  it.each([
    ["M", "modified", "100644", "100755", HASH, HASH],
    ["D", "deleted", "100644", "000000", HASH, ZERO_HASH],
    ["T", "type-changed", "100644", "120000", HASH, HASH],
  ] as const)(
    "maps %s to the canonical %s status",
    (rawStatus, status, oldMode, newMode, oldObject, newObject) => {
      expect(
        parseRawDiff(raw(`:${oldMode} ${newMode} ${oldObject} ${newObject} ${rawStatus}`, "path")),
      ).toEqual({
        changeSet: "known",
        changes: [{ status, path: "path", oldMode, newMode }],
      });
    },
  );

  it.each([
    [COMPLETE_RENAME, "renamed"],
    ["C075", "copied"],
  ] as const)("preserves both endpoints for %s records", (rawStatus, status) => {
    expect(
      parseRawDiff(
        raw(`:100644 100755 ${HASH} ${HASH} ${rawStatus}`, "old name.ts", "new name.ts"),
      ),
    ).toEqual({
      changeSet: "known",
      changes: [
        {
          status,
          path: "new name.ts",
          previousPath: "old name.ts",
          oldMode: "100644",
          newMode: "100755",
        },
      ],
    });
  });

  it("parses multiple NUL-framed records without path loss", () => {
    expect(
      parseRawDiff(
        raw(
          `:000000 100644 ${ZERO_HASH} ${HASH} A`,
          "line\nname.ts",
          `:100644 100644 ${HASH} ${HASH} ${COMPLETE_RENAME}`,
          "old\tname.ts",
          "new\tname.ts",
        ),
      ),
    ).toEqual({
      changeSet: "known",
      changes: [
        {
          status: "added",
          path: "line\nname.ts",
          oldMode: "000000",
          newMode: "100644",
        },
        {
          status: "renamed",
          path: "new\tname.ts",
          previousPath: "old\tname.ts",
          oldMode: "100644",
          newMode: "100644",
        },
      ],
    });
  });

  it.each([
    ["empty input", new Uint8Array()],
    ["missing trailing NUL", new TextEncoder().encode(`:100644 100644 ${HASH} ${HASH} M\0path`)],
    ["unsupported status", raw(`:100644 100644 ${HASH} ${HASH} U`, "path")],
    [
      "missing rename destination",
      raw(`:100644 100644 ${HASH} ${HASH} ${COMPLETE_RENAME}`, "old"),
    ],
    ["invalid similarity score", raw(`:100644 100644 ${HASH} ${HASH} C101`, "old", "new")],
    ["invalid object width", raw(":100644 100644 a b M", "path")],
    [
      "mixed object widths",
      raw(`:100644 100644 ${HASH} ${HASH} M`, "one", `:100644 100644 ${"b".repeat(64)} ${"c".repeat(64)} M`, "two"),
    ],
    ["malformed header", raw("not-a-header", "path")],
  ])("fails closed for %s", (_label, input) => {
    expect(parseRawDiff(input)).toEqual({ changeSet: "unknown", changes: [] });
  });

  it("fails closed instead of replacing an invalid UTF-8 path", () => {
    const header = new TextEncoder().encode(`:100644 100644 ${HASH} ${HASH} M\0`);
    const invalidPath = Uint8Array.from([0x66, 0x80, 0x6f, 0x00]);
    const input = new Uint8Array(header.length + invalidPath.length);
    input.set(header);
    input.set(invalidPath, header.length);

    expect(parseRawDiff(input)).toEqual({ changeSet: "unknown", changes: [] });
  });
});

describe("resolveChangeSet", () => {
  it("resolves explicit base and head coordinates through the raw Git port", async () => {
    const output = raw(`:000000 100644 ${ZERO_HASH} ${HASH} A`, "new.ts");
    const calls: string[][] = [];

    const result = await resolveChangeSet(async (args) => {
      calls.push(args);
      return { stdout: output };
    }, "base-ref", "head-ref");

    expect(result).toEqual({
      changeSet: "known",
      changes: [
        {
          status: "added",
          path: "new.ts",
          oldMode: "000000",
          newMode: "100644",
        },
      ],
    });
    expect(calls).toEqual([
      [
        "diff",
        "--raw",
        "-z",
        "--no-abbrev",
        "-M",
        "-C",
        "--find-copies-harder",
        "base-ref",
        "head-ref",
        "--",
      ],
    ]);
  });

  it.each([
    ["Git rejects the coordinates", async () => Promise.reject(new Error("missing ref"))],
    ["Git returns malformed bytes", async () => ({ stdout: new TextEncoder().encode("not raw") })],
  ])("returns unknown when %s", async (_label, exec) => {
    await expect(resolveChangeSet(exec, "base", "head")).resolves.toEqual({
      changeSet: "unknown",
      changes: [],
    });
  });

  it("rejects option-shaped coordinates before invoking Git", async () => {
    let invoked = false;
    const result = await resolveChangeSet(async () => {
      invoked = true;
      return { stdout: new Uint8Array() };
    }, "base", "--output=payload");

    expect(result).toEqual({ changeSet: "unknown", changes: [] });
    expect(invoked).toBe(false);
  });
});

describe("affectedPaths", () => {
  it("returns a stable union of single-path and dual-endpoint records", () => {
    expect(affectedPaths([
      { path: "modified" },
      { path: "deleted" },
      {
        previousPath: "rename-source",
        path: "rename-target",
      },
      {
        previousPath: "copy-source",
        path: "copy-target",
      },
      { path: "modified" },
    ])).toEqual([
      "modified",
      "deleted",
      "rename-source",
      "rename-target",
      "copy-source",
      "copy-target",
    ]);
  });
});
