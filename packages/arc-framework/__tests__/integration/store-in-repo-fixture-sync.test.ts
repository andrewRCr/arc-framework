/** Real remote outcomes retained beside the repository fixture's named sync limitations. */
import { describe, expect, it } from "vitest";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { inRepoRemote } from "../helpers/store/in-repo-remote.js";
import { syncErrandRef, syncNotesRef, syncInbox, syncPut, syncErrand } from "../helpers/store/sync-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { makeCommit, makeGitExec } from "../helpers/integration.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/index.js";
import { transientContent } from "../helpers/store/in-repo-substrates.js";

describe("repository fixture existing sync behavior", () => {
  it("publishes every personal and transient role to the actual remote", async () => {
    const fixture = await createInRepoFixture();
    const remote = fixture.remote(true);
    if (!remote) throw new Error("Expected an actual remote store");
    const records = [];
    for (const kind of ["personal/inbox", "personal/working-memory", "personal/document", "personal/session-context", "work-item/record", "claims/groom", "claims/housekeep"] as const) records.push(await seed(fixture, fixture.reference(kind)));
    expect(success(await fixture.store.sync()).publishes.map((publish) => publish.status)).toEqual(["pushed", "pushed"]);
    for (const record of records) expect(success(await remote.read({ reference: record.reference })).content).toBe(record.content);
  });

  it("retains pushed on repeated notes saves and unchanged Errand pushes", async () => {
    const h = await inRepoRemote();
    h.remote(true);
    await h.a.inbox("Exact local personal bytes\n");
    success(await h.a.store.write(syncPut()));
    const remote = makeGitExec(h.origin);
    const head = (await h.a.exec("git", ["rev-parse", "HEAD"])).stdout;
    const errandTip = (await remote("git", ["rev-parse", syncErrandRef])).stdout;
    for (let repetition = 0; repetition < 2; repetition++) {
      expect(success(await h.a.store.sync()).publishes).toEqual([
        { status: "pushed", families: ["personal"] }, { status: "pushed", families: ["work-item", "claims"] },
      ]);
      expect(JSON.parse((await remote("git", ["notes", "--ref", syncNotesRef, "show", head])).stdout).files["USER-INBOX.md"]).toBe("Exact local personal bytes\n");
      expect((await remote("git", ["rev-parse", syncErrandRef])).stdout).toBe(errandTip);
      expect(success(await h.a.store.read({ reference: syncInbox })).content).toBe("Exact local personal bytes\n");
    }
  });

  it("conflicts after only the remote edits an existing transient entry", async () => {
    const fixture = await createInRepoFixture();
    const remote = fixture.remote(true);
    if (!remote) throw new Error("Expected an actual remote store");
    const local = await seed(fixture, fixture.reference("work-item/record"));
    const base = success(await remote.read({ reference: local.reference }));
    const changed = fixture.content(local.reference, "changed");
    success(await remote.write(update(fixture, base, changed)));
    expect(success(await fixture.store.sync()).publishes[1]).toMatchObject({ status: "conflict", families: ["work-item", "claims"], condition: expect.stringContaining(local.reference.owner.name) });
    expect(success(await fixture.store.read({ reference: local.reference })).content).toBe(local.content);
    expect(success(await remote.read({ reference: local.reference })).content).toBe(changed);
  });

  it("leaves personal working bytes unchanged after a remote-only notes edit", async () => {
    const fixture = await createInRepoFixture();
    const remote = fixture.remote(true);
    if (!remote) throw new Error("Expected an actual remote store");
    const local = await seed(fixture, fixture.reference("personal/document"));
    success(await fixture.store.sync());
    const base = success(await remote.read({ reference: local.reference }));
    const changed = fixture.content(local.reference, "changed");
    success(await remote.write(update(fixture, base, changed)));
    expect(success(await fixture.store.sync()).publishes[0]).toEqual({ status: "reconciled", families: ["personal"] });
    expect(success(await fixture.store.read({ reference: local.reference })).content).toBe(local.content);
    expect(success(await remote.read({ reference: local.reference })).content).toBe(changed);
  });

  it("reconciles disjoint transient entries into both local and remote snapshots", async () => {
    const h = await inRepoRemote();
    success(await h.a.store.write(syncPut()));
    h.remote(true);
    const other = recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" }));
    const content = transientContent(other);
    success(await h.b.store.write({ ...syncPut(), reference: other, content }));
    expect(success(await h.a.store.sync()).publishes[1]).toEqual({ status: "reconciled", families: ["work-item", "claims"] });
    expect(success(await h.a.store.read({ reference: syncErrand })).content).toBe(syncPut().content);
    expect(success(await h.a.store.read({ reference: other })).content).toBe(content);
    expect((await makeGitExec(h.origin)("git", ["ls-tree", "--name-only", syncErrandRef])).stdout.split("\n").sort()).toEqual(["alpha", "beta"]);
    expect(success(await h.remoteStore.read({ reference: other })).content).toBe(content);
    expect(success(await h.remoteStore.read({ reference: syncErrand })).content).toBe(syncPut().content);
  });

  it("reconciles both remote notes manifests while preserving each personal working file", async () => {
    const h = await inRepoRemote();
    h.remote(true);
    const aCommit = await makeCommit(h.cloneA, "Clone A personal notes");
    await h.a.exec("git", ["push", "origin", "HEAD:refs/heads/notes-a"]);
    const bCommit = await makeCommit(h.cloneB, "Clone B personal notes");
    await h.b.exec("git", ["push", "origin", "HEAD:refs/heads/notes-b"]);
    await h.a.exec("git", ["fetch", "origin"]);
    await h.b.exec("git", ["fetch", "origin"]);
    await h.a.inbox("Clone A unchanged bytes\n");
    await h.b.inbox("Clone B unchanged bytes\n\n");
    expect(success(await h.a.store.sync()).publishes[0]).toEqual({ status: "pushed", families: ["personal"] });
    expect(success(await h.b.store.sync()).publishes[0]).toEqual({ status: "reconciled", families: ["personal"] });
    const remote = makeGitExec(h.origin);
    for (const [commit, content] of [[aCommit, "Clone A unchanged bytes\n"], [bCommit, "Clone B unchanged bytes\n\n"]] as const) {
      expect(JSON.parse((await remote("git", ["notes", "--ref", syncNotesRef, "show", commit])).stdout)).toMatchObject({ files: { "USER-INBOX.md": content } });
    }
    expect(success(await h.a.store.read({ reference: syncInbox })).content).toBe("Clone A unchanged bytes\n");
    expect(success(await h.b.store.read({ reference: syncInbox })).content).toBe("Clone B unchanged bytes\n\n");
    expect((await h.b.exec("git", ["rev-parse", syncNotesRef])).stdout).toBe((await remote("git", ["rev-parse", syncNotesRef])).stdout);
  });
});
