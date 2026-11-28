/** Built-CLI queue ordering, safe replacement, and execution of the chosen capture. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ErrandQueueResultSchema } from "../../src/lib/inbox/queue.js";
import { InboxResultSchema } from "../../src/lib/inbox/types.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { readStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { errandQueue, identity, invoke, personalInbox, projectInbox, refSnapshot, repository } from "../helpers/store-locus-inbox-fixture.js";
import { git } from "./helpers.js";

const SEQUENCE_TIMEOUT_MS = 180_000;
const chosen = { inbox: "project", id: "12345678" } as const;
const collision = { inbox: "personal", id: chosen.id } as const;
const missing = { inbox: "project", id: "22222222" } as const;
const conflicted = { inbox: "personal", id: "33333333" } as const;
const later = { inbox: "personal", id: "abcdef01" } as const;
type Member = { inbox: "personal" | "project"; id: string };

function entry(member: Member, title: string): string {
  return `### **${title}**\n- _Created:_ \`2026-01-01\`\n- _Id:_ \`${member.id}\`\n\nField notes for ${title}.\n`;
}

async function setQueue(root: string, members: Member[], exitCode = 0) {
  const result = await invoke(root, ["errand", "queue", "set", "-"], exitCode,
    { stdin: JSON.stringify({ schemaVersion: 1, members }) });
  return ErrandQueueResultSchema.parse(JSON.parse(result.stdout));
}

async function listQueue(root: string, exitCode = 0) {
  const result = await invoke(root, ["errand", "queue", "--json"], exitCode);
  return ErrandQueueResultSchema.parse(JSON.parse(result.stdout));
}

async function seedCaptures(root: string) {
  const personal = await readStoreRecord(root, identity, personalInbox);
  await seedStore(root, identity, [{ reference: personal.reference, expected: personal.version,
    content: `# User Inbox\n\n## Errand\n\n${entry(collision, "Same ID in personal")}\n${entry(conflicted, "Disputed plan")}\n${entry(later, "Next survey")}` }]);
  // Insertion uses the same public grammar whether the project inbox already exists or is created by the command.
  await invoke(root, ["route", "--to", "project"], 0, { stdin: entry(chosen, "Selected survey") });
}

it("refuses duplicate IDs unchanged, accepts repaired stdin, and starts only the selected eligible queue member", async () => {
  const root = await repository(true);
  await seedCaptures(root);
  const initial = await setQueue(root, [later]);
  expect(initial).toMatchObject({ state: "set", members: [{ ...later, title: "Next survey" }] });
  const baseline = await readStoreRecord(root, identity, errandQueue);
  const personalPath = join(root, ".arc", "user", identity, "USER-INBOX.md");
  const bytes = await readFile(personalPath);
  const before = await refSnapshot(root);
  expect(await setQueue(root, [chosen, collision], 1)).toMatchObject({
    state: "refused", code: "id-clash", reason: expect.stringContaining(`project:${chosen.id} and personal:${chosen.id}`),
    remedy: { text: expect.stringContaining("Choose only one") },
  });
  expect(await readStoreRecord(root, identity, errandQueue)).toEqual(baseline);
  expect(await refSnapshot(root)).toEqual(before);
  expect(await readFile(personalPath)).toEqual(bytes);

  const repaired = await setQueue(root, [missing, conflicted, chosen, later]);
  expect(repaired).toMatchObject({ state: "set", members: [
    { ...missing, title: missing.id }, { ...conflicted, title: "Disputed plan" },
    { ...chosen, title: "Selected survey" }, { ...later, title: "Next survey" },
  ] });
  if (repaired.state === "refused") throw new Error(repaired.reason);
  const { members } = repaired;
  expect(await listQueue(root)).toMatchObject({ state: "listed", members });
  const ranks = members.map(({ rank }) => rank);
  expect(new Set(ranks).size).toBe(members.length);
  expect(ranks).toEqual([...ranks].sort());
  const saved = await readStoreRecord(root, identity, errandQueue);
  const parsed = parseEntryList(saved.content, "personal/errand-queue");
  if (!parsed.success) throw new Error(parsed.error);
  const stored = parsed.data.entries.map(({ id, title, fields }) => ({ id, title, inbox: fields.Inbox, rank: fields.Rank }));
  expect(stored).toHaveLength(members.length);
  expect(stored).toEqual(expect.arrayContaining(members));
  for (const [list, expected] of [["personal", [collision, conflicted, later]], ["project", [chosen]]] as const) {
    const listed = await invoke(root, ["inbox", list, "--json"]);
    const inbox = InboxResultSchema.parse(JSON.parse(listed.stdout));
    expect(inbox).toMatchObject({ state: "listed", entries: expected.map(({ id }) => ({ id })) });
  }

  const unedited = await readStoreRecord(root, identity, personalInbox);
  for (const title of ["Current plan", "Incoming plan"]) {
    await seedStore(root, identity, [{ reference: unedited.reference, expected: unedited.version,
      content: unedited.content.replace("Disputed plan", title) }]);
  }
  await invoke(root, ["inbox", "personal", "--json"]);
  const personal = await readStoreRecord(root, identity, personalInbox);
  expect(personal.conflicts.length).toBeGreaterThan(0);
  const personalBytes = await readFile(personalPath);
  const ready = await refSnapshot(root);
  const next = await invoke(root, ["errand", "next", "--json"]);
  const key = `${chosen.inbox}:${chosen.id}`;
  expect(JSON.parse(next.stdout)).toMatchObject({
    state: "available", nextOffer: { key },
    leftOut: [{ ...missing, reason: expect.stringContaining("gone from its inbox"), remedy: { text: expect.stringContaining("arc errand queue set") } }],
    skipped: [{ ...conflicted, reason: expect.stringContaining("unresolved conflict"), remedy: { text: expect.stringContaining("arc errand queue set") } }],
  });
  expect(await refSnapshot(root)).toEqual(ready);
  expect(await readStoreRecord(root, identity, errandQueue)).toEqual(saved);
  expect(await readFile(personalPath)).toEqual(personalBytes);
  expect(await readWorktreeMarker(root)).toEqual({ kind: "absent" });

  const slug = "selected-survey";
  const head = await git(root, ["rev-parse", "refs/heads/main"]);
  const roster = await git(root, ["worktree", "list", "--porcelain"]);
  const result = await invoke(root, ["errand", "open", slug, "--from-inbox", key, "--json"]);
  expect(JSON.parse(result.stdout)).toMatchObject({
    outcome: "applied", operation: "errand-open", allocation: { kind: "primary", checkoutPath: root },
    identity: { originEntry: key, state: "open" },
  });
  const primary = await readStoreRecord(root, identity,
    recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })));
  expect(primary.reference.owner).toMatchObject({ name: slug, uid: expect.stringMatching(/^[a-f0-9-]{36}$/u) });
  const opened = TransientIdentityRecordSchema.parse(JSON.parse(primary.content));
  expect(opened).toMatchObject({ originEntry: key, state: "open", branch: expect.stringMatching(/^chore\/selected-survey-[a-f0-9]{8}$/u) });
  expect(await readWorktreeMarker(root)).toMatchObject({ kind: "present", marker: {
    spawnedByArc: false, createdFor: { kind: "errand", slug, claimId: opened.claimId },
  } });
  expect(await git(root, ["branch", "--show-current"])).toBe(opened.branch);
  expect(await git(root, ["rev-parse", "HEAD", "refs/heads/main", "refs/remotes/origin/main"])).toBe([head, head, head].join("\n"));
  expect(await git(root, ["worktree", "list", "--porcelain"])).toBe(roster.replace("branch refs/heads/main", `branch refs/heads/${opened.branch}`));
  const description = await readStoreRecord(root, identity, recordReferences["work-item/description"](primary.reference.owner));
  expect(description.content).toContain("Field notes for Selected survey");
  expect(description.content).toContain(chosen.id);
  expect((await readStoreRecord(root, identity, projectInbox)).content).not.toContain(chosen.id);
  const remaining = members.filter(({ id }) => id !== chosen.id);
  expect(await listQueue(root)).toMatchObject({ state: "listed", members: remaining });
  const after = await readStoreRecord(root, identity, errandQueue);
  const afterEntries = parseEntryList(after.content, "personal/errand-queue");
  expect(afterEntries).toMatchObject({ success: true, data: { entries: parsed.data.entries.filter(({ id }) => id !== chosen.id) } });
  expect(await readStoreRecord(root, identity, personalInbox)).toEqual(personal);
  expect(await readFile(personalPath)).toEqual(personalBytes);
}, SEQUENCE_TIMEOUT_MS);

it("refuses a malformed stored rank and accepts replacement ranks without losing queue notes", async () => {
  const root = await repository();
  await seedCaptures(root);
  expect(await setQueue(root, [chosen])).toMatchObject({ state: "set", members: [chosen] });
  const queue = await readStoreRecord(root, identity, errandQueue);
  const note = "Queue instructions.\n<!-- Keep this note. -->\n";
  const malformed = note + queue.content.replace(/- _Rank:_ `[^`]+`/u, "- _Rank:_ `bad rank`");
  await seedStore(root, identity, [{ reference: queue.reference, expected: queue.version, content: malformed }]);
  const saved = await readStoreRecord(root, identity, errandQueue);
  expect(saved.content).toBe(malformed);
  const before = await refSnapshot(root);
  expect(await listQueue(root, 1)).toMatchObject({ state: "refused", code: "record-malformed",
    remedy: { text: expect.stringContaining("arc errand queue set") } });
  expect(await readStoreRecord(root, identity, errandQueue)).toEqual(saved);
  expect(await refSnapshot(root)).toEqual(before);

  expect(await setQueue(root, [chosen])).toMatchObject({ state: "set", members: [chosen] });
  expect(await listQueue(root)).toMatchObject({ state: "listed", members: [chosen] });
  const repaired = await readStoreRecord(root, identity, errandQueue);
  expect(repaired.content).toContain(note);
  expect(repaired.content).not.toContain("bad rank");
  const next = await invoke(root, ["errand", "next", "--json"]);
  expect(JSON.parse(next.stdout)).toMatchObject({ state: "available", nextOffer: { key: `project:${chosen.id}` } });
  expect((await refSnapshot(root))[1]).toBe(before[1]);
}, SEQUENCE_TIMEOUT_MS);
