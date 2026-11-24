/** Reconcile managed targets and checkout-local scratch against the persisted UID. */
import { watch } from "node:fs";
import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

import { git, runArc } from "./helpers.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { seedStore } from "../helpers/store/seed-store.js";
import { holdPersonalLockInProcess } from "../helpers/store/personal-lock-holder.js";
import { expectExit, fixtureStore, markerPath, personalRecords, SESSION_COMMAND_TIMEOUT_MS,
  sessionIdentity, sessionRepo, stored } from "../helpers/store-session-personal-fixture.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeMetaSessionContext } from "../../src/lib/store/kinds/meta/writers.js";

const args = ["--skip-projection", "user", "reconcile-references", "--apply", "--json"];
const inboxBytes = "# Inbox\n\n## Work Unit\n\n### **One**\n\n- _WU_Target:_ `former`\n- _Id:_ `12345678`\n\n"
  + "### **Two**\n\n- _WU_Target:_ `former (planned)`\n- _Id:_ `87654321`\n";
const memoryBytes = "# Memory\n\n## Memories\n\n**Useful:**\n_Remove when:_ `former` ends\n_Id:_ `11223344`\n\nKeep `spec-former.md` in prose.\n";

async function namedWork() {
  const root = await sessionRepo();
  const store = fixtureStore(root);
  const { meta: former } = await seedWorkUnit(root, "former", { identity: sessionIdentity });
  const original = stored(await store.read({ reference: former.reference }));
  const current = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "current" } });
  stored(await store.write({ action: "put", reference: current, expected: original.version,
    content: original.content.replaceAll("former", "current"), placement: { kind: "active" },
    provenance: { verb: "rename", lifecycleAction: "transition" } }));
  const alias = stored(await store.lookup({ kind: "slug", slug: SlugSchema.parse(former.reference.owner.name) }));
  expect(alias.reference).toEqual(current);
  expect(current.owner).toMatchObject({ uid: expect.any(String) });
  expect(current.owner).toMatchObject({ uid: "uid" in original.reference.owner ? original.reference.owner.uid : undefined });
  return { root, store, current };
}

async function scratchFolders(root: string) {
  const scratch = join(root, ".arc", "user", sessionIdentity, "scratch", "work-unit");
  const from = join(scratch, "former"), to = join(scratch, "current");
  await mkdir(from, { recursive: true });
  const idea = Buffer.from([0, 1, 128, 255]);
  await writeFile(join(from, "idea"), idea);
  return { scratch, from, to, idea };
}

it("preserves an occupied scratch destination and moves the alias after the owner sets it aside", async () => {
  const { root, store, current } = await namedWork();
  const { scratch, from, to, idea } = await scratchFolders(root);
  await mkdir(to);
  const other = Buffer.from("Existing destination\r\n");
  await writeFile(join(to, "other"), other);
  const version = stored(await store.version());
  const held = stored(await store.read({ reference: current }));
  const head = await git(root, ["rev-parse", "HEAD"]);

  const blocked = await runArc(args, root);
  expectExit(args, blocked);
  expect(JSON.parse(blocked.stdout)).toMatchObject({ status: "advisory",
    plan: { scratch: { moves: [], advisories: [{ reason: "occupied" }] } } });
  expect(await readFile(join(from, "idea"))).toEqual(idea);
  expect(await readFile(join(to, "other"))).toEqual(other);
  expect(stored(await store.version())).toBe(version);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);

  const saved = join(root, ".git", "saved-personal-folder");
  await rename(to, saved);
  const applied = await runArc(args, root);
  expectExit(args, applied);
  expect(JSON.parse(applied.stdout)).toMatchObject({ status: "applied", plan: { scratch: { moves: [{ from, to }] } } });
  expect(await readdir(scratch)).toEqual(["current"]);
  expect(await readFile(join(to, "idea"))).toEqual(idea);
  expect(await readFile(join(saved, "other"))).toEqual(other);
  expect(stored(await store.version())).toBe(version);
  expect(stored(await store.read({ reference: current }))).toEqual(held);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
}, SESSION_COMMAND_TIMEOUT_MS);

it("refuses changed supporting prose before writing and reconciles only managed targets on retry", async () => {
  const { root, store, current } = await namedWork();
  const { from, to, idea } = await scratchFolders(root);
  const { meta } = await seedWorkUnit(root, "dependent", { identity: sessionIdentity, bind: root });
  const initial = stored(await store.read({ reference: meta.reference }));
  await seedStore(root, sessionIdentity, [{ reference: initial.reference, expected: initial.version,
    content: writeMetaSessionContext(initial.content, "Keep former and `spec-former.md` as prose."),
    placement: { kind: "active" } }]);
  const { inbox, memory } = personalRecords(sessionIdentity);
  const sources = [inbox, memory] as const;
  for (const [index, content] of [inboxBytes, memoryBytes].entries()) {
    const record = stored(await store.read({ reference: sources[index]! }));
    await seedStore(root, sessionIdentity, [{ reference: record.reference, expected: record.version, content }]);
  }
  const before = stored(await store.read({ reference: inbox }));
  const support = stored(await store.read({ reference: memory }));
  const marker = await readFile(markerPath(root));
  const head = await git(root, ["rev-parse", "HEAD"]);
  const lock = join(root, ".git", "arc", "user", sessionIdentity, ".internal", ".notes.lock");
  await mkdir(dirname(lock), { recursive: true });
  const release = await holdPersonalLockInProcess(lock);
  const cli = runArc(args, root);
  let editedVersion;
  try {
    // The contender first attempts the notes lock after reading its complete support.
    await new Promise<void>((resolve, reject) => {
      const watcher = watch(dirname(lock), (_event, filename) => {
        if (!filename?.startsWith("..notes.lock.") || !filename.endsWith(".tmp")) return;
        clearTimeout(timer);
        watcher.close();
        resolve();
      });
      const timer = setTimeout(() => {
        watcher.close();
        reject(new Error("Reconcile did not reach the held notes lock"));
      }, 20_000);
      void cli.then(result => {
        clearTimeout(timer);
        watcher.close();
        reject(new Error(`Reconcile exited before reaching the lock: ${JSON.stringify(result)}`));
      }, reject);
    });
    await seedStore(root, sessionIdentity, [{ reference: memory, expected: support.version,
      content: memoryBytes + "\nA concurrent personal edit.\n" }]);
    editedVersion = stored(await store.version());
  } finally {
    await release();
  }

  const blocked = await cli;
  expectExit(args, blocked, 1);
  expect(JSON.parse(blocked.stdout)).toMatchObject({ status: "refused",
    refusal: { code: "version-conflict", condition: expect.stringContaining("changed after preparation"),
      remedy: { text: expect.stringMatching(/retry|again/iu) } } });
  expect(stored(await store.version())).toBe(editedVersion);
  expect(stored(await store.read({ reference: inbox }))).toEqual(before);
  expect(await readFile(join(from, "idea"))).toEqual(idea);
  await expect(access(to)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(markerPath(root))).toEqual(marker);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);

  const supporting = [current, meta.reference, memory];
  const records = await Promise.all(supporting.map(async reference => stored(await store.read({ reference }))));
  const histories = await Promise.all(supporting.map(async reference => stored(await store.history({ reference }))));
  expect(records[2]?.content).toBe(memoryBytes + "\nA concurrent personal edit.\n");
  const applied = await runArc(args, root);
  expectExit(args, applied);
  expect(JSON.parse(applied.stdout)).toMatchObject({ status: "applied", authority: { ref: "store" },
    plan: { edits: [expect.objectContaining({ path: `.arc/user/${sessionIdentity}/USER-INBOX.md` })],
      advisories: expect.arrayContaining([expect.objectContaining({ subject: "former" })]) } });
  expect(stored(await store.read({ reference: inbox })).content).toBe(inboxBytes.replaceAll("former", "current"));
  expect(await Promise.all(supporting.map(async reference => stored(await store.read({ reference }))))).toEqual(records);
  expect(await Promise.all(supporting.map(async reference => stored(await store.history({ reference }))))).toEqual(histories);
  expect(await readFile(join(to, "idea"))).toEqual(idea);
  await expect(access(from)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(markerPath(root))).toEqual(marker);
  expect(await git(root, ["rev-parse", "HEAD"])).toBe(head);
}, SESSION_COMMAND_TIMEOUT_MS);
