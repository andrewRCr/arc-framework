/** Built-CLI entry insertion, version-bound moves, and recovery of a raced edit. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";
import { InboxResultSchema } from "../../src/lib/inbox/types.js";
import { RouteResultSchema } from "../../src/lib/inbox/route.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { parseEntryList } from "../../src/lib/store/kinds/entry-list.js";
import { RoutingReceiptSchema } from "../../src/lib/store/kinds/routing-receipt.js";
import { readStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { identity, interruptGit, invoke, personalInbox, personalRef, projectInbox, projectInboxRef, refSnapshot,
  repository, stateDirectory, stateGit } from "../helpers/store-locus-inbox-fixture.js";
import { git } from "./helpers.js";

const SEQUENCE_TIMEOUT_MS = 150_000;
const capture = "### **Survey concern**\n\nOriginal field notes\n";
const routeArgs = (id: string, version: string, source: string, destination: string, section?: string) =>
  ["route", id, "--from", source, "--expected-version", version, "--to", destination,
    ...(section === undefined ? [] : ["--section", section])];

async function listing(root: string, list: string) {
  const result = InboxResultSchema.parse(JSON.parse((await invoke(root, ["inbox", list, "--json"])).stdout));
  expect(result).toMatchObject({ state: "listed", list });
  if (result.state === "refused") throw new Error(result.reason);
  return result.entries;
}

async function insert(root: string, to = "project", stdin = capture, section?: string) {
  const result = await invoke(root, ["route", "--to", to, ...(section === undefined ? [] : ["--section", section])], 0, { stdin });
  return RouteResultSchema.parse(JSON.parse(result.stdout));
}

async function receipts(root: string, ref: string, path: string) {
  const paths = await stateGit(root, ["ls-tree", "-r", "--name-only", ref, "--", path]);
  return Promise.all(paths.split("\n").filter(Boolean).map(async file =>
    RoutingReceiptSchema.parse(JSON.parse(await stateGit(root, ["show", `${ref}:${file}`])))));
}

it("lists the inserted ID and version, refuses a stale move, and commits the refreshed move with both receipts", async () => {
  const root = await repository();
  const inserted = await insert(root);
  expect(inserted).toMatchObject({ state: "routed", destination: { list: "project", section: "Inbox" } });
  if (inserted.state === "refused") throw new Error(inserted.reason);
  const { entryId: id } = inserted;
  expect(id).toMatch(/^[a-f0-9]{8}$/u);
  const saved = await readStoreRecord(root, identity, projectInbox);
  const parsed = parseEntryList(saved.content, "project-inbox/inbox");
  expect(parsed).toMatchObject({ success: true, data: { entries: [{ id, title: "Survey concern" }] } });
  const [original] = await listing(root, "project");
  if (!parsed.success || original === undefined) throw new Error("Inserted entry was not readable");
  expect(original).toMatchObject({ id, version: parsed.data.entries[0]?.version, sourceVersion: saved.version,
    raw: expect.stringContaining("Original field notes") });
  expect(await listing(root, "project")).toEqual([original]);
  const insertedReceipts = await receipts(root, projectInboxRef, "receipts/");
  expect(insertedReceipts).toMatchObject([{ entryId: id, source: null, destination: { list: "project", section: "Inbox" } }]);

  await seedStore(root, identity, [{ reference: saved.reference, expected: saved.version,
    content: saved.content.replace("Original field notes", "Edited field notes") }]);
  const [fresh] = await listing(root, "project");
  if (fresh === undefined) throw new Error("Edited entry was not readable");
  expect(fresh).toMatchObject({ id, raw: expect.stringContaining("Edited field notes") });
  expect(fresh.version).not.toBe(original.version);
  const edited = await readStoreRecord(root, identity, projectInbox);
  const personal = await readStoreRecord(root, identity, personalInbox);
  const personalPath = join(root, ".arc", "user", identity, "USER-INBOX.md");
  const beforeBytes = await readFile(personalPath);
  const refs = await refSnapshot(root);
  const refused = await invoke(root, routeArgs(id, original.version, "project", "personal", "Errand"), 1);
  expect(JSON.parse(refused.stdout)).toMatchObject({ state: "refused", code: "changed-entry", foundVersion: fresh.version,
    reason: expect.stringContaining(id), remedy: { text: expect.stringContaining("arc inbox <list>") } });
  expect(await refSnapshot(root)).toEqual(refs);
  expect(await readStoreRecord(root, identity, projectInbox)).toEqual(edited);
  expect(await readStoreRecord(root, identity, personalInbox)).toEqual(personal);
  expect(await readFile(personalPath)).toEqual(beforeBytes);

  const [listedAgain] = await listing(root, "project");
  expect(listedAgain).toEqual(fresh);
  const moved = await invoke(root, routeArgs(id, fresh.version, "project", "personal", "Errand"));
  const destination = { list: "personal", identity, section: "Errand" };
  expect(JSON.parse(moved.stdout)).toMatchObject({ state: "routed", entryId: id, destination });
  const after = await readStoreRecord(root, identity, personalInbox);
  expect(after.content).toContain("Edited field notes");
  expect(after.content).toContain(`- _Id:_ \`${id}\``);
  expect((await readStoreRecord(root, identity, projectInbox)).content).not.toContain(id);
  expect(await listing(root, "project")).toEqual([]);
  expect(await listing(root, "personal")).toMatchObject([{ id, section: "Errand", raw: expect.stringContaining("Edited field notes") }]);
  expect(await readFile(personalPath, "utf8")).toContain("Edited field notes");
  const personalReceipts = await receipts(root, personalRef, `${identity}/receipts/`);
  expect(personalReceipts).toMatchObject([{ entryId: id, destination, source: { list: "project", section: "Inbox" } }]);
  expect(await receipts(root, projectInboxRef, "receipts/")).toEqual(expect.arrayContaining([...insertedReceipts, ...personalReceipts]));
  expect(await receipts(root, projectInboxRef, "receipts/")).toHaveLength(2);
  const batchTrailer = ["log", "-1", "--format=%(trailers:key=Arc-Batch,valueonly)"];
  const batch = await stateGit(root, [...batchTrailer, projectInboxRef]);
  expect(batch).toMatch(/^[a-f0-9-]{36}$/u);
  expect(await stateGit(root, [...batchTrailer, personalRef])).toBe(batch);
  expect((await refSnapshot(root))[1]).toBe(refs[1]);
}, SEQUENCE_TIMEOUT_MS);

it.skipIf(process.platform === "win32")("lists the raced edit under its derived home and retries an atomic carry into the renamed owner", async () => {
  const root = await repository();
  const { meta } = await seedWorkUnit(root, "survey-plan", { identity,
    meta: { owner: identity, state: "Planning", currentWorkflow: "draft-design" } });
  const { name, uid } = seededWorkUnitSubject(meta);
  const inbound = recordReferences["work-item/inbound"](meta.reference.owner);
  await insert(root, name, "### [ ] Unrelated concern\n\nThese notes must remain exact.\n");
  const [unrelated] = await listing(root, name);
  if (unrelated === undefined) throw new Error("Destination's unrelated entry was not readable");
  await insert(root);
  const [original] = await listing(root, "project");
  if (original === undefined) throw new Error("Source entry was not readable");
  const { id, version } = original;
  const saved = await readStoreRecord(root, identity, projectInbox);
  const oldTip = await stateGit(root, ["rev-parse", projectInboxRef]);
  await seedStore(root, identity, [{ reference: saved.reference, expected: saved.version,
    content: saved.content.replace("Original field notes", "Surviving field notes") }]);
  const editedTip = await stateGit(root, ["rev-parse", projectInboxRef]);
  expect(editedTip).not.toBe(oldTip);
  await stateGit(root, ["update-ref", projectInboxRef, oldTip, editedTip]);
  const trigger = join(root, ".git", "pending-source-edit");
  await writeFile(trigger, "");
  // Publish the competing edit after the mover has prepared the original removal and before its Git transaction.
  const env = await interruptGit(root, [
    'for arg in "$@"; do',
    '  case "$arg" in',
    '    "route "*)',
    '      if test -f "$ARC_TEST_TRIGGER"; then',
    '        git --git-dir="$ARC_TEST_STATE_DIR" update-ref "$ARC_TEST_SOURCE_REF" "$ARC_TEST_EDIT" "$ARC_TEST_OLD" || exit 1',
    '        rm "$ARC_TEST_TRIGGER" || exit 1',
    "      fi ;;",
    "  esac",
    "done",
  ], { ARC_TEST_TRIGGER: trigger, ARC_TEST_STATE_DIR: await stateDirectory(root),
    ARC_TEST_SOURCE_REF: projectInboxRef, ARC_TEST_OLD: oldTip, ARC_TEST_EDIT: editedTip });
  expect(JSON.parse((await invoke(root, routeArgs(id, version, "project", name), 0, { env })).stdout))
    .toMatchObject({ state: "routed", entryId: id, destination: { list: uid, section: "Inbound" } });
  await expect(readFile(trigger)).rejects.toMatchObject({ code: "ENOENT" });
  const [survivor] = await listing(root, "project");
  expect(survivor).toMatchObject({ id, raw: expect.stringContaining("Surviving field notes"),
    survivor: { home: { list: uid, section: "Inbound" } } });
  if (survivor === undefined) throw new Error("Racing edit was lost");
  expect(survivor.version).not.toBe(version);

  const renamed = await invoke(root, ["rename", name, "survey-followup", "--json"]);
  expect(JSON.parse(renamed.stdout)).toMatchObject({ status: "renamed" });
  const owner = await readStoreRecord(root, identity, meta.reference);
  expect(owner.reference.owner).toMatchObject({ name: "survey-followup", uid });
  const source = await readStoreRecord(root, identity, projectInbox);
  const destination = await readStoreRecord(root, identity, inbound);
  expect(source.content).toContain("Surviving field notes");
  expect(destination.content).toContain("Original field notes");
  const before = await refSnapshot(root);
  const lock = join(root, ".git", "arc", "locks", "refs", "arc", "work", `${uid}.lock`);
  await mkdir(dirname(lock), { recursive: true });
  const held = await acquireAdvisoryLock(lock);
  const args = routeArgs(id, survivor.version, "project", uid);
  try {
    const refused = await invoke(root, args, 1);
    expect(JSON.parse(refused.stdout)).toMatchObject({ state: "refused", code: "lock-held",
      reason: expect.stringContaining("The lock remained held"), remedy: { text: expect.stringContaining("retry") } });
    expect(await refSnapshot(root)).toEqual(before);
    expect(await readStoreRecord(root, identity, projectInbox)).toEqual(source);
    expect(await readStoreRecord(root, identity, inbound)).toEqual(destination);
    expect(await readStoreRecord(root, identity, meta.reference)).toEqual(owner);
  } finally {
    await releaseAdvisoryLock(held);
  }

  expect(JSON.parse((await invoke(root, args)).stdout)).toMatchObject({
    state: "routed", carried: "replaced", entryId: id, destination: { list: uid, section: "Inbound" },
  });
  expect((await readStoreRecord(root, identity, projectInbox)).content).not.toContain(id);
  const after = await readStoreRecord(root, identity, inbound);
  expect(after.content).not.toContain("Original field notes");
  expect(after.content).toContain("Surviving field notes");
  const parsed = parseEntryList(after.content, "work-item/inbound");
  expect(parsed).toMatchObject({ success: true, data: { entries: [
    { id: unrelated.id, bytes: unrelated.raw }, { id, bytes: expect.stringContaining("Surviving field notes") },
  ] } });
  expect(await readStoreRecord(root, identity, meta.reference)).toEqual(owner);
  expect((await refSnapshot(root))[1]).toBe(before[1]);
}, SEQUENCE_TIMEOUT_MS);

async function refusedMove(root: string, from: string, to: string, code: string) {
  const source = await listing(root, from);
  const destination = await listing(root, to);
  const [entry] = source;
  if (entry === undefined) throw new Error(`Missing fixture entry in ${from}`);
  // Receipts live in the project and personal ref trees. Equal tips also prove no receipt was appended.
  const refs = await refSnapshot(root);
  const args = routeArgs(entry.id, entry.version, from, to);
  const result = RouteResultSchema.parse(JSON.parse((await invoke(root, args, 1)).stdout));
  expect(result).toMatchObject({ state: "refused", code });
  expect(await refSnapshot(root)).toEqual(refs);
  expect(await listing(root, from)).toEqual(source);
  expect(await listing(root, to)).toEqual(destination);
  return { entry, args, result };
}

it("preserves a started unit's inbound capture until its owner moves it", async () => {
  const root = await repository();
  const from = "survey-plan";
  await seedWorkUnit(root, from, { identity, meta: { owner: identity, state: "Planning", currentWorkflow: "draft-design" } });
  await insert(root, from, "### [ ] Survey concern\n\nOriginal field notes\n");
  await git(root, ["config", "--local", "arc.identity", "teammate"]);
  const { entry, args, result } = await refusedMove(root, from, "project", "owner-required");
  expect(result).toMatchObject({ reason: expect.stringContaining(identity) });

  await git(root, ["config", "--local", "arc.identity", identity]);
  expect(JSON.parse((await invoke(root, args)).stdout)).toMatchObject({ state: "routed", entryId: entry.id });
  expect(await listing(root, from)).toEqual([]);
  expect(await listing(root, "project")).toMatchObject([{ id: entry.id, raw: expect.stringContaining("Original field notes") }]);
}, SEQUENCE_TIMEOUT_MS);

it.each(["Integrating", "completed"] as const)("preserves both lists when the destination is %s and routes to an accepting inbox", async (stage) => {
  const root = await repository();
  const to = "survey-plan";
  await seedWorkUnit(root, to, { identity, ...(stage === "Integrating"
    ? { meta: { owner: identity, state: "Integrating" } }
    : { meta: { owner: identity, state: "Shipped", completed: "2026-07-14" },
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") } }) });
  await insert(root, "personal", capture, "Errand");
  const { entry } = await refusedMove(root, "personal", to, "destination-refused");

  const moved = await invoke(root, routeArgs(entry.id, entry.version, "personal", "project"));
  expect(JSON.parse(moved.stdout)).toMatchObject({ state: "routed", entryId: entry.id });
  expect(await listing(root, "personal")).toEqual([]);
  expect(await listing(root, "project")).toMatchObject([{ id: entry.id, raw: expect.stringContaining("Original field notes") }]);
  expect(await listing(root, to)).toEqual([]);
}, SEQUENCE_TIMEOUT_MS);

it("preserves an unrelated same-ID capture through refusal and a fresh-ID copy", async () => {
  const root = await repository();
  const id = "12345678";
  await insert(root, "personal", `### **Survey concern**\n- _Id:_ \`${id}\`\n\nOriginal field notes\n`, "Errand");
  await insert(root, "project", `### **Unrelated concern**\n- _Id:_ \`${id}\`\n\nOther field notes\n`);
  const [held] = await listing(root, "project");
  if (held === undefined) throw new Error("Missing unrelated capture");
  const { entry, result } = await refusedMove(root, "personal", "project", "id-clash");
  expect(result).toMatchObject({ reason: expect.stringContaining(held.title), remedy: { text: expect.stringContaining("without _Id:_") } });

  const copy = await insert(root, "project", entry.raw.replace(/^- _Id:_.*\n?/mu, ""));
  expect(copy).toMatchObject({ state: "routed" });
  if (copy.state === "refused") throw new Error(copy.reason);
  expect(copy.entryId).not.toBe(id);
  expect(await listing(root, "personal")).toEqual([entry]);
  await invoke(root, ["user", "inbox-remove", "--id", id, "--expected-version", entry.version]);
  expect(await listing(root, "personal")).toEqual([]);
  expect(await listing(root, "project")).toMatchObject([
    { id, raw: held.raw, version: held.version },
    { id: copy.entryId, title: entry.title, raw: expect.stringContaining("Original field notes") },
  ]);
}, SEQUENCE_TIMEOUT_MS);

it("publishes the project and personal inbox tips in one committed Git transaction", async () => {
  const root = await repository();
  await insert(root);
  const [entry] = await listing(root, "project");
  if (entry === undefined) throw new Error("Source entry was not readable");

  const hooks = join(await stateDirectory(root), "route-test-hooks");
  await mkdir(hooks);
  const log = join(hooks, "committed");
  await writeFile(log, "");
  await writeFile(join(hooks, "reference-transaction"), [
    "#!/bin/sh",
    'test "$1" = committed || exit 0',
    // A blank line ends the list of updates from this hook invocation.
    '{ cat; echo; } >> "${0%/*}/committed"',
    "",
  ].join("\n"), { mode: 0o755 });
  await stateGit(root, ["config", "--local", "core.hooksPath", hooks]);

  const refs = [projectInboxRef, personalRef];
  const tips = () => Promise.all(refs.map(ref => stateGit(root, ["rev-parse", ref])));
  const before = await tips();
  const moved = await invoke(root, routeArgs(entry.id, entry.version, "project", "personal", "Errand"));
  expect(JSON.parse(moved.stdout)).toMatchObject({ state: "routed", entryId: entry.id });
  const after = await tips();
  const updates = refs.map((ref, i) => {
    expect(after[i]).not.toBe(before[i]);
    return `${before[i]} ${after[i]} ${ref}`;
  });
  const transactions = (await readFile(log, "utf8")).trim().split(/\r?\n\r?\n/u)
    .map(transaction => transaction.split(/\r?\n/u));
  expect(transactions).toContainEqual(expect.arrayContaining(updates));
}, SEQUENCE_TIMEOUT_MS);
