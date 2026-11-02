/** Session-init probe-reference contract for passive delivery-position narration. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const PROBE_REFERENCES = [
  join(
    ROOT,
    "packages",
    "arc-framework",
    "arc",
    "system",
    "workflows",
    "arc",
    "session-lifecycle",
    "session-init",
    "probe-envelope.md",
  ),
  join(
    ROOT,
    ".arc",
    "system",
    "workflows",
    "arc",
    "session-lifecycle",
    "session-init",
    "probe-envelope.md",
  ),
];

describe("session-init delivery-position probe reference", () => {
  it("keeps the package and installed probe reference byte-identical", async () => {
    const [packageReference, installedReference] = await Promise.all(
      PROBE_REFERENCES.map((path) => readFile(path, "utf8")),
    );

    expect(installedReference).toBe(packageReference);
    expect(packageReference).toContain("| `deliveryPosition`");
    expect(packageReference).toMatch(softWrappedProse("It never mutates state, fetches objects, updates refs, or prompts"));
  });
});
