import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: spawnMock };
});

const { createUserIOContext } = await import("../../src/lib/io-context.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("createUserIOContext writeNote", () => {
  it("rejects with context when Git note stdin closes with EPIPE", async () => {
    const stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      },
    });
    const proc = Object.assign(new EventEmitter(), {
      stdin,
      stderr: new PassThrough(),
    });
    spawnMock.mockReturnValue(proc);

    await expect(
      createUserIOContext().writeNote("refs/notes/test", "content", "HEAD"),
    ).rejects.toThrow("git notes stdin write failed: write EPIPE");
  });
});
