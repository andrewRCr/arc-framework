import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { HistoryRefSchema, RecordReferenceSchema, type RecordReference } from "../../src/lib/store/index.js";

const meta = (name: string) => ({ action: "put" as const,
  reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name } }),
  expected: null, content: makeMetaFixture(name), placement: { kind: "active" as const },
  provenance: { verb: "start", lifecycleAction: "test" } });

function uidOf(reference: RecordReference): string {
  if (!("uid" in reference.owner) || !reference.owner.uid) throw new Error("Expected a UID-bearing item reference");
  return reference.owner.uid;
}

describe.each(["default", "separate"] as const)("state fetch in the %s layout", (layout) => {
  it("acquires state in its tracking namespace and excludes legacy personal refs", async () => {
    const h = await refSyncFixture(layout), item = success(await h.a.store.write(meta("alpha")));
    for (const [kind, owner, content, key] of [
      ["project-registry/identity", { type: "project", name: "project" }, '{"projectId":"34567890-1234-4234-8234-123456789abc"}'],
      ["project-inbox/inbox", { type: "project", name: "project" }, "# Inbox\n"],
      ["cohort/document", { type: "cohort", name: "group" }, "# Group\n\n**Purpose:** Group the work.\n"],
      ["personal/inbox", { type: "person", name: "andrew" }, "# User Inbox\n"],
      ["claims/groom", { type: "person", name: "andrew" }, "{}", "plan"],
    ] as const) {
      success(await h.a.store.write({ action: "put", reference: RecordReferenceSchema.parse({ kind, owner, ...key ? { key } : {} }),
        content, expected: null, provenance: { verb: "test", lifecycleAction: "seed" } }));
    }
    const otherPerson = createRefStore({ ...h.a.ports, identity: async () => SlugSchema.parse("alex"),
      actor: async () => "alex@00000000-0000-4000-8000-000000000001" });
    success(await otherPerson.write({ action: "put", expected: null, content: "# User Inbox\n",
      reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "alex" } }),
      provenance: { verb: "user", lifecycleAction: "seed" } }));
    const ended = success(await h.a.store.write(meta("ended")));
    success(await h.a.store.write({ ...meta("ended"), reference: ended.reference, expected: success(await h.a.store.read({ reference: ended.reference })).version,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const uid = uidOf(item.reference), ref = `refs/arc/work/${uid}`;
    const tip = (await h.a.git(["rev-parse", ref])).stdout;
    for (const residue of ["errands", "errands-remote", "sync-state"]) {
      await h.a.git(["update-ref", `refs/arc/user/andrew/${residue}`, tip]);
    }
    await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
    const codeTracking = (await h.b.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/"])).stdout;
    success(await h.b.store.pull());
    expect((await h.b.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/work/${uid}`])).stdout).toBe(tip);
    const fetched = (await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/"])).stdout;
    for (const path of ["/project/registry", "/project/inbox", "/cohort/", "/archive/2026-q4", "/user/andrew/personal", "/user/andrew/claims"]) {
      expect(fetched).toContain(path);
    }
    expect(fetched).not.toContain("/user/alex/");
    expect(fetched).not.toMatch(/errands|sync-state/u);
    // State acquisition leaves the code remote-tracking refs untouched.
    expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes/"])).stdout).toBe(codeTracking);
    expect(fetched).not.toContain("/history/");
  });
  it("prunes an observed tracking ref and acquires an unseen sibling without changing local refs", async () => {
    const h = await refSyncFixture(layout), first = success(await h.a.store.write(meta("first")));
    const firstRef = `refs/arc/work/${uidOf(first.reference)}`;
    await h.a.git(["push", h.remoteName, `${firstRef}:${firstRef}`]);
    success(await h.b.store.pull());
    await h.b.git(["fetch", h.remoteName, `${firstRef}:${firstRef}`]);
    const localBefore = (await h.b.git(["rev-parse", firstRef])).stdout;
    const second = success(await h.a.store.write(meta("second"))), secondRef = `refs/arc/work/${uidOf(second.reference)}`;
    await h.a.git(["push", h.remoteName, `:${firstRef}`, `${secondRef}:${secondRef}`]);
    success(await h.b.store.pull());
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.remoteName}/work/`])).stdout)
      .toBe(`refs/arc-remotes/${h.remoteName}/work/${uidOf(second.reference)}`);
    expect((await h.b.git(["rev-parse", firstRef])).stdout).toBe(localBefore);
  });

  it("fetches named history to resolve a saved view and tolerates an absent history name", async () => {
    const h = await refSyncFixture(layout), ended = success(await h.a.store.write(meta("ended")));
    const state = success(await h.a.store.version());
    const carrier = meta("carrier");
    success(await h.a.store.write({ ...carrier, content: makeMetaFixture("carrier", { stateAtHandoff: state }) }));
    success(await h.a.store.write({ ...meta("ended"), reference: ended.reference, expected: success(await h.a.store.read({ reference: ended.reference })).version,
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
    success(await h.b.store.pull());
    const history = HistoryRefSchema.parse(`refs/arc/history/work/${uidOf(ended.reference)}`);
    expect(await h.b.store.read({ reference: ended.reference, asOf: state })).toMatchObject({
      status: "refused", refusal: { code: "state-unresolvable", historyRefs: [history] },
    });
    const absent = HistoryRefSchema.parse("refs/arc/history/work/00000000-0000-4000-8000-000000000001");
    const pulled = success(await h.b.store.pull({ history: [history, absent] }));
    expect(pulled.pulls.every((outcome) => outcome.status !== "failed")).toBe(true);
    expect(success(await h.b.store.read({ reference: ended.reference, asOf: state })).content).toBe(meta("ended").content);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", `refs/arc-remotes/${h.remoteName}/history/`])).stdout)
      .toBe(`refs/arc-remotes/${h.remoteName}/history/work/${uidOf(ended.reference)}`);
  });

  it.each([false, true])("fetches and prunes an upstream by URL using project refs alone, existing state: %s", async (existing) => {
    const h = await refSyncFixture(layout), item = success(await h.a.store.write(meta("upstream-item")));
    success(await h.a.store.write({ action: "put", expected: null, content: "# User Inbox\n",
      reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } }),
      provenance: { verb: "user", lifecycleAction: "seed" } }));
    const ref = `refs/arc/work/${uidOf(item.reference)}`;
    await h.a.git(["push", h.remoteName, "refs/arc/*:refs/arc/*"]);
    if (existing) success(await h.b.store.write(meta("local")));
    if (layout === "separate") await h.b.git(["remote", "remove", "backing"]);
    await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "read"]);
    const result = success(await h.b.store.pull());
    expect(result.pulls).toMatchObject([{ status: "pulled", remote: "upstream", role: "read" }]);
    expect(result.pulls[0]?.families).not.toContain("personal");
    const tracking = `refs/arc-remotes/upstream/work/${uidOf(item.reference)}`;
    expect((await h.b.git(["rev-parse", tracking])).stdout).toBe((await h.a.git(["rev-parse", ref])).stdout);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc-remotes/upstream/user/"])).stdout).toBe("");
    await h.remote("git", ["update-ref", "-d", ref]);
    const pruned = success(await h.b.store.pull());
    expect(pruned.pulls).toMatchObject([{ status: "pulled", remote: "upstream", role: "read" }]);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", tracking])).stdout).toBe("");
  });

  it("completes empty state and absent history fetches without advertising held code", async () => {
    const h = await refSyncFixture(layout);
    const execute = h.b.ports.exec;
    h.b.ports.exec = (command, args, options) => execute(command, args, {
      ...options, signal: options?.signal ?? AbortSignal.timeout(2_000),
    });
    await h.b.git(["config", "protocol.version", "2"]);
    const trace = join(h.b.root, "state-fetch-packets.log");
    const codeTip = (await h.b.exec("git", ["rev-parse", "HEAD"])).stdout;
    vi.stubEnv("GIT_TRACE_PACKET", trace);
    try {
      const empty = success(await h.b.store.pull({ history: [HistoryRefSchema.parse(
        "refs/arc/history/work/00000000-0000-4000-8000-000000000001")] }));
      expect(empty.pulls).toMatchObject([{ status: "noop" }]);
      const item = success(await h.a.store.write(meta("later"))), ref = `refs/arc/work/${uidOf(item.reference)}`;
      await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
      const later = success(await h.b.store.pull());
      expect(later.pulls).toMatchObject([{ status: "pulled" }]);
      expect((await h.b.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/work/${uidOf(item.reference)}`])).stdout)
        .toBe((await h.a.git(["rev-parse", ref])).stdout);
      const packets = await readFile(trace, "utf8");
      expect(packets).toContain("command=fetch");
      expect(packets).not.toMatch(new RegExp(`fetch> have ${codeTip}`, "u"));
      expect(packets.match(/fetch> have [0-9a-f]+/gu) ?? []).toEqual([]);
    } finally { vi.unstubAllEnvs(); }
  }, 10_000);

  it("reports an unreachable remote and succeeds after its URL is repaired", async () => {
    const h = await refSyncFixture(layout), item = success(await h.a.store.write(meta("repair")));
    const ref = `refs/arc/work/${uidOf(item.reference)}`;
    await h.a.git(["push", h.remoteName, `${ref}:${ref}`]);
    await h.b.git(["remote", "set-url", h.remoteName, `${h.origin}/missing`]);
    const failed = success(await h.b.store.pull());
    expect(failed.pulls).toMatchObject([{ status: "failed", failure: { code: "unreachable", class: "recoverable",
      remedy: { text: expect.stringMatching(/retry/iu) } } }]);
    if (layout === "separate") {
      expect(failed.pulls[0]).toMatchObject({ failure: { remedy: { text: expect.stringContaining(h.b.gitDir ?? "") } } });
      expect(failed.pulls[0]).toMatchObject({ failure: { remedy: { text: expect.stringContaining("global Git") } } });
    }
    await h.b.git(["remote", "set-url", h.remoteName, h.origin]);
    const repaired = success(await h.b.store.pull());
    expect(repaired.pulls).toMatchObject([{ status: "pulled" }]);
    expect((await h.b.git(["rev-parse", `refs/arc-remotes/${h.remoteName}/work/${uidOf(item.reference)}`])).stdout)
      .toBe((await h.a.git(["rev-parse", ref])).stdout);
  });

});
