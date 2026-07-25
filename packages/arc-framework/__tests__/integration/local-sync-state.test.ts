/** Real-filesystem lifecycle coverage for normalized local sync state. */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readLocalSyncState,
  recordErrandPartialPushMarker,
  recordPartialPushMarker,
  writeLocalSyncState,
} from "../../src/lib/user-sync/sync-state.js";
import type { CoreIO } from "../../src/lib/types.js";

const identity = "andrew";
let root: string;
let preferredPath: string;
let legacyPath: string;

function realIo(): CoreIO {
  return {
    readFile: (path) => readFile(path, "utf8"),
    writeFile: (path, content) => writeFile(path, content, "utf8"),
    mkdir: (path) => mkdir(path, { recursive: true }),
    exec: vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        const hash = args[2]?.endsWith("/errands") ? "e" : "n";
        return { stdout: hash.repeat(40), stderr: "" };
      }
      throw new Error(`unexpected git arguments: ${args.join(" ")}`);
    }),
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-local-sync-state-integration-"));
  preferredPath = join(root, ".arc", "user", identity, ".internal", ".sync-state.json");
  legacyPath = join(root, ".arc", "user", identity, ".sync-state.json");
  await mkdir(join(root, ".arc", "user", identity), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local sync-state lifecycle", () => {
  it("hydrates a legacy record and rewrites save/load state at the preferred path", async () => {
    await writeFile(legacyPath, JSON.stringify({
      version: 2,
      materializedManifestHash: "legacy-manifest",
      sourceCommit: "legacy-source",
      sourceOperation: "save",
      priorFileList: ["legacy.md"],
      remoteMarkerProvenance: { legacy: { retained: true } },
    }));

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toMatchObject({
      version: 4,
      priorFileList: ["legacy.md"],
    });

    await writeLocalSyncState(root, realIo(), identity, "save-manifest", "save-source", "save");
    await writeLocalSyncState(
      root,
      realIo(),
      identity,
      "load-manifest",
      "load-source",
      "load",
      "verified",
      ["current.md"],
      null,
    );

    expect(JSON.parse(await readFile(preferredPath, "utf8"))).toMatchObject({
      version: 4,
      materializedManifestHash: "load-manifest",
      sourceCommit: "load-source",
      sourceOperation: "load",
      verifiedAt: "verified",
      priorFileList: ["current.md"],
      remoteMarkerProvenance: { legacy: { retained: true } },
    });
  });

  it("retains both marker families through concurrent compare-and-swap mutation", async () => {
    const io = realIo();
    await writeLocalSyncState(root, io, identity, "manifest", "source", "save", undefined, ["one.md"]);

    await Promise.all([
      recordPartialPushMarker(root, io, identity),
      recordErrandPartialPushMarker(root, io, identity),
    ]);

    await expect(readLocalSyncState(root, realIo(), identity)).resolves.toMatchObject({
      version: 4,
      priorFileList: ["one.md"],
      partialPush: { localRefHash: "n".repeat(40), sourceCommit: "source" },
      partialPushErrand: { localRefHash: "e".repeat(40), sourceCommit: "e".repeat(40) },
    });
  });
});
