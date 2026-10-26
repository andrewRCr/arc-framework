/** Terminal migration paths account copy effects before releasing their active journal. */
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createKindRegistry, type RefStorePorts, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { join } from "node:path";

const pending = "refs/arc/tmp/migrate/pending-copy/";
const advisory = { condition: "Inspect the late combined documents.", remedy: { text: "Save their combined result." } };

it.each((["remote", "follow"] as const).flatMap(kind =>
  (["before-report", "before-confirm", "unread-accepted", "unread-unlanded", "unlanded", "changed"] as const)
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
        || ["before-confirm", "changed"].includes(boundary) && published)) throw new Error("Interrupted late copy");
      return original.execInput(args, input, options);
    },
    exec: async (command, args, options) => {
      const copying = armed && args.includes("push") && args.includes(h.destinationDirectory);
      if (copying && ["unread-unlanded", "unlanded"].includes(boundary)) throw makeGitProcessError({ command, args, timedOut: true, stderr: "No send before timeout." });
      const result = await original.exec(command, args, options);
      if (copying) {
        published = true;
        if (boundary === "unread-accepted") throw makeGitProcessError({ command, args, timedOut: true, stderr: "Receiver accepted before timeout." });
      }
      return result;
    } };
  const start = () => kind === "remote" ? invokeStoreMigrate(["--to", h.to], ports)
    : invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  if (boundary.startsWith("unread") || boundary === "unlanded") await start();
  else await expect(start()).rejects.toThrow("Interrupted late copy");
  expect((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toContain(pending + "record");
  armed = false;
  if (boundary === "changed") {
    const other = await plantRef(root, "refs/testing/unrelated-destination", [...entries,
      { path: "andrew/unrelated.md", content: "Independently replaced state.\n" }], { parents: [before] });
    await original.exec("git", ["push", "--force", h.destinationDirectory, `${other.tip}:${personal}`], { cwd: root });
  }
  const retry: RefStorePorts = { ...ports, migrateStep: undefined, execInput: original.execInput,
    exec: async (command, args, options) => {
      if (boundary.startsWith("unread") && args.includes("fetch") && args.includes(h.destinationDirectory)) {
        throw makeGitProcessError({ command, args, timedOut: true, stderr: "Destination temporarily unreadable." });
      }
      return original.exec(command, args, options);
    } };
  const ended = await invokeStoreMigrate(["--leave-source"], retry);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("Recorded copy did not end");
  if (boundary.startsWith("unread") || boundary === "changed") {
    expect.soft(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("could not be established"), remedy: expect.anything() }));
    expect.soft(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/^If the interrupted copy landed.*Inspect the late combined documents\./u), remedy: advisory.remedy }));
  } else expect.soft(ended.result.notices.filter(row => row.condition.includes(advisory.condition))).toEqual(boundary === "unlanded" ? [] : [expect.objectContaining({ remedy: advisory.remedy })]);
  expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: root })).stdout).toBe("");
  if (boundary.startsWith("unread") || boundary === "changed") {
    const kept = (await original.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/accounted-copy/"], { cwd: root })).stdout;
    expect.soft(kept).toContain("/record");
    expect.soft(kept).toContain("/tips/");
  }
  const next = join(root, "later-home.git"); await original.exec("git", ["init", "--bare", next], { cwd: root });
  expect.soft(await invokeStoreMigrate(["--to", next], original)).toMatchObject({ status: "ok" });
}, 30_000);

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
