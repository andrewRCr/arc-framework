import { describe, expect, it, vi } from "vitest";

import { readObjectAvailability } from "../../../src/lib/git/object-availability.js";
import type { GitExecInput } from "../../../src/lib/git/exec.js";

const oid = (seed: string): string => seed.padEnd(40, "0");

describe("readObjectAvailability", () => {
  it("rejects invalid object ids without invoking Git", async () => {
    const execInput: GitExecInput = vi.fn(async () => "");
    await expect(readObjectAvailability({ execInput, oids: ["a".repeat(41)] })).resolves.toEqual({
      kind: "unavailable",
      reason: "malformed",
    });
    expect(execInput).not.toHaveBeenCalled();
  });

  it("returns an empty complete map without invoking Git", async () => {
    const execInput: GitExecInput = vi.fn(async () => "");
    await expect(readObjectAvailability({ execInput, oids: [] })).resolves.toEqual({
      kind: "complete",
      commits: {},
    });
    expect(execInput).not.toHaveBeenCalled();
  });

  it("reports a locally available commit by advertised object id", async () => {
    const commit = oid("a1");
    const execInput: GitExecInput = vi.fn(async () => `${commit} commit 123\n`);

    await expect(readObjectAvailability({ execInput, oids: [commit] })).resolves.toEqual({
      kind: "complete",
      commits: { [commit]: true },
    });
  });

  it("reports missing and non-commit objects as complete negative facts", async () => {
    const missing = oid("b2");
    const blob = oid("c3");
    const execInput: GitExecInput = vi.fn(async () => [
      `${missing} missing`,
      `${blob} blob 42`,
      "",
    ].join("\n"));

    await expect(readObjectAvailability({ execInput, oids: [missing, blob] })).resolves.toEqual({
      kind: "complete",
      commits: { [missing]: false, [blob]: false },
    });
  });

  it("deduplicates advertised ids before issuing one ordered batch", async () => {
    const first = oid("d4");
    const second = oid("e5");
    const execInput: GitExecInput = vi.fn(async (_args, input) => {
      if (input !== `${first}\n${second}\n`) throw new Error("batch was not stably deduplicated");
      return `${first} commit 1\n${second} missing\n`;
    });

    await expect(readObjectAvailability({
      execInput,
      oids: [first, second, first],
    })).resolves.toEqual({
      kind: "complete",
      commits: { [first]: true, [second]: false },
    });
  });

  it.each([
    ["reordered", (first: string, second: string) => `${second} missing\n${first} commit 1\n`],
    ["truncated", (first: string) => `${first} commit 1\n`],
    ["malformed", (first: string, second: string) => `${first} commit 1\n${second} mystery 2\n`],
  ])("rejects %s batch output", async (_label, output) => {
    const first = oid("f6");
    const second = oid("a7");
    const execInput: GitExecInput = vi.fn(async () => output(first, second));

    await expect(readObjectAvailability({ execInput, oids: [first, second] })).resolves.toEqual({
      kind: "unavailable",
      reason: "malformed",
    });
  });

  it("keeps execution failures distinct from malformed output", async () => {
    const execInput: GitExecInput = vi.fn(async () => {
      throw new Error("git unavailable");
    });

    await expect(readObjectAvailability({ execInput, oids: [oid("b8")] })).resolves.toEqual({
      kind: "unavailable",
      reason: "execution",
    });
  });

  it("completes one local-only stdin batch and refuses every other Git process", async () => {
    const commit = oid("c9");
    let processCount = 0;
    const execInput: GitExecInput = async (args, input, options) => {
      processCount += 1;
      if (
        args.join(" ") !== "cat-file --batch-check"
        || input !== `${commit}\n`
        || options?.objectAccess !== "local-only"
      ) {
        throw new Error("unexpected or materializing Git process");
      }
      return `${commit} commit 1\n`;
    };

    await expect(readObjectAvailability({ execInput, oids: [commit] })).resolves.toEqual({
      kind: "complete",
      commits: { [commit]: true },
    });
    expect(processCount).toBe(1);
  });
});
