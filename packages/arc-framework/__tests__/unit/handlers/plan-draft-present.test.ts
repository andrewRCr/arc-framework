/**
 * Unit tests for `resolveDraftPresent` — the draft-presence check backing
 * `arc plan check --name <slug>`. It sees both the flat `active/` draft (the
 * original path) and a backlog stub's draft (resolver-backed), so a `--plan`
 * grooming session against a `backlog/` stub reports its draft.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveDraftPresent } from "../../../src/handlers/plan.js";

describe("resolveDraftPresent", () => {
  let root: string;

  async function writeDraft(segments: string[], slug: string): Promise<void> {
    const dir = join(root, ".arc", ...segments);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `draft-${slug}.md`), "# draft\n", "utf8");
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-draft-present-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("detects a flat active/ draft", async () => {
    await writeDraft(["active"], "alpha");

    expect(await resolveDraftPresent(root, "alpha")).toBe(true);
  });

  it("detects a backlog stub's draft via the resolver", async () => {
    // A planned stub's draft, nested under its WU-dir — not the flat active/ path.
    const stubDir = join(root, ".arc", "backlog", "planned", "beta");
    await mkdir(stubDir, { recursive: true });
    await writeFile(join(stubDir, "meta-beta.md"), "# meta\n", "utf8");
    await writeDraft(["backlog", "planned", "beta"], "beta");

    expect(await resolveDraftPresent(root, "beta")).toBe(true);
  });

  it("returns false when unnamed or no draft exists anywhere", async () => {
    await writeDraft(["active"], "alpha");

    expect(await resolveDraftPresent(root, undefined)).toBe(false);
    expect(await resolveDraftPresent(root, "ghost")).toBe(false);
  });
});
