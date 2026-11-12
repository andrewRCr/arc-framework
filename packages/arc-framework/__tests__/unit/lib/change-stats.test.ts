import { describe, expect, it, vi } from "vitest";

import {
  parseNumstat,
  resolveChangeStats,
} from "../../../src/lib/change-stats.js";
import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";

const bytes = (...parts: Array<string | number[]>): Uint8Array => {
  const encoder = new TextEncoder();
  const encoded = parts.map((part) => typeof part === "string" ? encoder.encode(part) : Uint8Array.from(part));
  const length = encoded.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of encoded) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

describe("parseNumstat", () => {
  it("counts text lines and logical files without decoding path bytes", () => {
    const result = parseNumstat(bytes("3\t4\t", [0xff, 0], "1\t2\tplain.ts\0"));
    expect(result).toEqual({ kind: "known", metrics: { lines: 10, files: 2 } });
  });

  it("counts rename/copy framing as one logical file", () => {
    const result = parseNumstat(bytes("3\t4\t\0old.ts\0new.ts\0"));
    expect(result).toEqual({ kind: "known", metrics: { lines: 7, files: 1 } });
  });

  it("counts binary records only toward files", () => {
    const result = parseNumstat(bytes("-\t-\tasset.bin\0"));
    expect(result).toEqual({ kind: "known", metrics: { lines: 0, files: 1 } });
  });

  it("treats empty output as known zero", () => {
    expect(parseNumstat(new Uint8Array())).toEqual({
      kind: "known",
      metrics: { lines: 0, files: 0 },
    });
  });

  it.each([
    ["unterminated record", bytes("1\t2\tpath")],
    ["mixed binary tokens", bytes("-\t2\tpath\0")],
    ["malformed rename", bytes("1\t2\t\0old\0")],
    ["empty ordinary path", bytes("1\t2\t\0")],
    ["unsafe numeric token", bytes("9007199254740992\t0\tpath\0")],
  ])("rejects %s", (_label, input) => {
    expect(parseNumstat(input)).toMatchObject({ kind: "unknown", reason: "malformed-output" });
  });

  it("rejects aggregate overflow", () => {
    expect(parseNumstat(bytes(
      "9007199254740991\t0\tfirst\0",
      "1\t0\tsecond\0",
    ))).toEqual({ kind: "unknown", reason: "unsafe-total" });
  });
});

describe("resolveChangeStats", () => {
  it("measures one validated exact range with canonical rename/copy flags", async () => {
    const exec = vi.fn(async () => ({ stdout: bytes("1\t2\tfile.ts\0") }));
    const result = await resolveChangeStats(exec, "a".repeat(40), "b".repeat(40));

    expect(result).toEqual({ kind: "known", metrics: { lines: 3, files: 1 } });
    expect(exec).toHaveBeenCalledWith([
      "diff",
      "--numstat",
      "-z",
      "-M",
      "-C",
      "--find-copies-harder",
      `${"a".repeat(40)}..${"b".repeat(40)}`,
      "--",
    ]);
  });

  it("returns explicit failure for invalid coordinates or Git rejection", async () => {
    const { exec } = scriptRawGitExec([{
      match: { prefix: ["diff", "--numstat"] },
      responses: [{ failure: { exitCode: 128, stderr: "missing object" } }],
    }]);
    await expect(resolveChangeStats(exec, "a".repeat(40), "b".repeat(40))).resolves.toEqual({
      kind: "unknown",
      reason: "git-failure",
    });
    await expect(resolveChangeStats(exec, "-bad", "b".repeat(40))).resolves.toEqual({
      kind: "unknown",
      reason: "invalid-range",
    });
  });
});
