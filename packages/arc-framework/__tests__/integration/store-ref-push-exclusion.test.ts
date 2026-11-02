import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { parseGitVersion } from "../../src/lib/git/version-floor.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef, type PlantTreeEntry } from "../helpers/store/ref-plant.js";
import { createRefStore, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

const provenance = { verb: "edit", lifecycleAction: "save" };

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

describe.each(["default", "separate"] as const)("publication exclusion in the %s layout", (layout) => {
  it.each(["linear", "merged"] as const)("holds back the transitive closure of unpublished batches with %s history", async (history) => {
    const h = await refSyncFixture(layout);
    const a = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("alpha"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const b = success(await h.a.store.write({ action: "put", expected: null, content: "# Group\n\n**Purpose:** Connect writes.\n",
      reference: RecordReferenceSchema.parse({ owner: { type: "cohort", name: "group" }, kind: "cohort/document" }), provenance }));
    const c = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "chain.md" });
    success(await h.a.store.write({ action: "put", reference: c, expected: null, content: "Original personal content.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const refs = [expandStoredPath(a.reference).ref, expandStoredPath(b.reference).ref, expandStoredPath(c).ref];
    const published = await Promise.all(refs.map(async (ref) => (await h.remote("git", ["rev-parse", ref])).stdout.trim()));
    const ar = success(await h.a.store.read({ reference: a.reference })), br = success(await h.a.store.read({ reference: b.reference }));
    const review = RecordReferenceSchema.parse({ owner: a.reference.owner, kind: "review/evidence", key: "unpublished" });
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: ar.reference, expected: ar.version, content: `${ar.content}\nUnpublished work edit.\n`, placement: ar.placement },
      { action: "put", reference: br.reference, expected: br.version, content: `${br.content}\nFirst cohort edit.\n`, placement: br.placement },
      { action: "put", reference: review, expected: null, content: "{}" },
    ], provenance }));
    if (history === "merged") {
      const cohortRef = refs[1]!, current = (await h.a.git(["rev-parse", cohortRef])).stdout.trim();
      const { stdout: tree } = await h.a.git(["rev-parse", `${current}^{tree}`]);
      const { stdout: merge } = await h.a.git(["-c", "user.name=Fixture writer", "-c", "user.email=fixture@example.com",
        "commit-tree", tree.trim(), "-p", published[1]!, "-p", current, "-m", "Join independently held cohort history"]);
      await h.a.git(["update-ref", cohortRef, merge.trim(), current]);
    }
    const bnext = success(await h.a.store.read({ reference: b.reference })), cr = success(await h.a.store.read({ reference: c }));
    success(await h.a.store.batch({ writes: [
      { action: "put", reference: bnext.reference, expected: bnext.version, content: `${bnext.content}\nSecond cohort edit.\n`, placement: bnext.placement },
      { action: "put", reference: c, expected: cr.version, content: "Unpublished personal edit.\n" },
    ], provenance }));
    const home = expandStoredPath(a.reference), parent = (await h.a.git(["rev-parse", home.ref])).stdout.trim();
    const rows = (await h.a.git(["ls-tree", "-r", "--format=%(objectname) %(path)", home.ref])).stdout.split("\n").filter(Boolean);
    const entries: PlantTreeEntry[] = rows.flatMap((row) => {
      const at = row.indexOf(" "), path = row.slice(at + 1);
      return path === home.metadataPath ? [] : [{ path, oid: row.slice(0, at), mode: "100644" as const }];
    });
    await plantRef(h.a.root, home.ref, entries, { parents: [parent], gitDir: h.a.gitDir });
    const kept = await Promise.all(refs.map(async (ref) => (await h.a.git(["rev-parse", ref])).stdout.trim()));
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent inbox edit.\n";
    success(await h.a.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    const result = PushResultSchema.parse(success(await h.a.store.push()));
    expect(await Promise.all(refs.map(async (ref) => (await h.remote("git", ["rev-parse", ref])).stdout.trim()))).toEqual(published);
    expect(await Promise.all(refs.map(async (ref) => (await h.a.git(["rev-parse", ref])).stdout.trim()))).toEqual(kept);
    for (const family of ["work-item", "cohort", "personal", "review"] as const) {
      expect(result.publishes.find(({ families }) => families.includes(family)))
        .toMatchObject({ status: "failed", failure: { code: "refused", class: "terminal" } });
    }
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    const families = result.publishes.flatMap(({ families }) => families);
    expect(new Set(families).size).toBe(families.length);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: inbox })).content).toBe(content);
    expect(success(await h.b.store.read({ reference: c })).content).toBe("Original personal content.\n");
  });

  it("holds a batch sharing an item whose remote end has no retained history and resumes after restoration", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("pending"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "pending" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "pending.md" });
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published personal.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const before = success(await h.b.store.read({ reference: made.reference })), other = success(await h.b.store.read({ reference: personal }));
    success(await h.b.store.batch({ writes: [
      { action: "put", reference: before.reference, expected: before.version, content: `${before.content}\nPending work.\n`, placement: before.placement },
      { action: "put", reference: personal, expected: other.version, content: "Pending personal.\n" },
    ], provenance }));
    const remote = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    const live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    const retained = (await h.a.git(["rev-parse", history])).stdout.trim();
    await h.remote("git", ["update-ref", "-d", history]);
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent of the pending end.\n";
    success(await h.b.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
    const personalRef = expandStoredPath(personal).ref, kept = (await h.b.git(["rev-parse", personalRef])).stdout.trim();
    const result = PushResultSchema.parse(success(await h.b.store.push()));
    for (const family of ["work-item", "personal"] as const) expect(result.publishes.find(({ families }) => families.includes(family)))
      .toMatchObject({ status: "failed", failure: { code: "refused", remedy: { text: expect.stringContaining(history) } } });
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-pending", ref: history }));
    expect((await h.remote("git", ["show", `${personalRef}:${expandStoredPath(personal).path}`])).stdout.trimEnd()).toBe("Published personal.");
    expect((await h.b.git(["rev-parse", personalRef])).stdout.trim()).toBe(kept);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    await h.a.git(["push", h.remoteName, `${retained}:${history}`]);
    expect(success(await h.b.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: personal })).content).toBe("Pending personal.\n");
    expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
  });

  it("publishes beside an item whose remote end has no retained history when this clone holds no write on it", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("unwritten"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "unwritten" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const remote = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
    success(await h.a.store.push());
    const live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
    await h.remote("git", ["update-ref", "-d", history]);
    const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    success(await h.b.store.write({ action: "put", reference: inbox, expected: null,
      content: "# Atomic Inbox\n\n## Inbox\n\nPublished beside the pending end.\n", provenance }));
    const result = PushResultSchema.parse(success(await h.b.store.push()));
    expect(result.publishes.every(({ status }) => status !== "failed"), JSON.stringify(result.publishes)).toBe(true);
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    expect(result.pulls.flatMap(({ notices }) => notices)).toContainEqual(expect.objectContaining({ kind: "end-pending", ref: history }));
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
  });
});

async function filesFixture() {
  const h = await refSyncFixture();
  const version = parseGitVersion((await h.b.git(["--version"])).stdout);
  if (!version) throw new Error("Git did not report a version");
  if (version.major < 2 || version.major === 2 && version.minor < 53) return null;
  if ((await h.b.git(["rev-parse", "--show-ref-format"])).stdout.trim() !== "files") {
    await h.b.git(["refs", "migrate", "--ref-format=files"]);
  }
  return h;
}

function lockedTrackingStore(h: RefSyncFixture, ref: string) {
  const clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  const tracking = ref.replace("refs/arc/", "refs/arc-remotes/origin/"), lock = join(h.b.root, ".git", `${tracking}.lock`);
  let fetches = 0, released = false;
  const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
    if (!args.includes("fetch")) return h.b.ports.exec(command, args, options);
    fetches += 1;
    if (fetches === 1) {
      await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "Stranded tracking lock.\n");
      const then = new Date(clock.at().getTime() - 300_000);
      await utimes(lock, then, then);
    }
    // A retrying publisher reaches its deadline; exclusion can publish healthy refs on its first attempt.
    if (fetches > 6 && !released) clock.advance(120_000);
    const at = args.indexOf("fetch");
    return h.b.ports.exec(command, [...args.slice(0, at), "-c", "core.filesRefLockTimeout=0", ...args.slice(at)], options);
  } });
  return { store, lock, release: async () => { released = true; await rm(lock, { force: true }); } };
}

it("publishes independent refs beside a stranded tracking lock", async context => {
  const h = await filesFixture();
  if (!h) { context.skip(); return; }
  const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "shared.md" });
  const local = RecordReferenceSchema.parse({ ...personal, key: "local.md" });
  const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Before.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.a.store.read({ reference: personal }));
  success(await h.a.store.write({ action: "put", reference: personal, expected: before.version, content: "Incoming.\n", provenance }));
  success(await h.a.store.push());
  success(await h.b.store.write({ action: "put", reference: local, expected: null, content: "Local.\n", provenance }));
  const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent publication.\n";
  success(await h.b.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
  const ref = expandStoredPath(personal).ref, remote = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  const blocked = lockedTrackingStore(h, ref);
  try {
    const result = PushResultSchema.parse(success(await blocked.store.push()));
    const notice = result.pulls.flatMap(({ notices }) => notices).find(notice => notice.kind === "tracking-update-failed" && notice.ref === ref);
    if (notice?.kind !== "tracking-update-failed") throw new Error("Expected a tracking lock notice");
    expect(notice.condition).toContain(blocked.lock);
    expect(result.publishes.find(({ families }) => families.includes("personal"))).toMatchObject({ status: "failed",
      failure: { code: "refused", condition: notice.condition, remedy: notice.remedy } });
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    expect((await h.remote("git", ["rev-parse", ref])).stdout.trim()).toBe(remote);
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("Before.\n");
    expect(success(await h.b.store.read({ reference: local })).content).toBe("Local.\n");
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: inbox })).content).toBe(content);
  } finally { await blocked.release(); }
  expect(success(await blocked.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.a.store.pull());
  expect(success(await h.a.store.read({ reference: local })).content).toBe("Local.\n");
  expect(success(await h.b.store.read({ reference: personal })).content).toBe("Incoming.\n");
}, 30_000);

it("reports a valid excluded publish when a tracking failure replaces a pending-end notice", async context => {
  const h = await filesFixture();
  if (!h) { context.skip(); return; }
  const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("locked-end"),
    reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "locked-end" }, kind: "work-item/meta" }),
    placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
  const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "pending.md" });
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published personal.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const before = success(await h.b.store.read({ reference: made.reference })), other = success(await h.b.store.read({ reference: personal }));
  success(await h.b.store.batch({ writes: [
    { action: "put", reference: before.reference, expected: before.version, content: `${before.content}\nPending work.\n`, placement: before.placement },
    { action: "put", reference: personal, expected: other.version, content: "Pending personal.\n" },
  ], provenance }));
  const remote = success(await h.a.store.read({ reference: made.reference }));
  success(await h.a.store.write({ action: "put", reference: remote.reference, expected: remote.version, content: remote.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await h.a.store.push());
  const live = expandStoredPath(made.reference).ref, history = live.replace("refs/arc/", "refs/arc/history/");
  const retained = (await h.a.git(["rev-parse", history])).stdout.trim();
  await h.remote("git", ["update-ref", "-d", history]);
  const inbox = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
  const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent of the locked end.\n";
  success(await h.b.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
  const kept = (await h.b.git(["rev-parse", live])).stdout.trim(), blocked = lockedTrackingStore(h, live);
  try {
    const result = PushResultSchema.parse(success(await blocked.store.push()));
    const notices = result.pulls.flatMap(({ notices }) => notices);
    const notice = notices.find(notice => notice.kind === "tracking-update-failed" && notice.ref === live);
    if (notice?.kind !== "tracking-update-failed") throw new Error("Expected the live tracking failure");
    expect(notice.condition).toContain(blocked.lock);
    expect(notices.some(notice => notice.kind === "end-pending" && notice.ref === history)).toBe(false);
    for (const family of ["work-item", "personal"] as const) {
      expect(result.publishes.find(({ families }) => families.includes(family))).toMatchObject({ status: "failed",
        failure: { code: "refused", condition: notice.condition, remedy: notice.remedy } });
    }
    expect(result.publishes.find(({ families }) => families.includes("project-inbox"))?.status).toBe("pushed");
    expect((await h.b.git(["rev-parse", live])).stdout.trim()).toBe(kept);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", live])).stdout).toBe("");
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: inbox })).content).toBe(content);
  } finally { await blocked.release(); }
  await h.a.git(["push", h.remoteName, `${retained}:${history}`]);
  expect(success(await blocked.store.push()).publishes.every(({ status }) => status !== "failed")).toBe(true);
  success(await h.a.store.pull());
  expect(success(await h.a.store.read({ reference: personal })).content).toBe("Pending personal.\n");
  expect(success(await h.b.store.read({ reference: made.reference })).placement?.kind).toBe("completed");
}, 30_000);
