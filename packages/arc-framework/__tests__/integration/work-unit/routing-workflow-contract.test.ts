import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listInbox } from "../../../src/lib/inbox/listing.js";
import { listErrandQueue, setErrandQueue } from "../../../src/lib/inbox/queue.js";
import { routeEntry } from "../../../src/lib/inbox/route.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { readProjectionEditRights } from "../../../src/lib/store/projection/rights.js";
import { createInboxHarness, entry } from "../../helpers/inbox-harness.js";
import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";
import { success } from "../../helpers/store/suite-tools.js";

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

  it("gets the source owner's edit for changed Shapes and split residuals in a foreign stub", async () => {
    const routes = section(await shipped(method), "- **Routes:**", "- **Removal:**");
    const pickedStub = section(await shipped(drain), "**Picked-stub re-triage.**", "### 5.");
    const h = createInboxHarness();
    const raw = entry().replace("\n\n", "\n- _Shapes:_ Source decision\n\n");
    const source = await h.workUnit("source", "alice", "backlog", raw, "Planning");
    const reference = recordReferences["work-item/inbound"](source.reference.owner);
    const input = { store: h.context.store, checkout: ".", reference };

    expect(await readProjectionEditRights({ ...input, identity: SlugSchema.parse(h.context.identity) }))
      .toMatchObject({ status: "ok", result: { kind: "protected", reason: "identity", owner: "alice" } });
    expect(await readProjectionEditRights({ ...input, identity: SlugSchema.parse("alice") }))
      .toMatchObject({ status: "ok", result: { kind: "editable" } });
    const from = source.reference.owner.name;
    const to = (await h.workUnit("destination")).reference.owner.name;
    const listed = await listInbox({ list: from }, h.context);
    if (listed.state === "refused" || !listed.entries[0]) throw new Error("Expected one held entry");
    const row = listed.entries[0];
    expect(await routeEntry({ from, to, entryId: row.id, expectedVersion: row.version }, h.context))
      .toMatchObject({ state: "routed" });
    expect(await listInbox({ list: to }, h.context))
      .toMatchObject({ entries: [{ id: row.id, fields: { Shapes: "Source decision" } }] });

    expect.soft(routes, "A changed Shapes value needs the source owner's save before moving").toMatch(
      /\bowner\b[^.]*\bsave\b/iu);
    expect.soft(pickedStub, "A split residual needs the source owner's save").toMatch(
      /\b(?:split|residual)\b[^.]*\bowner\b[^.]*\bsave\b/iu);
  });

  it("routes at the relisted version only when the row matches the approved Shapes edit", async () => {
    const routes = section(await shipped(method), "- **Routes:**", "- **Removal:**");
    const h = createInboxHarness();
    const original = await h.inbox("personal");
    const to = (await h.workUnit()).reference.owner.name;
    success(await h.context.store.write({ action: "put", reference: original.reference,
      expected: original.version, content: original.content.replace("\n\nProse", "\n- _Shapes:_ Approved decision\n\nProse"),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const approved = success(await h.context.store.read({ reference: original.reference }));
    const observed = await listInbox({ list: "personal" }, h.context);
    if (observed.state === "refused" || !observed.entries[0]) throw new Error("Expected the approved edit");
    const row = observed.entries[0];
    success(await h.context.store.write({ action: "put", reference: original.reference,
      expected: approved.version, content: approved.content.replace("Prose", "Changed scope"),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const relisted = await listInbox({ list: "personal" }, h.context);
    if (relisted.state === "refused" || !relisted.entries[0]) throw new Error("Expected the racing edit");
    expect(relisted.entries[0]).toMatchObject({ id: row.id, section: row.section, raw: expect.stringContaining("Changed scope") });
    const move = { from: "personal", to, entryId: row.id };
    expect(await routeEntry({ ...move, expectedVersion: row.version }, h.context))
      .toMatchObject({ state: "refused", code: "changed-entry" });
    expect(await routeEntry({ ...move, expectedVersion: relisted.entries[0].version }, h.context))
      .toMatchObject({ state: "routed" });

    expect.soft(routes, "Require the relisted entry to match the reviewed ID, section and bytes").toMatch(
      /(?:compare|match)[^.]*\bID\b[^.]*\bsection\b[^.]*\braw\b/iu);
    expect.soft(routes, "Send an edit discovered during re-listing back for a routing decision").toMatch(
      /\b(?:difference|mismatch|differs|changed)\b[^.]*\bOwner\b[^.]*\b(?:decision|approval)\b/iu);
  });

  it("treats a retained removal as pending and checks it against the work already saved", async () => {
    const removal = section(await shipped(method), "- **Removal:**", "- **Dispositions table:**");

    expect.soft(removal).toMatch(/`removed`\s+and\s+`absent`[^.]*\bcomplete\b/iu);
    expect.soft(removal).toMatch(/`retained`[^.]*\bre-?list\b[^.]*\bcompar\w+\b[^.]*\balready\b/iu);
  });

  it("drains the personal inbox as store writes with no grooming pull request", async () => {
    const workflow = await shipped(drain);

    expect(workflow).toContain("`arc inbox personal --json`");
    expect(workflow).toMatch(softWrappedProse("no branch, pull request, or merge carries it"));
    expect(workflow).toContain("`retriage` offer `arc inbox <list> --json` reports");
    expect(workflow).toContain("`arc errand queue set <file | ->`");
    expect(workflow).toMatch(softWrappedProse("pass `personal:<id>` to `run-errand` as its `--from-inbox` selector"));
    for (const retired of ["arc review planning-grooming resolve", "arc review planning-lane", "gh pr", "arc merge lock",
      "`integration-interlock`", "arc housekeep check", "inbox-mark-execute-bound", "ATOMIC-INBOX", "USER-INBOX",
      "owner-adoption", "named wait", "--inbox-entry-file"]) {
      expect(workflow).not.toContain(retired);
    }
  });

  it("explains who can write and read personal captures when retaining or adding them", async () => {
    const [workflow, capture] = await Promise.all([shipped(drain), shipped(inboxSkill)]);
    const retention = section(workflow, "- **Retain (escape-hatch)**", "- **Execute-now atomic**");
    const writing = section(capture, "5. Write it.");

    expect.soft(retention).not.toContain("private-until-vetted");
    expect.soft(writing).not.toMatch(softWrappedProse("The personal inbox is yours alone"));
    expect.soft(retention, "Retention defers routing").toMatch(/\b(?:defer|postpone)\w* routing\b/iu);
    for (const instructions of [retention, writing]) {
      expect.soft(instructions, "ARC restricts writes to the inbox identity")
        .toMatch(/\bARC\b[^.]*\bwrit\w*\b[^.]*\bonly\b[^.]*\bidentity\b/iu);
      expect.soft(instructions, "State remote readers can read published entries")
        .toMatch(/\bread access\b[^.]*\bstate (?:remote|repository)\b[^.]*\bread\b[^.]*\bpublish\w*\b/iu);
    }
  });

  it("preserves a queued personal capture while planning routes for new ones", async () => {
    const workflow = await shipped(drain);
    const reads = section(workflow, "### 1. Read the inbox", "### 2.");
    const dispatch = section(workflow, "### 5. Execution transition", "### 6.");
    const h = createInboxHarness();
    await routeEntry({ to: "personal", section: "Errand", content: entry("11223344", "Previously queued") }, h.context);
    const queued = { inbox: "personal", id: "11223344" };
    const members = [queued];
    expect(await setErrandQueue({ schemaVersion: 1, members }, h.context)).toMatchObject({ state: "set", members });
    await routeEntry({ to: "personal", section: "Errand", content: entry("55667788", "New capture") }, h.context);
    expect(await listInbox({ list: "personal" }, h.context))
      .toMatchObject({ entries: expect.arrayContaining([expect.objectContaining({ id: queued.id }),
        expect.objectContaining({ id: "55667788" })]) });
    expect(await listErrandQueue(h.context)).toMatchObject({ state: "listed", members });

    expect.soft(reads, "Read the queue before classifying captures").toContain("`arc errand queue --json`");
    expect.soft(reads).toMatch(/queue[^.]*\binbox\b[^.]*\bID\b/iu);
    expect.soft(reads).toMatch(/\bqueued\b[^.]*\b(?:triaged|classif\w+)\b/iu);
    expect.soft(dispatch).toMatch(/\b(?:remove|replace|update)\b[^.]*\breference\b[^.]*\b(?:confirmed|approved)\b/iu);
  });

  it("keeps exactly one accepted split part and leaves the refused part available to resume", async () => {
    const workflow = section(await shipped(drain), "### 4. Route", "### 5.");
    const split = section(workflow, "Split a capture", "- **Survivor**");
    const h = createInboxHarness();
    const source = { list: "personal" } as const;
    const first = (await h.workUnit("first")).reference.owner.name;
    const closed = (await h.workUnit("closed", "test-user", "completed")).reference.owner.name;
    const repaired = (await h.workUnit("available")).reference.owner.name;
    const original = await h.inbox("personal", entry("aabbccdd", "Two concerns", "Check the index. Update the guide."));

    expect.soft(split, "Save the parts in the source before any move").toMatch(
      /\breplac\w+\b[^.]*\bsource\b[^.]*\barc save\b[^.]*\bbefore\b[^.]*\b(?:mov|dispatch)\w*\b/iu);
    expect.soft(split, "Use the persisted identities and versions on a restart").toMatch(
      /\bID[s]?\b[\s\S]*\bversion[s]?\b[\s\S]*\b(?:restart|resum\w+)\b/iu);

    success(await h.context.store.write({ action: "put", reference: original.reference, expected: original.version,
      content: `## Work Unit\n\n${entry("aabbccdd", "Check the index")}\n\n${entry("55667788", "Update the guide")}\n`,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const persisted = await listInbox(source, h.context);
    if (persisted.state === "refused") throw new Error(persisted.reason);
    const [accepted, pending] = persisted.entries;
    if (!accepted || !pending) throw new Error("Expected two persisted split parts");
    const move = { from: source.list, entryId: accepted.id, expectedVersion: accepted.version, to: first };
    const remaining = { from: source.list, entryId: pending.id, expectedVersion: pending.version, to: closed };
    expect(await routeEntry(move, h.context)).toMatchObject({ state: "routed" });
    expect(await routeEntry(remaining, h.context)).toMatchObject({ state: "refused", code: "destination-refused" });
    expect(await listInbox(source, h.context)).toMatchObject({ entries: [{ id: pending.id, version: pending.version }] });
    expect(await routeEntry(move, h.context)).toMatchObject({ state: "already-home" });
    expect(await routeEntry({ ...remaining, to: repaired }, h.context)).toMatchObject({ state: "routed" });
    expect(await listInbox(source, h.context)).toMatchObject({ entries: [] });
    expect(await listInbox({ list: first }, h.context)).toMatchObject({ entries: [{ id: accepted.id }] });
  });

  it("hands a same-session partial Errand off to the returned primary checkout on base", async () => {
    const handoff = section(await shipped(drain), "- **Same session**", "- **Fresh session**");

    expect.soft(handoff).toContain("`allocation.checkoutPath`");
    expect.soft(handoff).toMatch(/\bpartial protection\b[^.]*\bprimary\b[^.]*\bbase\b/iu);
    expect.soft(handoff).not.toContain("`chore/<slug>`");
  });

  it("uses the agreed launch intent for a partial Errand without an inbox origin", async () => {
    const goal = section(await shipped(errand), "In Launch mode, execute subsequent commands", "4. **Late inbox adoption");

    expect(goal).toMatch(/\bpartial protection\b[^.]*\borigin\b[^.]*\b(?:seed|intent)\b/iu);
  });

  it("reads the full Errand description by UID when its slug is reserved for an inbox", async () => {
    const goal = section(await shipped(errand), "In Launch mode, execute subsequent commands", "4. **Late inbox adoption");

    expect(goal).toMatch(/`(?:personal|project)`[^.]*`(?:personal|project)`[^.]*\bUID\b/iu);
  });

  it("reports the holder and entry ID when a full abandon leaves an entry with another open Errand", async () => {
    const abandon = section(await shipped(errand), "**Explicit abandon.**", "Run each review increment");

    expect.soft(abandon).toMatch(/\b(?:held|holds|stays)\b[^.]*\banother\s+open\s+Errand\b[^.]*\b(?:keeps|stays|holds)\b/iu);
    expect.soft(abandon).toMatch(/\breport\b[^.]*\b(?:holder|Errand)\b[^.]*\bentry\s+ID\b[^.]*`recommendedPromptText`/iu);
  });

  it("reports missing or skipped queue members and their remedies even without a next offer", async () => {
    const diagnostics = section(await shipped(errand), "### Complete", "When the current conversation");

    expect(diagnostics).toMatch(/`leftOut`[^.]*`skipped`[^.]*\binbox\b[^.]*\bID\b[^.]*\breason\b[^.]*\bremedy\b/iu);
  });

  it("starts, completes, and offers Errands from entry IDs and the Errand queue", async () => {
    const workflow = await shipped(errand);
    const complete = section(workflow, "### Complete");

    expect(workflow).toContain("`--from-inbox <personal|project>:<id>`");
    expect(workflow).toMatch(/under full protection[^.]*\bdescription\b[^.]*\bgoal\b[^.]*`arc inbox <list> --json`/iu);
    expect(workflow).toMatch(softWrappedProse("Other returnable entries go to the abandoner's personal inbox"));
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
