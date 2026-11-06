/** Native probe of a completed fetch failure while physical configuration remains damaged. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/index.js";
import { isCompletedGitFailure } from "../../src/lib/git/process-error.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { personal, provenance } from "../helpers/store/remote-move.js";
import { importFixture } from "../helpers/store/import-fixture.js";
import { ordinaryErrand, seedTransients, transientCommon, transientSourceRef, keptPrefix } from "../helpers/store/import-transients.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("returns a typed %s failed fetch while configuration stays damaged", async layout => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published.\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  const pending = { ...personal, key: "pending.md" };
  success(await h.b.store.write({ action: "put", reference: pending, expected: null, content: "Pending.\n", provenance }));
  await h.b.exec("git", ["remote", "add", "aaa", join(h.b.root, "unavailable.git")]);
  await h.b.exec("git", ["config", "remote.aaa.arc-state", "read"]);
  let injected = false, nativeFailure: unknown, repair: (() => Promise<void>) | undefined, observed: unknown;
  const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
    if (!injected && args.includes("fetch") && options?.input?.includes(`refs/arc-remotes/${h.remoteName}/`)) {
      injected = true;
      const directory = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length) ?? join(h.b.root, ".git");
      const path = join(directory, "config"), bytes = await readFile(path);
      repair = async () => writeFile(path, bytes);
      await writeFile(path, Buffer.concat([bytes, Buffer.from("\n[unclosed\n")]));
    }
    try { return await h.b.ports.exec(command, args, options); }
    catch (error) { if (injected && args.includes("fetch")) nativeFailure = error; throw error; }
  } });
  try { observed = await store.pull().catch(error => error); }
  finally { await repair?.(); }
  expect(injected).toBe(true);
  expect(isCompletedGitFailure(nativeFailure)).toBe(true);
  expect(success(await store.pull()).pulls.find(row => row.remote === h.remoteName)?.status).not.toBe("failed");
  expect(success(await store.read({ reference: pending })).content).toBe("Pending.\n");
  expect(observed).toMatchObject({ status: "ok", result: { pulls: expect.arrayContaining([
    expect.objectContaining({ remote: "aaa", status: "failed" }),
    expect.objectContaining({ remote: h.remoteName, status: "failed", failure: expect.any(Object) }),
  ]) } });
}, 60_000);


it.each(["default", "separate"] as const)("returns a typed %s failed publication acquisition and resumes after repair", async layout => {
  const h = await importFixture(layout), directory = join(h.root, ".git/arc/store");
  if (layout === "separate") {
    await h.git("git", ["init", "--bare", "--ref-format=reftable", "--object-format=sha1", directory]);
    await h.git("git", [`--git-dir=${directory}`, "config", "remote.backing.url", h.origin]);
    await h.git("git", [`--git-dir=${directory}`, "config", "remote.backing.arc-state", "push"]);
  }
  const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const tip = await seedTransients(h, [ordinaryErrand, { ...transientCommon, kind: "groom", slug: "groom-alpha",
    anchorStub: "alpha", members: ["alpha"], openedBaseHead: head, protection: "partial", branch: null, state: "open", changeRequest: null }]);
  await h.git("git", ["push", "origin", `${transientSourceRef}:${transientSourceRef}`]);
  const originalExec = h.ports.exec;
  let injected = false, nativeFailure: unknown, repair: (() => Promise<void>) | undefined, observed: unknown;
  h.ports.exec = async (command, args, options) => {
    if (!injected && args.includes("fetch") && options?.input?.includes("refs/arc/tmp/migrate/import-published/")) {
      injected = true;
      const physical = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length) ?? join(h.root, ".git");
      const path = join(physical, "config"), bytes = await readFile(path);
      repair = async () => writeFile(path, bytes);
      await writeFile(path, Buffer.concat([bytes, Buffer.from("\n[unclosed\n")]));
    }
    try { return await originalExec(command, args, options); }
    catch (error) { if (injected && args.includes("fetch")) nativeFailure = error; throw error; }
  };
  try { observed = await h.migrate().catch(error => error); }
  finally { await repair?.(); }
  expect(injected).toBe(true); expect(isCompletedGitFailure(nativeFailure)).toBe(true);
  expect((await h.remote("git", ["rev-parse", transientSourceRef])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(objectname)", keptPrefix])).stdout).toContain(tip);
  expect(await h.migrate()).toMatchObject({ status: "ok" });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", transientSourceRef])).stdout).toBe("");
  expect(observed).toMatchObject({ status: "refused", refusal: expect.any(Object) });
}, 60_000);


it.each((["default", "separate"] as const).flatMap(layout => [true, false].map(available => ({ layout, available }))))(
  "uses $layout forwarding advice only with an available failed-fetch observation ($available)", async ({ layout, available }) => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published.\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const tip = (await h.b.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
    await h.b.git(["update-ref", `refs/arc-remotes/${h.remoteName}/project/moved`, tip]);
    let failed = false, captured = false;
    const stderr = "fatal: failed acquisition";
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      if (args.includes("fetch")) {
        failed = true;
        throw makeGitProcessError({ command, args, exitCode: 128, stderr });
      }
      if (failed && args.includes("for-each-ref") && args.some(arg => arg.startsWith("refs/arc/tmp/seen/"))) {
        captured = true;
        if (!available) throw makeGitProcessError({ command, args, exitCode: 128, stderr: "capture unavailable" });
      }
      return h.b.ports.exec(command, args, options);
    } });
    const result = success(await store.pull()), row = result.pulls.find(pull => pull.remote === h.remoteName);
    expect(captured).toBe(true);
    expect(row).toMatchObject({ status: "failed", failure: { code: "unreachable", condition: stderr } });
    if (row?.status !== "failed") throw new Error("Expected failed acquisition");
    expect(row.failure.remedy.text.includes("forwarding record remains")).toBe(available);
    expect(success(await store.read({ reference: personal })).content).toBe("Published.\n");
  }, 60_000);

it.each(["default", "separate"] as const)("requires a coherent %s observation after a successful fetch", async layout => {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Published.\n", provenance }));
  success(await h.a.store.push());
  let fetched = false, failure: unknown;
  const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
    if (fetched && args.includes("for-each-ref") && args.some(arg => arg.startsWith("refs/arc/tmp/seen/"))) {
      failure = makeGitProcessError({ command, args, exitCode: 128, stderr: "capture unavailable" });
      throw failure;
    }
    const result = await h.b.ports.exec(command, args, options);
    if (args.includes("fetch")) fetched = true;
    return result;
  } });
  const observed: unknown = await store.pull().catch(error => error);
  expect(failure).toBeDefined(); expect(observed).toBe(failure);
  expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/personal"])).stdout).toBe("");
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: personal })).content).toBe("Published.\n");
}, 60_000);
