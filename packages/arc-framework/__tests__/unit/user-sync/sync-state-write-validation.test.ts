/** Producer-boundary validation for local sync-state persistence. */

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LocalSyncStateSchema,
  writeLocalSyncState,
} from "../../../src/lib/user-sync/sync-state.js";
import type { CoreIO } from "../../../src/lib/types.js";

const identity = "andrew";
let root: string;
let statePath: string;

function realIo(): CoreIO {
  return {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    mkdir: (path) => mkdir(path, { recursive: true }),
    exec: vi.fn(async () => Promise.reject(new Error("unexpected git call"))),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-sync-state-write-"));
  statePath = join(root, ".arc", "user", identity, ".internal", ".sync-state.json");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("writeLocalSyncState", () => {
  it("rejects schema-invalid producer output before atomic persistence", async () => {
    await expect(
      writeLocalSyncState(root, realIo(), identity, "", "source", "save"),
    ).rejects.toThrow();
    expect(await exists(statePath)).toBe(false);
  });

  it("persists a valid record accepted by the strict producer schema", async () => {
    await writeLocalSyncState(root, realIo(), identity, "manifest", "source", "load", "verified", ["one"]);

    expect(LocalSyncStateSchema.parse(JSON.parse(await readFile(statePath, "utf8")))).toMatchObject({
      version: 4,
      materializedManifestHash: "manifest",
      sourceCommit: "source",
      sourceOperation: "load",
      verifiedAt: "verified",
      priorFileList: ["one"],
    });
  });
});
