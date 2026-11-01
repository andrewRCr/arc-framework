/** Local URL faults stay on their remote while independently fetched state and notices remain available. */
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "save", lifecycleAction: "save" };

it("keeps another remote's applied state and rewrite notice when a read source URL cannot be represented", async () => {
  const h = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "transport.md" });
  const firstRecord = success(await h.a.store.write({ action: "put", reference, expected: null, content: "First content.\n", provenance }));
  if (!firstRecord.version) throw new Error("Expected the created record version");
  success(await h.a.store.push()); success(await h.b.store.pull());
  const ref = "refs/arc/user/andrew/personal", first = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  success(await h.a.store.write({ action: "put", reference, expected: firstRecord.version, content: "Second content.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const second = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  const inbox = RecordReferenceSchema.parse({ kind: "project-inbox/inbox", owner: { type: "project", name: "project" } });
  const content = "# Atomic Inbox\n\n## Inbox\n\nIndependent update.\n";
  success(await h.a.store.write({ action: "put", reference: inbox, expected: null, content, provenance }));
  await h.a.git(["push", "origin", "refs/arc/project/inbox:refs/arc/project/inbox"]);
  await h.remote("git", ["update-ref", ref, first, second]);
  await h.b.exec("git", ["remote", "add", "zzz-broken", `${h.origin}\nextra`]);
  await h.b.exec("git", ["config", "remote.zzz-broken.arc-state", "read"]);
  const pulled = success(await h.b.store.pull());
  expect(pulled.pulls).toHaveLength(2);
  expect(pulled.pulls.find(outcome => outcome.remote === "origin")).toMatchObject({ status: "pulled",
    notices: [expect.objectContaining({ kind: "history-diverged", ref, local: second, remote: first })] });
  expect(pulled.pulls.find(outcome => outcome.remote === "zzz-broken")).toMatchObject({ status: "failed", role: "read",
    failure: { code: "refused", class: "terminal", condition: expect.stringContaining("line break"),
      remedy: { text: expect.stringMatching(/repair.*URL/iu) } } });
  expect(success(await h.b.store.read({ reference: inbox })).content).toBe(content);
  expect(success(await h.b.store.read({ reference })).content).toBe("Second content.\n");
  await h.b.exec("git", ["remote", "set-url", "zzz-broken", h.origin]);
  const repaired = success(await h.b.store.pull()).pulls.find(outcome => outcome.remote === "zzz-broken");
  expect(repaired?.status).not.toBe("failed");
  expect(repaired?.status).toMatch(/^(?:pulled|noop)$/u);
}, 60_000);

async function upstreamPublisher() {
  const h = await refSyncFixture("separate");
  await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
  await h.a.git(["remote", "remove", "backing"]);
  await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
  await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
  return h;
}

it("returns a failed publication with its pull retained when the push URL cannot be represented", async () => {
  const h = await upstreamPublisher();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "publish.md" });
  const content = "Pending publication.\n";
  success(await h.a.store.write({ action: "put", reference, expected: null, content, provenance }));
  await h.a.exec("git", ["config", "remote.upstream.pushurl", `${h.origin}\nextra`]);
  const result = success(await h.a.store.push());
  expect(result.pulls.find(outcome => outcome.remote === "upstream")).toMatchObject({ status: "noop", notices: [] });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", failure: {
    code: "refused", class: "terminal", message: expect.stringContaining("line break"), condition: expect.stringContaining("line break"),
    remedy: { text: expect.stringMatching(/repair.*URL/iu) } } }));
  expect(success(await h.a.store.read({ reference })).content).toBe(content);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  await h.a.exec("git", ["config", "remote.upstream.pushurl", h.origin]);
  expect(success(await h.a.store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe(content);
}, 60_000);

it("refuses publication immediately when its admission witness finds a newly unrepresentable push URL", async () => {
  const h = await upstreamPublisher();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "admission.md" });
  const content = "Retained across admission failure.\n";
  success(await h.a.store.write({ action: "put", reference, expected: null, content, provenance }));
  let armed = false, injected = false, validated = false;
  const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (!injected && args.includes("get-url") && args.includes("--push") && args.includes("--all") && args.at(-1) === "upstream") armed = true;
    if (injected && args.includes("config") && args.includes("--get-all") && args.at(-1) === "remote.upstream.pushurl") validated = true;
    return result;
  }, lock: async (...args) => {
    const release = await h.a.ports.lock(...args);
    try {
      if (armed && !injected && args[0] === "layout") {
        injected = true;
        await h.a.exec("git", ["config", "remote.upstream.pushurl", `${h.origin}\nextra`]);
      }
      return release;
    } catch (error) { await release(); throw error; }
  } });
  const result = success(await publisher.push());
  expect(injected).toBe(true); expect(validated).toBe(true);
  expect(result.pulls.find(outcome => outcome.remote === "upstream")).toMatchObject({ status: "noop" });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", retryCount: 0,
    failure: expect.objectContaining({ code: "refused", class: "terminal", condition: expect.stringContaining("line break"),
      remedy: { text: expect.stringMatching(/repair.*URL/iu) } }) }));
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
  expect(success(await publisher.read({ reference })).content).toBe(content);
  await h.a.exec("git", ["config", "remote.upstream.pushurl", h.origin]);
  expect(success(await publisher.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe(content);
}, 60_000);

it("retains the failed pull when a rewrite remedy cannot resolve the push URL", async () => {
  const h = await upstreamPublisher();
  const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "rewrite.md" });
  const initial = success(await h.b.store.write({ action: "put", reference, expected: null, content: "First remote.\n", provenance }));
  if (!initial.version) throw new Error("Expected the created record version");
  success(await h.b.store.push()); success(await h.a.store.pull());
  const ref = "refs/arc/user/andrew/personal", first = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  success(await h.b.store.write({ action: "put", reference, expected: initial.version, content: "Second remote.\n", provenance }));
  success(await h.b.store.push()); success(await h.a.store.pull());
  const second = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  const current = success(await h.a.store.read({ reference })), content = "Unpublished local revision.\n";
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content, provenance }));
  await h.remote("git", ["update-ref", ref, first, second]);
  await h.a.exec("git", ["config", "remote.upstream.pushurl", `${h.origin}\nextra`]);
  const fetched: string[] = [];
  const publisher = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
    try {
      const result = await h.a.ports.exec(command, args, options);
      if (args.includes("fetch")) fetched.push(result.stdout);
      return result;
    } catch (error) {
      if (args.includes("fetch") && isGitProcessError(error) && isCompletedGitFailure(error)) fetched.push(error.stdout);
      throw error;
    }
  } });
  const result = success(await publisher.push());
  expect(fetched.join(" ")).toContain(first);
  expect(fetched.join(" ")).toContain("refs/arc-remotes/upstream/user/andrew/personal");
  expect(result.pulls.find(outcome => outcome.remote === "upstream")).toMatchObject({ status: "failed",
    failure: { code: "refused", class: "terminal", condition: expect.stringContaining("line break") } });
  expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed",
    failure: expect.objectContaining({ code: "refused", condition: expect.stringContaining("line break") }) }));
  expect(success(await publisher.read({ reference })).content).toBe(content);
  await h.a.exec("git", ["config", "remote.upstream.pushurl", h.origin]);
  const repaired = success(await publisher.push());
  expect(repaired.pulls.flatMap(outcome => outcome.notices)).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref,
    remedy: { text: expect.stringContaining("Keep ours") } }));
  await h.remote("git", ["update-ref", ref, second, first]);
  expect(success(await publisher.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe(content);
}, 60_000);
