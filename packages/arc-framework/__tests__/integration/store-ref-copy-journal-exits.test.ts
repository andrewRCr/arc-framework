/** Terminal migration paths account copy effects before releasing their active journal. */
import { expect, it } from "vitest";
import { createRemoteMover, provenance, switchFixture } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createKindRegistry, RecordReferenceSchema, type RefStorePorts, type Store, type WriteCheck } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { join } from "node:path";

const pending = "refs/arc/tmp/migrate/pending-copy/";
const advisory = { condition: "Inspect the late combined documents.", remedy: { text: "Save their combined result." } };

it.each((["remote", "follow"] as const).flatMap(kind =>
  (["before-report", "before-confirm", "unread-accepted", "unread-unlanded", "unlanded", "advanced", "changed", "forwarded"] as const)
    .map(boundary => ({ kind, boundary }))))(
  "accounts a $kind copy at $boundary before ending and permits another migration", async ({ kind, boundary }) => {
  const followed = kind === "follow" ? await lateFollowFixture() : null, h = followed ?? await switchFixture();
  const original = followed ? followed.follower.ports : h.ports, root = followed ? followed.follower.root : h.a.root;
  const personal = "refs/arc/user/andrew/personal", registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  await original.exec("git", ["fetch", "--no-tags", kind === "remote" ? h.origin : h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const diverged = await plantRef(root, "refs/testing/diverged", [...entries,
    { path: "andrew/destination-late.md", content: "Destination data.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.destinationDirectory, `${diverged.tip}:${personal}`], { cwd: root });
  let armed = false, late = false, published = false;
  const check: WriteCheck = async () => armed ? [{ rule: "combined-documents", ...advisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => {
      if (step !== `${kind}.switched` || late) return;
      late = true; armed = true;
      const source = await plantRef(root, "refs/testing/late", [...entries,
        { path: "andrew/source-late.md", content: "Late source data.\n" }], { parents: [before] });
      await original.exec("git", ["push", h.origin, `${source.tip}:${personal}`], { cwd: root });
    },
    execInput: async (args, input, options) => {
      if (armed && args.includes("update-ref") && (boundary === "before-report" && input.includes("update refs/arc/tmp/migrate/copied/report ")
        || ["before-confirm", "changed", "forwarded"].includes(boundary) && published)) throw new Error("Interrupted late copy");
      return original.execInput(args, input, options);
    },
    exec: async (command, args, options) => {
      const copying = armed && args.includes("push") && args.includes(h.destinationDirectory);
      if (copying && ["unread-unlanded", "unlanded", "advanced"].includes(boundary)) throw makeGitProcessError({ command, args, timedOut: true, stderr: "No send before timeout." });
      const result = await original.exec(command, args, options);
      if (copying) {
        published = true;
        if (boundary === "unread-accepted") throw makeGitProcessError({ command, args, timedOut: true, stderr: "Receiver accepted before timeout." });
      }
      return result;
    } };
  const start = () => kind === "remote" ? invokeStoreMigrate(["--to", h.to], ports)
    : invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  if (boundary.startsWith("unread") || boundary === "unlanded" || boundary === "advanced") await start();
  else await expect(start()).rejects.toThrow("Interrupted late copy");
  expect((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toContain(pending + "record");
  armed = false;
  if (boundary === "advanced") {
    const progressed = await plantRef(root, "refs/testing/destination-progress", [...entries,
      { path: "andrew/destination-late.md", content: "Destination data.\n" }, { path: "andrew/progress.md", content: "A follower's progress.\n" }],
      { parents: [diverged.tip] });
    await original.exec("git", ["push", h.destinationDirectory, `${progressed.tip}:${personal}`], { cwd: root });
  }
  if (boundary === "changed") {
    const other = await plantRef(root, "refs/testing/unrelated-destination", [...entries,
      { path: "andrew/unrelated.md", content: "Independently replaced state.\n" }], { parents: [before] });
    await original.exec("git", ["push", "--force", h.destinationDirectory, `${other.tip}:${personal}`], { cwd: root });
  }
  if (boundary === "forwarded") {
    const mover = await createRemoteMover(h, h.destinationDirectory, "onward-copy-account-mover");
    const next = join(root, "onward-home.git");
    await original.exec("git", ["init", "--bare", next], { cwd: root });
    expect(await invokeStoreMigrate(["--to", next], mover.ports)).toMatchObject({ status: "ok" });
    expect((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"], { cwd: root })).stdout)
      .toBe("refs/arc/project/moved");
    expect((await original.exec("git", [`--git-dir=${next}`, "grep", "-F", "Late source data.", personal], { cwd: root })).stdout).toContain("Late source data.");
  }
  const retry: RefStorePorts = { ...ports, migrateStep: undefined, execInput: original.execInput,
    exec: async (command, args, options) => {
      if (boundary.startsWith("unread") && args.includes("fetch") && args.includes(h.destinationDirectory)) {
        throw makeGitProcessError({ command, args, timedOut: true, stderr: "Destination temporarily unreadable." });
      }
      return original.exec(command, args, options);
    } };
  const sourceBefore = boundary === "forwarded" ? (await original.exec("git", [`--git-dir=${h.origin}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"], { cwd: root })).stdout : undefined;
  const ended = await invokeStoreMigrate(boundary === "forwarded" || boundary === "advanced" ? [] : ["--leave-source"], retry);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Recorded copy did not end");
  if (boundary.startsWith("unread") || boundary === "changed" || boundary === "forwarded") {
    expect.soft(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("could not be established"), remedy: expect.anything() }));
    expect.soft(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/^If the interrupted copy landed.*Inspect the late combined documents\./u), remedy: advisory.remedy }));
  } else expect.soft(ended.result.notices.filter(row => row.condition.includes(advisory.condition))).toEqual(boundary === "unlanded" || boundary === "advanced" ? [] : [expect.objectContaining({ remedy: advisory.remedy })]);
  expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: root })).stdout).toBe("");
  if (boundary === "advanced") for (const text of ["Late source data.", "A follower's progress."]) {
    expect.soft((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", text, personal], { cwd: root })).stdout).toContain(text);
  }
  if (boundary.startsWith("unread") || boundary === "changed" || boundary === "forwarded") {
    const kept = (await original.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/accounted-copy/"], { cwd: root })).stdout;
    expect.soft(kept).toContain("/record");
    expect.soft(kept).toContain("/tips/");
  }
  if (boundary === "forwarded") {
    expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining(kind === "remote" ? "after its switch" : "ended this follow") }));
    expect((await original.exec("git", [`--git-dir=${h.origin}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"], { cwd: root })).stdout).toBe(sourceBefore);
    return;
  }
  const next = join(root, "later-home.git"); await original.exec("git", ["init", "--bare", next], { cwd: root });
  expect.soft(await invokeStoreMigrate(["--to", next], original)).toMatchObject({ status: "ok" });
}, 30_000);

it.each(["archived", "progressed", "ended twice"] as const)("restarts an unlanded first copy whose destination item was then %s and re-copies it", async activity => {
  const h = await switchFixture();
  const made = success(await h.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "copy-progress" } }),
    content: makeMetaFixture("copy-progress"), placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "activate" } }));
  if (made.reference.owner.type !== "work-item" || !made.reference.owner.uid) throw new Error("Expected a work UID");
  success(await h.store.push());
  const live = `refs/arc/work/${made.reference.owner.uid}`, history = `refs/arc/history/work/${made.reference.owner.uid}`;
  await h.a.git(["push", "--atomic", h.destinationDirectory, "refs/arc/project/registry:refs/arc/project/registry", `${live}:${live}`]);
  const companion = RecordReferenceSchema.parse({ owner: made.reference.owner, kind: "work-item/companion", key: "late.md" });
  const archive = async (store: Pick<Store, "read" | "write">, quarter = "2026-q4") => {
    const primary = success(await store.read({ reference: made.reference }));
    return store.write({ action: "put", reference: primary.reference, expected: primary.version, content: primary.content,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse(quarter) }, provenance: { verb: "archive", lifecycleAction: "archive" } });
  };
  // An archived item meets a late source edit; a progressed one is a destination ref the copy leaves alone; an item
  // ended twice is one the copy itself ends, then the destination ends in an earlier quarter.
  if (activity === "archived") {
    success(await h.store.write({ action: "put", reference: companion, expected: null, content: "Late source edit.\n", provenance }));
    success(await h.store.push());
  }
  if (activity === "ended twice") {
    success(await archive(h.store));
    success(await h.store.push());
  }
  let armed = true;
  await invokeStoreMigrate(["--to", h.to], { ...h.ports, exec: async (command, args, options) => {
    if (armed && args.includes("push") && args.includes(h.destinationDirectory)) throw makeGitProcessError({ command, args, timedOut: true, stderr: "No send before timeout." });
    return h.ports.exec(command, args, options);
  } });
  armed = false;
  const held = JSON.parse((await h.a.exec("git", ["cat-file", "blob", pending + "record"])).stdout) as { attempt: { changes: { ref: string; next: string | null; expected: string | null }[] } };
  const row = held.attempt.changes.find(change => change.ref === live);
  expect(row).toBeDefined();
  expect(row?.next === row?.expected).toBe(activity === "progressed");
  expect(row?.next === null).toBe(activity === "ended twice");
  const peer = await createRemoteMover(h, h.destinationDirectory, "destination-peer");
  success(activity === "progressed"
    ? await peer.store.write({ action: "put", reference: companion, expected: null, content: "Destination progress.\n", provenance })
    : await archive(peer.store, activity === "ended twice" ? "2026-q3" : "2026-q4"));
  success(await peer.store.push());
  const ended = await invokeStoreMigrate([], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect.soft((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  const holds = async (ref: string, text: string) => (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", text, ref])).stdout;
  if (activity === "archived") expect.soft(await holds(history, "Late source edit.")).toContain("Late source edit.");
  else if (activity === "progressed") {
    expect.soft(await holds(live, "Destination progress.")).toContain("Destination progress.");
    expect.soft(await holds("refs/arc/user/andrew/personal", "Shared state.")).toContain("Shared state.");
  } else {
    // The source's end holds and the destination's own is withdrawn.
    const destination = async (...args: string[]) => (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, ...args])).stdout;
    expect.soft((await destination("for-each-ref", "--format=%(refname)", live, history)).trim()).toBe(history);
    expect.soft(await destination("ls-tree", "-r", "--name-only", "refs/arc/archive/2026-q4")).toContain(made.reference.owner.uid);
    expect.soft(await destination("ls-tree", "-r", "--name-only", "refs/arc/archive/2026-q3")).not.toContain(made.reference.owner.uid);
  }
}, 60_000);

it("resumes a departure after its move transaction landed before journal handoff", async () => {
  const h = await missingSourceFixture(), original = h.follower.ports, root = h.follower.root;
  let interrupted = false;
  await expect(invokeStoreMigrate(["--leave-source", "--to", h.to], { ...original, execInput: async (args, input, options) => {
    const result = await original.execInput(args, input, options);
    if (!interrupted && args.includes("update-ref") && input.includes(" refs/arc/tmp/migrate/move ")) {
      interrupted = true; throw new Error("Move committed before handoff");
    }
    return result;
  } })).rejects.toThrow("Move committed before handoff");
  expect((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toContain(pending + "record");
  const resumed = await invokeStoreMigrate([], original);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Departure did not resume");
  expect.soft(resumed.result.notices.some(row => row.condition.includes("last view"))).toBe(true);
  expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: root })).stdout).toBe("");
  const next = join(root, "later-departure-home.git"); await original.exec("git", ["init", "--bare", next], { cwd: root });
  expect.soft(await invokeStoreMigrate(["--to", next], original)).toMatchObject({ status: "ok" });
}, 30_000);

it("accounts a recorded follow before its pre-switch stale-source ending", async () => {
  const h = await lateFollowFixture(), original = h.follower.ports, root = h.follower.root;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports: { ...original,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Recorded before switch"); },
  } })).rejects.toThrow("Recorded before switch");
  const personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const source = await plantRef(root, "refs/testing/recorded-source", [...entries,
    { path: "andrew/recorded-source.md", content: "Source text.\n" }], { parents: [before] });
  const destination = await plantRef(root, "refs/testing/recorded-destination", [...entries,
    { path: "andrew/recorded-destination.md", content: "Destination text.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.origin, `${source.tip}:${personal}`], { cwd: root });
  await original.exec("git", ["push", h.destinationDirectory, `${destination.tip}:${personal}`], { cwd: root });
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const check: WriteCheck = async () => [{ rule: "recorded-documents", ...advisory }];
  await expect(invokeStoreMigrate([], { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    execInput: async (args, input, options) => {
      if (args.includes("update-ref") && input.includes("update refs/arc/tmp/migrate/copied/report ")) throw new Error("Confirmed before report transfer");
      return original.execInput(args, input, options);
    },
  })).rejects.toThrow("Confirmed before report transfer");
  await h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
  const ended = await invokeStoreMigrate([], original);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Stale recorded follow did not end");
  expect.soft(ended.result.notices.filter(row => row.condition.includes(advisory.condition))).toEqual([expect.objectContaining({ remedy: advisory.remedy })]);
  expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: root })).stdout).toBe("");
  expect.soft(await invokeStoreMigrate(["--leave-source", "--to", h.to], original)).toMatchObject({ status: "ok" });
  const next = join(root, "post-stale-home.git"); await original.exec("git", ["init", "--bare", next], { cwd: root });
  expect.soft(await invokeStoreMigrate(["--to", next], original)).toMatchObject({ status: "ok" });
}, 30_000);
