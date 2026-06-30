import { describe, expect, it } from "vitest";

import {
  LOAD_SET_MANIFEST_VERSION,
  type LoadSetManifest,
  type LoadSetManifestVersion,
} from "../../../src/lib/load-set/types.js";

describe("LoadSetManifest", () => {
  it("pins the manifest vocabulary to schema version 1", () => {
    const version: LoadSetManifestVersion = 1;

    expect(version).toBe(LOAD_SET_MANIFEST_VERSION);
  });

  it("accepts the session-init read disciplines in ordered entries", () => {
    const manifest = {
      manifestVersion: LOAD_SET_MANIFEST_VERSION,
      entries: [
        {
          path: "context/full-document.md",
          readMode: { kind: "full" },
        },
        {
          path: "context/sectioned-document.md",
          readMode: {
            kind: "partial-section",
            heading: "Environment & Path Context",
          },
        },
        {
          path: "context/task-list.md",
          readMode: { kind: "partial-strategic" },
        },
      ],
    } satisfies LoadSetManifest;

    expect(manifest.manifestVersion).toBe(LOAD_SET_MANIFEST_VERSION);
    expect(manifest.entries.map((entry) => entry.readMode.kind)).toEqual([
      "full",
      "partial-section",
      "partial-strategic",
    ]);
  });
});
