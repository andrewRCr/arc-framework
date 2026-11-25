/** Typed session-phase authority in handoff and notes authoring surfaces. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const ROOT = resolve(import.meta.dirname, "../../../..");
const arcRoots = ["packages/arc-framework/arc", ".arc"];

async function readHandoff(base: string): Promise<string> {
  const file = base === ".arc" ? "session-handoff.md" : "session-handoff.template.md";
  return readFile(resolve(ROOT, base, "system/workflows/arc/session-lifecycle", file), "utf8");
}

function section(document: string, heading: string): string {
  return document.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
}

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

  it("carries a blocker found only in the outgoing context into the second handoff", async () => {
    for (const base of arcRoots) {
      const content = section(await readHandoff(base), "Active-WU Handoff Format");
      expect(content).toMatch(/carry forward[\s\S]*still-applicable[\s\S]*outgoing Session Context/iu);
      const init = await readFile(resolve(ROOT, base, "system/workflows/arc/session-lifecycle/session-init.md"), "utf8");
      expect(init).toMatch(softWrappedProse("Include unresolved blockers from Session Context in the composed Blockers line"));
      expect(init).toMatch(softWrappedProse("no blocker in the composed Blockers line"));
    }
  });

  it("requires publication of the new Owner even if sync exits successfully with no state push", async () => {
    for (const base of arcRoots) {
      const content = await readHandoff(base);
      const transfer = content.split("**Person-to-person handoff:**")[1]?.split(/\r?\n\r?\n/u)[0];
      expect(transfer, "The handoff must sync the state written by arc handover").toMatch(
        /`arc handover <slug> --to <identity>`[\s\S]*`arc sync --json`[\s\S]*`state\.push\.result`[\s\S]*`success`/u,
      );
      expect(transfer).toMatch(/pending[\s\S]*\barc sync\b/u);
      const team = await readFile(resolve(ROOT, base, "reference/strategies/arc/strategy-team-coordination.md"), "utf8");
      const protocol = section(team, "Person-to-Person Task Handoff");
      expect(protocol).toMatch(/pull store state[\s\S]*Owner[\s\S]*Session Context/u);
      expect(protocol).not.toMatch(/arc user (?:fetch|load)|git notes/u);
    }
  });

  it("reports task closure from the store and keeps pending closes on the recovery route", async () => {
    for (const base of arcRoots) {
      const init = await readFile(resolve(ROOT, base, "system/workflows/arc/session-lifecycle/session-init.md"), "utf8");
      const authority = section(init, "5. State authority and mismatches");
      expect(authority).toMatch(/store-backed task cursor[\s\S]*task closure[\s\S]*typed status[\s\S]*lifecycle phase/u);
      expect(authority).toMatch(/commit[\s\S]*task remains open[\s\S]*pending\s+close[\s\S]*Crash Recovery/u);
      expect(authority).not.toMatch(/verify them against Git, which wins on conflict/u);
    }
  });

  it("follows the agenda compiled with a discretionary Session Type override", async () => {
    for (const base of arcRoots) {
      const init = await readFile(resolve(ROOT, base, "system/workflows/arc/session-lifecycle/session-init.md"), "utf8");
      const authority = section(init, "5. State authority and mismatches");
      expect(authority).toMatch(/compiler[\s\S]*`Session Type`[\s\S]*planning\/execution[\s\S]*workflow and load set/u);
      expect(authority).toMatch(/typed prepublication and integration phases[\s\S]*emitted\s+agenda/iu);
    }
  });

  it("relays the contention advisory from a successful sync", async () => {
    for (const base of arcRoots) {
      const confirm = section(await readHandoff(base), "Confirm Handoff");
      expect(confirm).toMatch(/arc sync --json[^\n]*`tripwires\.contention\.text`[^\n]*verbatim/u);
    }
  });

  it("reports the remote outcome of each sync leg even when only one pushed", async () => {
    for (const base of arcRoots) {
      const handoff = await readHandoff(base);
      const confirm = section(handoff, "Confirm Handoff");
      expect(confirm).not.toMatch(/^- `synced to remote`[^\n]*(?:at least one|either)\s+leg/mu);
      expect(confirm).toMatch(/`state\.pull`[\s\S]*`state\.push`[\s\S]*`worktree`/u);
      expect(confirm).toMatch(/`skipped`[\s\S]*`no-remote`[\s\S]*local-only/u);
      expect(section(handoff, "Sync")).toMatch(/`designation-needed`[\s\S]*`arc store remote`/u);
    }
  });

  it("points a just-closed Active unit to attestation when its first Candidate is pending", async () => {
    for (const base of arcRoots) {
      const transition = section(await readHandoff(base), "Task List Completion & Transition");
      expect(transition).toMatch(/\b(?:verify-work-unit\s+Step\s+3|arc\s+attest)\b/u);
      expect(transition).toMatch(/Archive Step 1[\s\S]*prerequisites/u);
    }
  });
});
