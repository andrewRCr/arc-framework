/** Session-init workflow contract for delivery-position narration. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOWS = [
  join(
    ROOT,
    "packages",
    "arc-framework",
    "arc",
    "system",
    "workflows",
    "arc",
    "session-lifecycle",
    "session-init.template.md",
  ),
  join(ROOT, ".arc", "system", "workflows", "arc", "session-lifecycle", "session-init.md"),
];
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

describe("session-init delivery-position workflow", () => {
  it.each(WORKFLOWS)("renders only the CLI-precomposed line in %s", async (path) => {
    const content = await readFile(path, "utf8");

    expect(content).toContain("`deliveryPosition.value.line` verbatim exactly once");
    expect(content).toContain("Do not re-read delivery state or derive coordinates, counts,");
    expect(content).toContain("Omit an `ok + null` slot");
  });

  it("keeps the package and installed probe reference byte-identical", async () => {
    const [packageReference, installedReference] = await Promise.all(
      PROBE_REFERENCES.map((path) => readFile(path, "utf8")),
    );

    expect(installedReference).toBe(packageReference);
    expect(packageReference).toContain("| `deliveryPosition`");
    expect(packageReference).toContain("It never mutates state, fetches objects, updates refs, or prompts");
  });
});
