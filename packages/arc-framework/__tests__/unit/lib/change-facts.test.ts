import { describe, expect, it } from "vitest";

import {
  affectedPaths,
  classifyPlanningLane,
  parseRawDiff,
  resolveChangeSet,
  type ChangeSet,
} from "../../../src/lib/change-facts.js";

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

describe("classifyPlanningLane", () => {
  const change = (
    path: string,
    overrides: Record<string, string> = {},
  ) => ({
    status: "modified" as const,
    path,
    oldMode: "100644",
    newMode: "100644",
    ...overrides,
  });

  it("accepts the complete planning-artifact family and exact readiness view", () => {
    const paths = [
      ".arc/active/draft-example.md",
      ".arc/active/research-example.md",
      ".arc/backlog/planned/nested/analysis-example.md",
      ".arc/backlog/planned/nested/spec-example.md",
      ".arc/backlog/ROADMAP.md",
      ".arc/system/.internal/transitions/example.json",
    ];
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: paths.map((path) => change(path)),
    })).toBe("planning");
  });

  it.each([
    ".arc/active/spec-example.md.bak",
    ".arc/active/nested/spec-example.md",
    ".arc/backlog/spec-example.md",
    ".arc/backlog/planned/spec-example.md",
    ".arc/backlog/planned/one/two/three/spec-example.md",
    ".arc/backlog/planned/example/spec-example",
    ".arc/backlog/planned/example/spec-.md",
  ])("rejects planning-like path outside the complete artifact grammar: %s", (path) => {
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [change(path)],
    })).toBe("reviewed");
  });

  it.each([
    ".arc/system/.internal/transitions/",
    ".arc/system/.internal/transitions/origin.txt",
    ".arc/system/.internal/transitions/Not-Valid.json",
    ".arc/system/.internal/transitions/nested/origin.json",
    ".arc/system/.internal/githooks/pre-commit",
    ".arc/system/.internal/scripts/check.sh",
    ".arc/system/.internal/skills/arc-session/SKILL.md",
    ".arc/system/.internal/other/origin.json",
  ])("rejects adjacent internal content outside an exact transition leaf: %s", (path) => {
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [change(path)],
    })).toBe("reviewed");
  });

  it("fails reviewed for mixed, code, workflow, and unknown changes", () => {
    const candidates: ChangeSet[] = [
      { changeSet: "unknown", changes: [] },
      { changeSet: "known", changes: [change(".arc/active/meta-example.md"), change("README.md")] },
      { changeSet: "known", changes: [change("packages/arc-framework/src/cli.ts")] },
      { changeSet: "known", changes: [change(".github/workflows/ci.yml")] },
    ];
    for (const candidate of candidates) {
      expect(classifyPlanningLane(candidate)).toBe("reviewed");
    }
  });

  it("requires both rename and copy endpoints to remain planning artifacts", () => {
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [{
        ...change(".arc/active/spec-new.md"),
        status: "renamed",
        previousPath: ".arc/active/spec-old.md",
      }],
    })).toBe("planning");
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [{
        ...change(".arc/active/spec-copy.md"),
        status: "copied",
        previousPath: "docs/source.md",
      }],
    })).toBe("reviewed");
  });

  it("fails reviewed for mode and type changes even on planning paths", () => {
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [change(".arc/active/meta-example.md", { newMode: "100755" })],
    })).toBe("reviewed");
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [{
        ...change(".arc/active/meta-example.md", { newMode: "120000" }),
        status: "type-changed",
      }],
    })).toBe("reviewed");
  });

  it("keeps transition rename endpoints and non-regular entries fail-closed", () => {
    const transition = ".arc/system/.internal/transitions/origin.json";
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [{
        ...change(transition),
        status: "renamed",
        previousPath: ".arc/system/.internal/scripts/origin.json",
      }],
    })).toBe("reviewed");
    expect(classifyPlanningLane({
      changeSet: "known",
      changes: [change(transition, { newMode: "100755" })],
    })).toBe("reviewed");
  });

  it("keeps the shared inbox in the reviewed lane", () => {
    const sharedInbox = {
      changeSet: "known" as const,
      changes: [change(".arc/backlog/ATOMIC-INBOX.md")],
    };

    expect(classifyPlanningLane(sharedInbox)).toBe("reviewed");
  });
});
