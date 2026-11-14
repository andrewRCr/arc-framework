/** Typed session-phase authority in handoff and notes authoring surfaces. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("session authority documentation", () => {
  it("uses an exact local branch ref and treats Next Action as a human pointer", async () => {
    for (const path of [
      resolve(ROOT, "packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md"),
      resolve(ROOT, ".arc/system/workflows/arc/session-lifecycle/session-handoff.md"),
    ]) {
      const content = await readFile(path, "utf8");
      expect(content).toContain('git rev-parse --verify "refs/heads/<branch>^{commit}"');
      expect(content).not.toContain('git rev-parse "<branch>^{commit}"');
      expect(content).toMatch(softWrappedProse("This is a human resume pointer; typed status determines session phase"));
      expect(content).not.toMatch(softWrappedProse("session-init's sessionType inference key on this prefix"));
    }
  });

  it("limits session type overrides to discretionary planning and execution", async () => {
    const [template, handoff] = await Promise.all([
      readFile(resolve(ROOT, "packages/arc-framework/templates/user/SESSION-NOTES.md"), "utf8"),
      readFile(
        resolve(ROOT, "packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md"),
        "utf8",
      ),
    ]);

    expect(template).toContain("**Session Type:** {planning | execution}");
    expect(handoff).toContain("**Session Type** (`sessionType`, optional) — `planning | execution`");
    for (const content of [template, handoff]) {
      expect(content).toContain("prepublication/integration phases cannot be overridden");
      expect(content).not.toContain("planning | execution | integration");
    }
  });

  it("writes the handoff through the store rather than a meta commit and session notes", async () => {
    for (const path of [
      resolve(ROOT, "packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-handoff.template.md"),
      resolve(ROOT, ".arc/system/workflows/arc/session-lifecycle/session-handoff.md"),
    ]) {
      const content = await readFile(path, "utf8");
      expect(content).toContain("arc handoff write -");
      expect(content).toMatch(softWrappedProse("The verb records `State at Handoff` and `Commit at Handoff` itself."));
      expect(content).toContain("### Remaining Work Before Returning to Task List");
      expect(content).toContain("arc handover <slug> --to <identity>");
      expect(content).not.toMatch(/SESSION-NOTES|chore\(arc\): handoff|arc user (save|status)|notesDriftSurface|retryOffer/u);
    }
  });
});
