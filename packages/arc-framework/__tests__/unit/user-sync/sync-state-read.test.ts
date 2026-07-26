/** Compatibility coverage for local sync-state path selection and hydration. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLocalSyncState } from "../../../src/lib/user-sync/sync-state.js";
import type { CoreIO } from "../../../src/lib/types.js";

const identity = "andrew";
let root: string;
let preferredPath: string;
let legacyPath: string;

const record = (sourceCommit: string, version: 2 | 3 | 4 = 4) => ({
  version,
  materializedManifestHash: "manifest",
  sourceCommit,
  sourceOperation: "save",
});

function realIo(): CoreIO {
  return {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    mkdir: (path) => mkdir(path, { recursive: true }),
    exec: vi.fn(async () => Promise.reject(new Error("unexpected git call"))),
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-sync-state-read-"));
  preferredPath = join(root, ".arc", "user", identity, ".internal", ".sync-state.json");
  legacyPath = join(root, ".arc", "user", identity, ".sync-state.json");
  await mkdir(join(root, ".arc", "user", identity, ".internal"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("readLocalSyncState", () => {
  it("prefers the internal path when both records are usable", async () => {
    await writeFile(preferredPath, JSON.stringify(record("preferred")));
    await writeFile(legacyPath, JSON.stringify(record("legacy")));

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toMatchObject({
      version: 4,
      sourceCommit: "preferred",
    });
  });

  it("falls through an absent preferred path to a usable legacy record", async () => {
    await writeFile(legacyPath, JSON.stringify(record("legacy", 2)));

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toMatchObject({
      version: 4,
      sourceCommit: "legacy",
    });
  });

  it("returns null for invalid JSON at the first readable path", async () => {
    await writeFile(preferredPath, "not json");
    await writeFile(legacyPath, JSON.stringify(record("legacy")));

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toBeNull();
  });

  it("falls through a structurally unusable preferred object", async () => {
    await writeFile(preferredPath, JSON.stringify({ version: 4, futureOnly: true }));
    await writeFile(legacyPath, JSON.stringify(record("legacy", 3)));

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toMatchObject({
      version: 4,
      sourceCommit: "legacy",
    });
  });

  it("returns null when both paths are absent", async () => {
    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toBeNull();
  });

  it("rethrows non-ENOENT reads without consulting the legacy path", async () => {
    const failure = Object.assign(new Error("EACCES"), { code: "EACCES" });
    const read = vi.fn(async (path: string) => {
      if (path === preferredPath) throw failure;
      return readFile(path, "utf8");
    });

    await expect(readLocalSyncState(root, { ...realIo(), readFile: read }, identity)).rejects.toThrow("EACCES");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
