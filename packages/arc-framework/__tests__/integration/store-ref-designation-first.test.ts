/** First state-remote choices exercised against real repositories. */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { RecordReferenceSchema, runStoreMigrate } from "../../src/lib/store/index.js";

async function fresh(layout: "default" | "separate" = "default", published = true) {
  const h = await refSyncFixture(layout);
  if (published) {
    success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } }),
      content: '{"projectId":"34567890-1234-4234-8234-123456789abc"}',
      provenance: { verb: "init", lifecycleAction: "seed" } }));
    success(await h.a.store.push());
  }
  await h.b.git(["config", "--unset", `remote.${h.remoteName}.arc-state`]);
  return h;
}

function question(remote: string, choices: string[], recommended: string) {
  return { status: "designation-needed", remote, choices,
    remedy: { argv: ["arc", "store", "remote", remote, recommended] } };
}

async function roles(h: Awaited<ReturnType<typeof fresh>>): Promise<string> {
  return (await h.b.exec("git", ["config", "--list"])).stdout;
}

describe("first state designation", () => {
  it("sets the sole registry-bearing code remote without asking and acquires its state", async () => {
    const h = await fresh();
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([]);
    expect(await roles(h)).toContain("remote.origin.arc-state=push");
    expect(success(await h.b.store.read({ reference: RecordReferenceSchema.parse({
      kind: "project-registry/identity", owner: { type: "project", name: "project" },
    }) })).content).toContain("34567890-1234-4234-8234-123456789abc");
  });

  it("asks before moving an existing separate store onto the code remote", async () => {
    const h = await fresh("separate");
    success(await h.b.store.write({ action: "put", expected: null, content: "# User Inbox\n",
      reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } }),
      provenance: { verb: "user", lifecycleAction: "seed" } }));
    await h.b.git(["remote", "remove", "backing"]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("origin", ["push", "off"], "push")]);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("asks about the code remote when no remote holds a registry", async () => {
    const h = await fresh("default", false);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("origin", ["push", "off"], "push")]);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("prefers a registry-bearing upstream's three choices over the code remote", async () => {
    const h = await fresh();
    const empty = join(h.cloneB, "empty.git");
    await h.b.exec("git", ["init", "--bare", empty]);
    await h.b.exec("git", ["remote", "set-url", "origin", empty]);
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("upstream", ["push", "read", "off"], "read")]);
    expect(await roles(h)).not.toContain("arc-state");
  });

  it("keeps a store-directory backing as the only candidate despite an upstream push key", async () => {
    const h = await fresh("separate");
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    const result = success(await h.b.store.pull());
    expect(result.states).toMatchObject([question("backing", ["push", "off"], "push")]);
    expect(result.pulls).toEqual([]);
    expect((await h.b.git(["config", "--list"])).stdout).not.toContain("remote.backing.arc-state");
  });

  it("installs a first tracked backing pointer and asks only about backing", async () => {
    const h = await fresh("default", false);
    const store = createRefStore({ ...h.b.ports, backingRepository: async () => h.origin });
    expect(success(await store.pull()).states).toMatchObject([question("backing", ["push", "off"], "push")]);
    expect((await h.b.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("asks for other registry-bearing remotes in Git order after each is answered", async () => {
    const h = await fresh();
    await h.b.exec("git", ["remote", "add", "zeta", h.origin]);
    await h.b.exec("git", ["remote", "add", "alpha", h.origin]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("alpha", ["push", "read", "off"], "read")]);
    await h.b.exec("git", ["config", "remote.alpha.arc-state", "off"]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("zeta", ["push", "read", "off"], "read")]);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("has no code remote when several remotes have no origin or push default", async () => {
    const h = await fresh();
    await h.b.exec("git", ["remote", "rename", "origin", "zeta"]);
    await h.b.exec("git", ["remote", "add", "alpha", h.origin]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("alpha", ["push", "read", "off"], "read")]);
  });

  it("reports no state remote while retaining explicitly designated read sources", async () => {
    const h = await fresh();
    await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "read"]);
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([{ status: "no-remote" }]);
    expect(result.pulls).toMatchObject([{ remote: "upstream", role: "read", status: "pulled" }]);
  });

  it("stays local-only with no code remote and no registry anywhere", async () => {
    const h = await fresh("default", false);
    await h.b.exec("git", ["remote", "rename", "origin", "zeta"]);
    await h.b.exec("git", ["remote", "add", "alpha", h.origin]);
    expect(success(await h.b.store.pull())).toEqual({ states: [{ status: "no-remote" }], pulls: [] });
    expect(await roles(h)).not.toContain("arc-state");
  });

  it("ignores a code-repository remote named backing even with a push key", async () => {
    const h = await fresh();
    await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
    await h.b.exec("git", ["remote", "add", "backing", h.origin]);
    await h.b.exec("git", ["config", "remote.backing.arc-state", "push"]);
    expect(success(await h.b.store.pull())).toEqual({ states: [{ status: "no-remote" }], pulls: [] });
    expect((await h.b.exec("git", ["config", "remote.backing.arc-state"])).stdout).toBe("push");
  });


  it("preserves held code-repository state when a first backing pointer needs a layout move, then follows its remedy", async () => {
    const h = await fresh();
    success(await h.b.store.pull());
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const ports = { ...h.b.ports, backingRepository: async () => h.origin }, store = createRefStore(ports);
    const result = success(await store.pull());
    expect(result.states).toMatchObject([{ status: "move-incomplete", remedy: { argv: ["arc", "store", "migrate"] } }]);
    expect(result.pulls).toEqual([]);
    expect((await h.b.exec("git", ["remote"])).stdout).toBe("origin");
    expect(success(await h.b.store.read({ reference: RecordReferenceSchema.parse({
      kind: "project-registry/identity", owner: { type: "project", name: "project" },
    }) })).content).toContain("34567890-1234-4234-8234-123456789abc");
    expect((await runStoreMigrate(ports)).status).toBe("ok");
    expect(success(await store.pull()).states).toMatchObject([question("backing", ["push", "off"], "push")]);
  });

  it("refuses a first backing when state reaches the code repository while its store is placed", async () => {
    const h = await fresh("default", false);
    const head = (await h.b.exec("git", ["rev-parse", "HEAD"])).stdout.trim();
    let armed = true;
    const store = createRefStore({ ...h.b.ports, backingRepository: async () => h.origin, lock: async (name, waitMs) => {
      if (armed && name === "layout") { armed = false; await h.b.exec("git", ["update-ref", "refs/arc/project/registry", head]); }
      return h.b.ports.lock(name, waitMs);
    } });
    const states = success(await store.pull()).states;
    expect(armed).toBe(false);
    expect((await h.b.exec("git", ["remote"])).stdout).toBe("origin");
    expect(states).toMatchObject([{ status: "move-incomplete", remedy: { argv: ["arc", "store", "migrate"] } }]);
  });

  it("publishes to a designated upstream without asking about an unanswered code remote", async () => {
    const h = await fresh("default", false);
    const upstream = join(h.cloneB, "upstream.git");
    await h.b.exec("git", ["init", "--bare", upstream]);
    await h.b.exec("git", ["remote", "add", "upstream", upstream]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    success(await h.b.store.write({ action: "put", expected: null, content: "# User Inbox\n",
      reference: RecordReferenceSchema.parse({ kind: "personal/inbox", owner: { type: "person", name: "andrew" } }),
      provenance: { verb: "user", lifecycleAction: "seed" } }));
    expect(success(await h.b.store.push()).states).toEqual([]);
    expect((await h.b.exec("git", ["--git-dir", upstream, "for-each-ref", "--format=%(refname)", "refs/arc/user/"])).stdout).toContain("refs/arc/user/andrew/");
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("reports an unreachable state remote's own failure without a designation remedy", async () => {
    const h = await fresh();
    await h.b.exec("git", ["remote", "add", "upstream", join(h.cloneB, "missing.git")]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ remote: "upstream", role: "state", status: "failed" }]);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

  it("asks nothing about the code remote while an answered read source cannot be read", async () => {
    const h = await fresh("default", false);
    await h.b.exec("git", ["remote", "add", "upstream", join(h.cloneB, "missing.git")]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "read"]);
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([{ status: "no-remote" }]);
    expect(result.pulls).toMatchObject([{ remote: "upstream", role: "read", status: "failed" }]);
  });

  it("reports an unreachable off remote as a failed candidate beside an unanswered code remote, then asks once it is removed", async () => {
    const h = await fresh("default", false);
    await h.b.exec("git", ["remote", "add", "upstream", join(h.cloneB, "missing.git")]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "off"]);
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ remote: "upstream", role: "candidate", status: "failed", notices: [],
      failure: { code: "unreachable", remedy: { text: expect.stringContaining("upstream"), argv: ["arc", "store", "remote", "origin", "push"] } } }]);
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
    await h.b.exec("git", ["remote", "remove", "upstream"]);
    expect(success(await h.b.store.pull()).states).toMatchObject([question("origin", ["push", "off"], "push")]);
  });

  it.each([["alpha", "zeta"], ["zeta", "alpha"]])(
    "asks nothing about the code remote while a read source holds the registry, an unreachable off remote %s listed beside it",
    async (off, read) => {
      const h = await fresh();
      const empty = join(h.cloneB, "empty.git");
      await h.b.exec("git", ["init", "--bare", empty]);
      await h.b.exec("git", ["remote", "set-url", "origin", empty]);
      await h.b.exec("git", ["remote", "add", read, h.origin]);
      await h.b.exec("git", ["config", `remote.${read}.arc-state`, "read"]);
      await h.b.exec("git", ["remote", "add", off, join(h.cloneB, "missing.git")]);
      await h.b.exec("git", ["config", `remote.${off}.arc-state`, "off"]);
      const result = success(await h.b.store.pull());
      expect(result.states).toEqual([{ status: "no-remote" }]);
      expect(result.pulls.filter(({ role }) => role === "candidate")).toEqual([]);
      expect(await roles(h)).not.toContain("remote.origin.arc-state");
    });

  it("reports each unreachable off remote as its own failed candidate when no answered remote holds the registry", async () => {
    const h = await fresh("default", false);
    for (const name of ["alpha", "zeta"]) {
      await h.b.exec("git", ["remote", "add", name, join(h.cloneB, `${name}-missing.git`)]);
      await h.b.exec("git", ["config", `remote.${name}.arc-state`, "off"]);
    }
    const result = success(await h.b.store.pull());
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject(["alpha", "zeta"].map((remote) => ({ remote, role: "candidate", status: "failed",
      failure: { code: "unreachable", remedy: { argv: ["arc", "store", "remote", "origin", "push"] } } })));
  });

  it("pulls a fork's designated upstream while its unanswered origin cannot be read", async () => {
    const h = await fresh();
    await h.b.exec("git", ["remote", "set-url", "origin", join(h.cloneB, "missing.git")]);
    await h.b.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.b.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    expect(success(await h.b.store.pull())).toMatchObject({ states: [], pulls: [{ remote: "upstream", role: "state", status: "pulled" }] });
    expect(await roles(h)).not.toContain("remote.origin.arc-state");
  });

});
