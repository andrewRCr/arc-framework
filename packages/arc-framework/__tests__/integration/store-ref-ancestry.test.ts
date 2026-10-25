import { keeperDeleteFault } from "../helpers/store/keeper-delete-fault.js";
import { runStoreMigrate } from "../../src/lib/store/index.js";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { dirname, join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { preparedRefSync, refSyncFixture, type RefSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { FAMILY_IDS } from "../../src/lib/store/catalog.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

const provenance = { verb: "save", lifecycleAction: "save" };

function rewrittenFixture(layout: "default" | "separate", divergent = false) {
  return preparedRefSync(`rewritten in ${layout}${divergent ? ", divergent" : ""}`, layout, async (h) => {
    const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "ancestry.md" });
    const ref = "refs/arc/user/andrew/personal", tracking = `refs/arc-remotes/${h.remoteName}/user/andrew/personal`;
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "First published value.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const first = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
    const current = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: current.version, content: "Second published value.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const second = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
    const other = RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" });
    const otherContent = "# Atomic Inbox\n\n## Inbox\n\nIndependent published update.\n";
    success(await h.a.store.write({ action: "put", reference: other, expected: null, content: otherContent, provenance }));
    success(await h.a.store.push());
    if (divergent) {
      await h.a.git(["update-ref", ref, first, second]);
      const old = success(await h.a.store.read({ reference }));
      success(await h.a.store.write({ action: "put", reference, expected: old.version, content: "Rewritten remote value.\n", provenance }));
      await h.a.git(["push", `--force-with-lease=${ref}:${second}`, h.remoteName, `${ref}:${ref}`]);
    } else await h.remote("git", ["update-ref", ref, first, second]);
    return { reference, ref, tracking, first, second, other, otherContent };
  });
}

async function applyRemedy(h: Awaited<ReturnType<typeof rewrittenFixture>>, text: string, label: string) {
  const lines = text.slice(text.indexOf(label)).split("\n").slice(1);
  const output: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("'git'")) break;
    const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map((match) => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
    output.push((await h.b.exec("git", argv.slice(1), { cwd: h.b.root })).stdout);
  }
  return output;
}

async function trackingLockStore(h: RefSyncFixture, tracking: string, afterFailure?: () => Promise<void>) {
  const format = (await h.b.git(["rev-parse", "--show-ref-format"])).stdout.trim();
  const lock = join(h.b.gitDir ?? join(h.b.root, ".git"), format === "reftable" ? "reftable/tables.list.lock" : `${tracking}.lock`);
  let armed = true, nativeStdout = "", nativeStderr = "";
  const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
    if (!armed || !args.includes("fetch")) return h.b.ports.exec(command, args, options);
    armed = false;
    const fetchAt = args.indexOf("fetch");
    const failing = [...args.slice(0, fetchAt), "-c", "core.filesRefLockTimeout=0", "-c", "reftable.lockTimeout=0", ...args.slice(fetchAt)];
    await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "stale fixture lock\n");
    let failure: unknown;
    try { return await h.b.ports.exec(command, failing, options); }
    catch (error) { failure = error; if (isGitProcessError(error)) ({ stdout: nativeStdout, stderr: nativeStderr } = error); }
    finally { await rm(lock, { force: true }); }
    await afterFailure?.();
    throw failure;
  } });
  return { store, format, observed: () => ({ armed, nativeStdout, nativeStderr }) };
}

describe.each(["default", "separate"] as const)("rewrite refusal in the %s layout", (layout) => {
  it("keeps its last seen tracking and local tips, applies other refs, and reports three executable remedies", async () => {
    const h = await rewrittenFixture(layout), before = (await h.b.git(["rev-parse", h.ref])).stdout.trim();
    const pulled = success(await h.b.store.pull());
    const notice = pulled.pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "history-diverged");
    expect(notice).toMatchObject({ kind: "history-diverged", ref: h.ref, local: h.second, remote: h.first,
      condition: expect.any(String), remedy: { text: expect.stringMatching(/keep ours[\s\S]*take theirs[\s\S]*merge both/iu) } });
    if (notice?.kind !== "history-diverged") throw new Error("Missing rewrite refusal");
    for (const option of ["--force-with-lease", "--refmap=", "--no-filter", "--no-write-fetch-head", "--negotiation-tip="]) expect(notice.remedy.text).toContain(option);
    if (h.b.gitDir) expect(notice.remedy.text).toContain(`--git-dir=${h.b.gitDir}`);
    expect((await h.b.git(["rev-parse", h.ref])).stdout.trim()).toBe(before);
    expect((await h.b.git(["rev-parse", h.tracking])).stdout.trim()).toBe(h.second);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Second published value.\n");
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });

  it.each(["Keep ours", "Take theirs", "Merge both"] as const)("executes %s and returns to a clean pull", async (choice) => {
    const h = await rewrittenFixture(layout, true);
    const notice = success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "history-diverged");
    if (notice?.kind !== "history-diverged") throw new Error("Missing rewrite refusal");
    const output = await applyRemedy(h, notice.remedy.text, choice);
    if (choice !== "Keep ours") expect(output.join("\n")).toMatch(/^\+ [0-9a-f]+ [0-9a-f]+ refs\/arc-remotes\//mu);
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
    const record = success(await h.b.store.read({ reference: h.reference }));
    expect(record.content).toBe(choice === "Keep ours" ? "Second published value.\n" : "Rewritten remote value.\n");
    if (choice === "Merge both") {
      expect(record.conflicts).toHaveLength(1);
      expect(success(await h.b.store.history({ reference: h.reference })).map(({ content }) => content))
        .toEqual(expect.arrayContaining(["First published value.\n", "Second published value.\n", "Rewritten remote value.\n"]));
    }
  });

  it("keeps a pruned tip, repeatedly refuses a divergent return, and accepts the forced-fetch repair", async () => {
    const h = await rewrittenFixture(layout, true), seen = `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`;
    const remote = (await h.remote("git", ["rev-parse", h.ref])).stdout.trim();
    await h.remote("git", ["update-ref", "-d", h.ref]);
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(h.second);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.tracking])).stdout).toBe("");
    await h.remote("git", ["update-ref", h.ref, remote]);
    let remedy = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const notice = success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "history-diverged");
      expect(notice).toMatchObject({ kind: "history-diverged", ref: h.ref, local: h.second, remote });
      if (notice?.kind !== "history-diverged") throw new Error("Missing return refusal");
      remedy = notice.remedy.text;
      expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(h.second);
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", h.tracking])).stdout).toBe("");
      expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Second published value.\n");
    }
    await applyRemedy(h, remedy, "Take theirs");
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", seen])).stdout).toBe("");
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Rewritten remote value.\n");
  });

  it.each([false, true])("recovers returned-ref deletion locks and preserves unrelated errors (divergent %s)", async divergent => {
    for (const fault of ["lock", "unrelated"] as const) {
      const h = await rewrittenFixture(layout, divergent);
      const remote = (await h.remote("git", ["rev-parse", h.ref])).stdout.trim();
      const seen = `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`;
      await h.remote("git", ["update-ref", "-d", h.ref]);
      success(await h.b.store.pull());
      await h.remote("git", ["update-ref", h.ref, remote]);
      const broken = await keeperDeleteFault(h.b, divergent ? h.tracking : seen, fault);
      if (fault === "unrelated") await expect(broken.store.pull()).rejects.toBe(broken.unrelated);
      else expect(await broken.store.pull()).toMatchObject({ status: "refused", refusal: {
        code: "lock-held", lock: broken.lock, class: "recoverable", remedy: { text: expect.stringMatching(/retry/iu) },
      } });
      expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Second published value.\n");
      await broken.release();
      const retried = success(await h.b.store.pull());
      expect(retried.pulls.every(({ status }) => status !== "failed")).toBe(true);
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", seen])).stdout).toBe("");
      const record = success(await h.b.store.read({ reference: h.reference }));
      if (divergent) {
        expect(record.conflicts).toHaveLength(1);
        expect(success(await h.b.store.history({ reference: h.reference })).map(({ content }) => content))
          .toEqual(expect.arrayContaining(["Second published value.\n", "Rewritten remote value.\n"]));
      } else expect(record.content).toBe("Second published value.\n");
    }
  });

  if (layout === "default") {
    it("retains the last tip before Git starts its pruning fetch", async () => {
      const h = await rewrittenFixture(layout), seen = `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`;
      await h.remote("git", ["update-ref", "-d", h.ref]);
      const observations: string[] = [];
      const observer = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
        if (args.includes("fetch")) observations.push((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim());
        return h.b.ports.exec(command, args, options);
      } });
      success(await observer.pull());
      expect(observations).toEqual([h.second]);
      expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(h.second);
    });

    it("keeps a pruned tip when a sibling pull finishes while another pull is fetching", async () => {
      const h = await rewrittenFixture(layout, true), seen = `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`;
      const rewritten = (await h.remote("git", ["rev-parse", h.ref])).stdout.trim();
      await h.remote("git", ["update-ref", h.ref, h.second, rewritten]);
      let waiting!: () => void, finished!: () => void, pruned = false;
      const siblingWaiting = new Promise<void>((resolve) => { waiting = resolve; });
      const firstFinished = new Promise<void>((resolve) => { finished = resolve; });
      const sibling = createRefStore({ ...h.b.ports,
        lock: async (ref, waitMs) => { if (ref.includes("/tmp/seen/")) waiting(); return h.b.ports.lock(ref, waitMs); },
        exec: async (command, args, options) => {
          if (args.includes("fetch") && !pruned) {
            pruned = true; waiting(); await firstFinished;
            await h.remote("git", ["update-ref", "-d", h.ref]);
          }
          return h.b.ports.exec(command, args, options);
        } });
      let siblingPull: ReturnType<typeof sibling.pull> | undefined;
      const first = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
        if (args.includes("fetch") && !siblingPull) { siblingPull = sibling.pull(); await siblingWaiting; }
        return h.b.ports.exec(command, args, options);
      } });
      success(await first.pull()); finished();
      if (!siblingPull) throw new Error("The sibling pull never started");
      success(await siblingPull);
      expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(h.second);
      await h.remote("git", ["update-ref", h.ref, rewritten]);
      const notice = success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "history-diverged");
      expect(notice).toMatchObject({ kind: "history-diverged", ref: h.ref, local: h.second, remote: rewritten });
    });

    it("updates and releases a no-change pull's keepers in one transaction each", async () => {
      const h = await refSyncFixture(layout);
      success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("kept"), placement: { kind: "active" },
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "kept" }, kind: "work-item/meta" }),
        provenance: { verb: "start", lifecycleAction: "start" } }));
      success(await h.a.store.write({ action: "put", expected: null, content: "# Group\n\n**Purpose:** Keep refs.\n", provenance,
        reference: RecordReferenceSchema.parse({ owner: { type: "cohort", name: "group" }, kind: "cohort/document" }) }));
      success(await h.a.store.write({ action: "put", expected: null, content: "# Atomic Inbox\n\n## Inbox\n\nKept.\n", provenance,
        reference: RecordReferenceSchema.parse({ owner: { type: "project", name: "project" }, kind: "project-inbox/inbox" }) }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const tracked = (await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.remoteName}/`])).stdout.trim().split("\n");
      expect(tracked.length).toBeGreaterThan(2);
      let transactions = 0;
      const counted = createRefStore({ ...h.b.ports, execInput: async (args, input, options) => {
        if (args.includes("update-ref") && input.includes("refs/arc/tmp/seen/")) transactions++;
        return h.b.ports.execInput(args, input, options);
      } });
      expect(success(await counted.pull()).pulls.map(({ status }) => status)).toEqual(["noop"]);
      expect(transactions).toBe(2);
    });

    it("leaves the code checkout's FETCH_HEAD to the person through a pull", async () => {
      const h = await refSyncFixture(layout);
      success(await h.a.store.write({ action: "put", expected: null, content: "Fetched.\n", provenance,
        reference: RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "fetched.md" }) }));
      success(await h.a.store.push());
      const fetchHead = join(h.b.root, (await h.b.git(["rev-parse", "--git-path", "FETCH_HEAD"])).stdout.trim());
      await writeFile(fetchHead, "The person's own fetch.\n");
      expect(success(await h.b.store.pull()).pulls.map(({ status }) => status)).toEqual(["pulled"]);
      expect(await readFile(fetchHead, "utf8")).toBe("The person's own fetch.\n");
    });

    it.each(["ancestor", "descendant"] as const)("accepts an ordered %s return and drops the retained tip", async (direction) => {
      const h = await rewrittenFixture(layout), seen = `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`;
      let returned = h.first;
      if (direction === "descendant") {
        const old = success(await h.a.store.read({ reference: h.reference }));
        success(await h.a.store.write({ action: "put", reference: h.reference, expected: old.version, content: "Third published value.\n", provenance }));
        returned = (await h.a.git(["rev-parse", h.ref])).stdout.trim();
      }
      await h.remote("git", ["update-ref", "-d", h.ref]);
      success(await h.b.store.pull());
      expect((await h.b.git(["for-each-ref", "--format=%(objectname)", seen])).stdout.trim()).toBe(h.second);
      await h.a.git(["push", h.remoteName, `${returned}:${h.ref}`]);
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", seen])).stdout).toBe("");
      expect(success(await h.b.store.read({ reference: h.reference })).content)
        .toBe(direction === "descendant" ? "Third published value.\n" : "Second published value.\n");
      const pushed = success(await h.b.store.push());
      expect(pushed.publishes.every(({ status }) => status !== "failed")).toBe(true);
      expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(direction === "descendant" ? returned : h.second);
    });
  }

  it.each(["global", "local"] as const)("refuses a rewrite despite disabled forced-update checking in %s configuration", async (scope) => {
    const h = await rewrittenFixture(layout);
    if (scope === "global") {
      const config = join(h.b.root, "global.gitconfig");
      await h.b.exec("git", ["config", "--file", config, "fetch.showForcedUpdates", "false"]);
      vi.stubEnv("GIT_CONFIG_GLOBAL", config); onTestFinished(() => { vi.unstubAllEnvs(); });
    } else await h.b.git(["config", "fetch.showForcedUpdates", "false"]);
    const notices = success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices);
    expect(notices).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref: h.ref, local: h.second, remote: h.first }));
    expect((await h.b.git(["rev-parse", h.tracking])).stdout.trim()).toBe(h.second);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Second published value.\n");
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });

  if (layout === "default") {
    it.each(["archive", "abandon"] as const)("drops a pruned live tip after applying the item's %s", async (end) => {
      const h = await refSyncFixture(layout);
      const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("ending"),
        reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "ending" }, kind: "work-item/meta" }),
        placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
      success(await h.a.store.push()); success(await h.b.store.pull());
      const current = success(await h.a.store.read({ reference: made.reference })), owner = made.reference.owner;
      if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
      if (end === "archive") success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version,
        content: current.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
        provenance: { verb: end, lifecycleAction: end } }));
      else success(await h.a.store.batch({ writes: [
        { action: "remove", reference: made.reference, expected: current.version },
        { action: "put", reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }), expected: null,
          content: writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }) },
      ], provenance: { verb: end, lifecycleAction: end } }));
      success(await h.a.store.push());
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc/work/${owner.uid}`])).stdout).toBe("");
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc/tmp/seen/${h.remoteName}/work/${owner.uid}`])).stdout).toBe("");
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc/history/work/${owner.uid}`])).stdout.trim())
        .toBe(`refs/arc/history/work/${owner.uid}`);
    });

    it("replaces a rewritten forwarding record and never retains it after pruning", async () => {
      const h = await refSyncFixture(layout), ref = "refs/arc/project/moved";
      const tracking = `refs/arc-remotes/${h.remoteName}/project/moved`, seen = `refs/arc/tmp/seen/${h.remoteName}/project/moved`;
      const first = await plantRef(h.origin, ref, [{ path: "moved.json", content: '{"destination":"first"}\n' }], { gitDir: h.origin });
      success(await h.b.store.pull());
      expect((await h.b.git(["rev-parse", tracking])).stdout.trim()).toBe(first.tip);
      const second = await plantRef(h.origin, ref, [{ path: "moved.json", content: '{"destination":"second"}\n' }], { gitDir: h.origin });
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect((await h.b.git(["rev-parse", tracking])).stdout.trim()).toBe(second.tip);
      await h.remote("git", ["update-ref", "-d", ref]); success(await h.b.store.pull());
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking, seen, ref])).stdout).toBe("");
      await h.remote("git", ["update-ref", ref, first.tip]);
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect((await h.b.git(["rev-parse", tracking])).stdout.trim()).toBe(first.tip);
    });

    describe.each(["held", "pruned"] as const)("publication with %s tracking", (trackingState) => {
      it.each([false, true])("handles a refused ref with unpublished local writes = %s", async (dirty) => {
        const h = await rewrittenFixture(layout, true);
        const remote = (await h.remote("git", ["rev-parse", h.ref])).stdout.trim();
        if (trackingState === "pruned") {
          await h.remote("git", ["update-ref", "-d", h.ref]); success(await h.b.store.pull());
          await h.remote("git", ["update-ref", h.ref, remote]);
        } else success(await h.b.store.pull());
        if (dirty) {
          const old = success(await h.b.store.read({ reference: h.reference }));
          success(await h.b.store.write({ action: "put", reference: h.reference, expected: old.version,
            content: "Unpublished personal write.\n", provenance }));
        }
        const other = success(await h.b.store.read({ reference: h.other }));
        success(await h.b.store.write({ action: "put", reference: h.other, expected: other.version,
          content: `${other.content}\nLocal inbox write.\n`, provenance }));
        const inboxTip = (await h.remote("git", ["rev-parse", "refs/arc/project/inbox"])).stdout.trim();
        const store = createRefStore({ ...h.b.ports, ...createRefClock(new Date(0), 2500) });
        const result = success(await store.push());
        expect(result.pulls).toHaveLength(1);
        expect(result.pulls[0]?.notices).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref: h.ref }));
        if (dirty) {
          expect(result.publishes).toEqual([{ status: "failed", failure: expect.objectContaining({ code: "refused", class: "terminal" }),
            families: FAMILY_IDS.filter((family) => family !== "constitution" && family !== "project-machinery"), retryCount: 0, waitedMs: 0 }]);
          expect((await h.remote("git", ["rev-parse", "refs/arc/project/inbox"])).stdout.trim()).toBe(inboxTip);
        } else {
          expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
          expect((await h.remote("git", ["rev-parse", "refs/arc/project/inbox"])).stdout.trim()).not.toBe(inboxTip);
        }
        expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(remote);
      });
    });

    it("restores a pruned ref on push while the remote still has no returned history", async () => {
      const h = await rewrittenFixture(layout);
      await h.remote("git", ["update-ref", "-d", h.ref]); success(await h.b.store.pull());
      const result = success(await h.b.store.push());
      expect(result.publishes.every(({ status }) => status !== "failed")).toBe(true);
      expect((await h.remote("git", ["for-each-ref", "--format=%(objectname)", h.ref])).stdout.trim()).toBe(h.second);
      expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal`])).stdout).toBe("");
    });
  }

  it.each(["present", "absent", "removed"] as const)("reports a native tracking lock failure with the old tip %s and succeeds after release", async (old) => {
    const h = await rewrittenFixture(layout);
    await h.remote("git", ["update-ref", h.ref, h.second, h.first]);
    const current = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: current.version, content: "Third published value.\n", provenance }));
    await h.a.git(["push", h.remoteName, `${h.ref}:${h.ref}`]);
    if (old === "absent") await h.b.git(["update-ref", "-d", h.tracking]);
    if (old === "removed") await h.remote("git", ["update-ref", "-d", h.ref]);
    await h.b.git(["fetch", "--refmap=", "--no-tags", "--no-filter", "--negotiation-tip=refs/arc/*", h.remoteName,
      `refs/arc/project/inbox:refs/arc-remotes/${h.remoteName}/project/inbox`]);
    const { store, format, observed } = await trackingLockStore(h, h.tracking);
    const result = success(await store.pull());
    expect(observed().armed).toBe(false);
    if (format === "reftable" || old === "removed") {
      expect(observed().nativeStdout).toMatch(/^[ *-] [0-9a-f]+ [0-9a-f]+ refs\/arc-remotes\/[^ ]+\/user\/andrew\/personal$/mu);
    } else {
      // Git 2.55 marks the refused row `!` while Git 2.53 prints it as applied; both name the ref on stderr.
      expect(observed().nativeStdout).toMatch(/^[! *] [0-9a-f]+ [0-9a-f]+ refs\/arc-remotes\/[^ ]+\/user\/andrew\/personal$/mu);
      expect(observed().nativeStderr).toMatch(/(cannot lock ref '|fetching ref )refs\/arc-remotes\/[^ ']+\/user\/andrew\/personal/u);
    }
    expect(result.pulls.flatMap(({ notices }) => notices), JSON.stringify(result)).toEqual([expect.objectContaining({ kind: "tracking-update-failed", ref: h.ref })]);
    expect((await h.b.git(["for-each-ref", "--format=%(objectname)", h.tracking])).stdout.trim()).toBe(old === "absent" ? "" : h.second);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Second published value.\n");
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
    expect(success(await store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe(old === "removed" ? "Second published value.\n" : "Third published value.\n");
  });

  it("accepts a sibling's later tracking descendant after a failed fetch reported an earlier acquired tip", async () => {
    const h = await rewrittenFixture(layout);
    await h.remote("git", ["update-ref", h.ref, h.second, h.first]);
    const before = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: before.version, content: "Third published value.\n", provenance }));
    await h.a.git(["push", h.remoteName, `${h.ref}:${h.ref}`]);
    const { store, observed } = await trackingLockStore(h, `refs/arc-remotes/${h.remoteName}/project/inbox`, async () => {
      const current = success(await h.a.store.read({ reference: h.reference }));
      success(await h.a.store.write({ action: "put", reference: h.reference, expected: current.version, content: "Fourth published value.\n", provenance }));
      await h.a.git(["push", h.remoteName, `${h.ref}:${h.ref}`]);
      await h.b.git(["fetch", "--refmap=", "--no-tags", "--no-filter", "--negotiation-tip=refs/arc/*", h.remoteName, `${h.ref}:${h.tracking}`]);
    });
    const result = success(await store.pull());
    expect(observed().armed).toBe(false);
    expect(result.pulls.flatMap(({ notices }) => notices)).toEqual([expect.objectContaining({ kind: "tracking-update-failed", ref: "refs/arc/project/inbox" })]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Fourth published value.\n");
    expect(success(await store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: h.other })).content).toBe(h.otherContent);
  });

  it("refuses a Git lock already blocking keeper preparation and resumes after release", async () => {
    const h = await rewrittenFixture(layout);
    await h.remote("git", ["update-ref", h.ref, h.second, h.first]);
    const current = success(await h.a.store.read({ reference: h.reference }));
    success(await h.a.store.write({ action: "put", reference: h.reference, expected: current.version, content: "Third published value.\n", provenance }));
    await h.a.git(["push", h.remoteName, `${h.ref}:${h.ref}`]);
    const lock = join(h.b.gitDir ?? join(h.b.root, ".git"), layout === "separate" ? "reftable/tables.list.lock"
      : `refs/arc/tmp/seen/${h.remoteName}/user/andrew/personal.lock`);
    await mkdir(dirname(lock), { recursive: true }); await writeFile(lock, "stale fixture lock\n");
    try {
      expect(await h.b.store.pull()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable", lock,
        condition: expect.any(String), remedy: { text: expect.stringMatching(/retry/iu) } } });
      expect((await h.b.git(["rev-parse", h.tracking])).stdout.trim()).toBe(h.second);
      expect((await h.b.git(["rev-parse", h.ref])).stdout.trim()).toBe(h.second);
    } finally { await rm(lock, { force: true }); }
    expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: h.reference })).content).toBe("Third published value.\n");
  });

  it("keeps a live item whose tracking update failed beside its published lineage", async () => {
    const h = await refSyncFixture(layout);
    const made = success(await h.a.store.write({ action: "put", expected: null, content: makeMetaFixture("beside"),
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name: "beside" }, kind: "work-item/meta" }),
      placement: { kind: "active" }, provenance: { verb: "start", lifecycleAction: "start" } }));
    const owner = made.reference.owner;
    if (owner.type !== "work-item" || !owner.uid) throw new Error("Expected a minted work item");
    success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ owner, kind: "lineage/transition" }), expected: null,
      content: writeLineageRecord({ schemaVersion: 2, origin: { name: owner.name, uid: owner.uid }, kind: "abandon", successors: [], incoming: [] }),
      provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const current = success(await h.a.store.read({ reference: made.reference }));
    success(await h.a.store.write({ action: "put", reference: made.reference, expected: current.version,
      content: `${current.content}\nLater edit.\n`, placement: current.placement, provenance }));
    success(await h.a.store.push());
    const live = `refs/arc/work/${owner.uid}`, before = (await h.b.git(["rev-parse", live])).stdout.trim();
    const { store, observed } = await trackingLockStore(h, `refs/arc-remotes/${h.remoteName}/work/${owner.uid}`);
    const result = success(await store.pull());
    expect(observed().armed).toBe(false);
    expect(result.pulls.flatMap(({ notices }) => notices)).toEqual([expect.objectContaining({ kind: "tracking-update-failed", ref: live })]);
    expect((await h.b.git(["rev-parse", live])).stdout.trim()).toBe(before);
    expect(success(await store.pull()).pulls.flatMap(({ notices }) => notices)).toEqual([]);
    expect(success(await h.b.store.read({ reference: made.reference })).content).toContain("Later edit.");
  });
});

it("keeps ours at the designated remote's push URL when it differs from its fetch URL", async () => {
  const h = await rewrittenFixture("default", true), target = join(h.b.root, "push-target.git");
  const observed = (await h.remote("git", ["rev-parse", h.ref])).stdout.trim();
  await h.b.exec("git", ["clone", "--mirror", h.origin, target]);
  await h.b.git(["remote", "add", "state", h.origin]);
  await h.b.git(["config", "remote.origin.arc-state", "off"]);
  await h.b.git(["config", "remote.state.arc-state", "push"]);
  await h.b.git(["config", "remote.state.pushurl", target]);
  expect((await runStoreMigrate(h.b.ports)).status).toBe("ok");
  await h.b.git(["update-ref", "refs/arc-remotes/state/user/andrew/personal", h.second]);
  const notice = success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).find(({ kind }) => kind === "history-diverged");
  if (notice?.kind !== "history-diverged") throw new Error("Missing rewrite refusal");
  await applyRemedy(h, notice.remedy.text, "Keep ours");
  expect((await h.b.exec("git", [`--git-dir=${target}`, "rev-parse", h.ref])).stdout.trim()).toBe(h.second);
  expect((await h.remote("git", ["rev-parse", h.ref])).stdout.trim()).toBe(observed);
  await h.remote("git", ["update-ref", h.ref, h.second, observed]);
  expect(success(await h.b.store.pull()).pulls.flatMap(({ notices }) => notices).some(({ kind }) => kind === "history-diverged")).toBe(false);
});
