import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../../..");

async function shipped(path: string): Promise<string> {
  const [packaged, project] = await Promise.all([
    readFile(resolve(root, "packages/arc-framework/arc", path), "utf8"),
    readFile(resolve(root, ".arc", path), "utf8"),
  ]);
  expect(project, path).toBe(packaged);
  return packaged;
}

function section(content: string, start: string, end?: string): string {
  const from = content.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  return content.slice(from, end === undefined ? undefined : content.indexOf(end, from));
}

const method = "system/methods/route-discovered-work.md";
const drain = "system/workflows/arc/supplemental/drain-inbox.md";
const errand = "system/workflows/arc/supplemental/run-errand.md";
const inboxSkill = "system/.internal/skills/arc-inbox/SKILL.md";
const errandSkill = "system/.internal/skills/arc-errand/SKILL.md";
const housekeepSkill = "system/.internal/skills/arc-housekeep/SKILL.md";

describe("routing workflow contract", () => {
  it("settles activation captures by their actual source and rechecks both lists", async () => {
    const workflow = await shipped("system/workflows/arc/work-unit-lifecycle/activate-work-unit.md");
    const gate = section(workflow, "### 1) Pre-condition gate", "### 2)");
    const removalInstructions = gate.split(/(?<=[.!?])\s+/u).filter(sentence => sentence.includes("`arc user inbox-remove"));

    expect(removalInstructions).toHaveLength(1);
    expect(removalInstructions[0], "Identify the personal source and remove its listed version")
      .toMatch(/\bpersonal\b[^.`]*`arc user inbox-remove --id <id> --expected-version <version>`/iu);
    expect(gate).toMatch(/\binbound\b[^.]*\b(?:delete|remove)\b[^.]*\barc save\b/iu);
    expect(gate).toMatch(/\bmov(?:e|ed)\b[^.]*\b(?:already|skip)\b/iu);
    expect(gate).toMatch(/\bre-?run\b[^.]*\bboth\b/iu);
  });

  it("carries routing outcomes out through the routing verb, with no writer line or owner adoption", async () => {
    const binding = section(await shipped(method), "### Binding: carrying out outcomes");

    expect(binding).toContain("`arc route <id> --from <list> --expected-version <version> --to <destination>`");
    expect(binding).toMatch(softWrappedProse("`arc route --to <destination>`, with the entry on standard input"));
    expect(binding).toContain("`arc user inbox-remove --id <id> --expected-version <version>`");
    expect(binding).toMatch(softWrappedProse("a moved entry has already left its list"));
    expect(binding).toMatch(softWrappedProse("A `hold` into a started work unit is an entry like any other"));
    expect(binding).toMatch(softWrappedProse("no other record keeps an owner's-pass disposition, so give every entry a row"));
    expect(binding).toMatch(softWrappedProse("with a routing receipt for each move into or out of an inbox"));
    expect(binding).toMatch(softWrappedProse("move it into your personal inbox and remove it there"));
    expect(binding).toMatch(softWrappedProse("with no `--section`: every such home has one section"));
    expect(binding).toMatch(softWrappedProse("no Errand carries it"));
    expect(binding).toContain("`survivor.home`");
    for (const retired of ["Inbound Buffer", "Writer line", "Named gap", "route-only", "owner adoption", "USER-INBOX",
      "planning-grooming", "grooming PR"]) {
      expect(binding).not.toContain(retired);
    }
  });

  it("drains the personal inbox as store writes with no grooming pull request", async () => {
    const workflow = await shipped(drain);

    expect(workflow).toContain("`arc inbox personal --json`");
    expect(workflow).toMatch(softWrappedProse("no branch, pull request, or merge carries it"));
    expect(workflow).toContain("`retriage` offer `arc inbox <slug> --json` reports");
    expect(workflow).toContain("`arc errand queue set <file | ->`");
    expect(workflow).toMatch(softWrappedProse("pass `personal:<id>` to `run-errand` as its `--from-inbox` selector"));
    for (const retired of ["arc review planning-grooming resolve", "arc review planning-lane", "gh pr", "arc merge lock",
      "`integration-interlock`", "arc housekeep check", "inbox-mark-execute-bound", "ATOMIC-INBOX", "USER-INBOX",
      "owner-adoption", "named wait", "--inbox-entry-file"]) {
      expect(workflow).not.toContain(retired);
    }
  });

  it("starts, completes, and offers Errands from entry IDs and the Errand queue", async () => {
    const workflow = await shipped(errand);
    const complete = section(workflow, "### Complete");

    expect(workflow).toContain("`--from-inbox <personal|project>:<id>`");
    expect(workflow).toMatch(softWrappedProse("The Errand's goal is its description, read with `arc inbox <slug> --json`"));
    expect(workflow).toMatch(softWrappedProse("every other entry to the abandoner's personal inbox"));
    expect(workflow).toMatch(softWrappedProse("Neither puts it back on the queue"));
    expect(complete).toMatch(softWrappedProse("It removes nothing from an inbox"));
    expect(complete).toMatch(softWrappedProse("removes its origin entry by its ID at the version observed at open"));
    expect(complete).toMatch(softWrappedProse("exact head of the Errand queue"));
    for (const retired of ["route-only", "--inbox-title-file", "<exact-entry-title>", "execute-bound", "SESSION-NOTES",
      "planning-grooming", "arc review planning-lane", "auto-merge"]) {
      expect(workflow).not.toContain(retired);
    }
  });

  it("captures through the routing verb and routes now without an Errand", async () => {
    const [inbox, errandEntry, housekeep] = await Promise.all([shipped(inboxSkill), shipped(errandSkill),
      shipped(housekeepSkill)]);

    expect(inbox).toContain('`arc route --to personal --section <Errand | "Work Unit">`');
    expect(inbox).toMatch(softWrappedProse("through the binding's verbs"));
    expect(errandEntry).toMatch(softWrappedProse("Routing a concern now needs no Errand"));
    expect(errandEntry).not.toContain("route-discovered-work");
    expect(housekeep).not.toContain("write-context");
    for (const skill of [inbox, errandEntry, housekeep]) {
      expect(skill).not.toMatch(/USER-INBOX\.md|route-only|owner-adoption|named wait/u);
    }
  });
});
