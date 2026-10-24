/** Remote copies gather the publisher's complete state without adopting it locally. */
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";

import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const provenance = { verb: "edit", lifecycleAction: "save" };
const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const projectId = "34567890-1234-4234-8234-123456789abc";

async function copyFixture(layout: "default" | "separate" = "default") {
  const h = await refSyncFixture(layout), destination = join(h.a.root, "destination.git");
  await h.a.exec("git", ["init", "--bare", destination]);
  await h.a.exec("git", ["remote", "add", "destination", destination]);
  await h.a.exec("git", ["config", "remote.destination.arc-state", "off"]);
  success(await h.b.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId }), provenance }));
  success(await h.b.store.push()); success(await h.a.store.pull());
  return { ...h, destination, argv: ["--to", "destination"], pause: { ...h.a.ports, migrateStep: async (step: string) => {
    if (step === "remote.copied") throw new Error("Paused after remote copy");
  } } };
}

it.each(["default", "separate"] as const)("copies unseen personal and history refs without local adoption in the %s layout", async layout => {
  const h = await copyFixture(layout);
  const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "unseen.md", owner: { type: "person", name: "beth" } });
  const beth = createRefStore({ ...h.b.ports, identity: async () => SlugSchema.parse("beth") });
  success(await beth.write({ action: "put", reference: personal, expected: null, content: "Unseen personal state.\n", provenance }));
  const created = success(await h.b.store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "ended" } }),
    content: makeMetaFixture("ended"), placement: { kind: "active" }, provenance }));
  success(await h.b.store.write({ action: "put", reference: created.reference,
    expected: success(await h.b.store.read({ reference: created.reference })).version, content: makeMetaFixture("ended"),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") }, provenance: { verb: "archive", lifecycleAction: "archive" } }));
  success(await beth.push());
  const before = success(await h.a.store.version());
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.trim().split("\n");
  const unseen = source.filter(row => row.startsWith("refs/arc/user/beth/") || row.startsWith("refs/arc/history/"));
  expect(unseen).toHaveLength(2);
  await expect(invokeStoreMigrate(h.argv, h.pause)).rejects.toThrow("Paused after remote copy");
  const copied = (await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout.trim().split("\n");
  for (const row of source) {
    const [ref] = row.split(" ");
    if (ref !== "refs/arc/project/registry") expect(copied).toContain(row);
  }
  expect(success(await h.a.store.version())).toBe(before);
  const local = (await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/user/beth/", "refs/arc/history/"])).stdout;
  expect(local).toBe("");
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  expect(recorded).toMatchObject({ kind: "remote", source: { name: h.remoteName, fetchUrl: h.origin, pushUrl: h.origin },
    destination: { name: "destination", fetchUrl: h.destination, pushUrl: h.destination } });
  const registry = (await h.a.exec("git", [`--git-dir=${h.destination}`, "rev-parse", "refs/arc/project/registry"])).stdout.trim();
  expect(recorded.registryCommit).toBe(registry);
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "log", "-1", "--format=%B", registry])).stdout).toContain("Arc-Lifecycle-Action: move-remote");
  for (const row of unseen) expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/tmp/migrate/copied/"])).stdout).toContain(row.split(" ")[1]);
}, 45_000);


it("refuses foreign registry and forwarding identities before any push, including trial, and permits repair", async () => {
  const h = await copyFixture(), foreign = "abcdef01-1234-4234-8234-123456789abc";
  const before = success(await h.a.store.version()), other = await refSyncFixture();
  success(await other.a.store.write({ action: "put", reference: identity, expected: null, content: JSON.stringify({ projectId: foreign }), provenance }));
  for (const shape of ["registry", "forwarding"] as const) {
    if (shape === "registry") {
      await other.a.git(["push", h.destination, "refs/arc/project/registry:refs/arc/project/registry"]);
    } else {
      await h.a.exec("git", [`--git-dir=${h.destination}`, "update-ref", "-d", "refs/arc/project/registry"]);
      await plantRef(h.destination, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId: foreign, registryCommit: "a".repeat(40) }) }], { gitDir: h.destination });
    }
    const original = (await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    for (const trial of [false, true]) {
      const result = await invokeStoreMigrate([...h.argv, ...trial ? ["--trial"] : []], h.a.ports);
      expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch",
        expected: { owner: { uid: projectId } }, actual: { owner: { uid: foreign } } } } });
      expect.soft((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(original);
      expect.soft((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
      expect.soft(success(await h.a.store.version())).toBe(before);
    }
    const localRegistry = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
    await h.a.git(["update-ref", "-d", "refs/arc/project/registry", localRegistry]);
    try {
      expect.soft(await invokeStoreMigrate([...h.argv, "--trial"], h.a.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch",
        expected: { owner: { uid: projectId } }, actual: { owner: { uid: foreign } } } } });
    } finally { await h.a.git(["update-ref", "refs/arc/project/registry", localRegistry, "0".repeat(40)]); }
  }
  await h.a.exec("git", [`--git-dir=${h.destination}`, "update-ref", "-d", "refs/arc/project/moved"]);
  await expect(invokeStoreMigrate(h.argv, h.pause)).rejects.toThrow("Paused after remote copy");
}, 45_000);

it("refuses malformed source and destination forwarding records, then copies once each is repaired", async () => {
  const h = await copyFixture(), moved = "refs/arc/project/moved";
  for (const remote of [h.origin, h.destination]) {
    await plantRef(remote, moved, [{ path: "moved.json", content: "not JSON" }], { gitDir: remote });
    const original = (await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    const result = await invokeStoreMigrate(h.argv, h.a.ports);
    expect.soft(result).toMatchObject({ status: "refused", refusal: { code: "move-record-malformed", condition: expect.stringContaining(moved),
      remedy: { text: expect.stringMatching(/repair or delete/iu) } } });
    expect.soft((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(original);
    expect.soft((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
    await h.a.exec("git", [`--git-dir=${remote}`, "update-ref", "-d", moved]);
  }
  await expect(invokeStoreMigrate(h.argv, h.pause)).rejects.toThrow("Paused after remote copy");
}, 45_000);

it("refuses an unrecorded move from a departed source before copying anything", async () => {
  const h = await copyFixture();
  await plantRef(h.origin, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.origin });
  const result = await invokeStoreMigrate(h.argv, h.a.ports);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "moved", remedy: { text: expect.stringMatching(/arc store migrate.*follow.*--to/u) } } });
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 30_000);

it("refuses a destination forwarding record from outside the source's line of moves", async () => {
  const h = await copyFixture();
  const moved = await plantRef(h.destination, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit: "a".repeat(40) }) }], { gitDir: h.destination });
  const result = await invokeStoreMigrate(h.argv, h.a.ports);
  expect(result).toMatchObject({ status: "refused", refusal: { code: "moved", condition: expect.stringContaining("refs/arc/project/moved"),
    remedy: { text: expect.stringContaining("--to") } } });
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout.trim()).toBe(`refs/arc/project/moved ${moved.tip}`);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 30_000);


it.each(["no-atomic", "hook"] as const)("leaves no first-run record after %s refusal but preserves an interrupted run's record", async receiver => {
  const h = await copyFixture();
  if (receiver === "no-atomic") await h.a.exec("git", [`--git-dir=${h.destination}`, "config", "receive.advertiseAtomic", "false"]);
  else {
    const hook = join(h.destination, "hooks", "pre-receive");
    await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  }
  const first = await invokeStoreMigrate(h.argv, h.a.ports);
  expect(first).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused", class: "terminal" } } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
  await expect(invokeStoreMigrate(h.argv, { ...h.a.ports, migrateStep: async step => {
    if (step === "remote.copy") throw new Error("Paused before copy push");
  } })).rejects.toThrow("Paused before copy push");
  const recorded = (await h.a.exec("git", ["rev-parse", "refs/arc/tmp/migrate/move"])).stdout.trim();
  expect(await invokeStoreMigrate([], h.a.ports)).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "refused", class: "terminal" } } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  const kept = (await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout;
  expect(JSON.parse(kept)).toMatchObject({ kind: "remote", destination: { fetchUrl: h.destination } });
  expect(recorded).not.toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)"])).stdout).toBe("");
  if (receiver === "no-atomic") await h.a.exec("git", [`--git-dir=${h.destination}`, "config", "receive.advertiseAtomic", "true"]);
  else await writeFile(join(h.destination, "hooks", "pre-receive"), "#!/bin/sh\nexit 0\n");
  await expect(invokeStoreMigrate([], h.pause)).rejects.toThrow("Paused after remote copy");
}, 45_000);

it("restarts a lost destination lease and records the commit that actually lands", async () => {
  const h = await copyFixture(), counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "race", owner: { type: "project", name: "project" } });
  let first: string | undefined, race: string | undefined;
  const ports = { ...h.pause, migrateStep: async (step: string) => {
    if (step === "remote.copy" && first === undefined) {
      first = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout).registryCommit;
      success(await h.b.store.write({ action: "put", reference: counter, expected: null, content: '{"next":2}', provenance }));
      await h.b.git(["push", h.destination, "refs/arc/project/registry:refs/arc/project/registry"]);
      race = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
    }
    if (step === "remote.copied") throw new Error("Paused after remote copy");
  } };
  await expect(invokeStoreMigrate(h.argv, ports)).rejects.toThrow("Paused after remote copy");
  const landed = (await h.a.exec("git", [`--git-dir=${h.destination}`, "rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const recorded = JSON.parse((await h.a.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout);
  expect(recorded.registryCommit).toBe(landed); expect(landed).not.toBe(first);
  expect(race).toBeDefined();
  await h.a.exec("git", ["merge-base", "--is-ancestor", race ?? "", landed]);
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "grep", "-F", '"next":2', landed])).stdout).toContain('"next":2');
}, 45_000);


it("merges onto this project's destination, reports broken rules, and makes the trial match the copy", async () => {
  const h = await copyFixture();
  const source = RecordReferenceSchema.parse({ kind: "personal/document", key: "source.md", owner: { type: "person", name: "andrew" } });
  const destination = RecordReferenceSchema.parse({ ...source, key: "destination.md" });
  success(await h.b.store.write({ action: "put", reference: destination, expected: null, content: "Destination edit.\n", provenance }));
  await h.b.git(["push", h.destination, "refs/arc/project/registry:refs/arc/project/registry", "refs/arc/user/andrew/personal:refs/arc/user/andrew/personal"]);
  success(await h.a.store.write({ action: "put", reference: source, expected: null, content: "Source edit.\n", provenance }));
  const published = success(await h.a.store.push());
  expect(published.publishes, JSON.stringify(published)).toContainEqual(expect.objectContaining({ status: "pushed" }));
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const check: WriteCheck = async ({ reference, before, after }) => {
    if (reference.key !== "source.md") return [];
    expect(success(await before.read({ reference: destination })).content).toBe("Destination edit.\n");
    expect(success(await after.read({ reference: source })).content).toBe("Source edit.\n");
    expect(success(await after.read({ reference: destination })).content).toBe("Destination edit.\n");
    return [{ rule: "copy.combined", condition: "Review the combined state.", remedy: { text: "Save the combined state." } }];
  };
  const ports = { ...h.pause, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } } };
  const before = (await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const trial = await invokeStoreMigrate([...h.argv, "--trial"], ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  if (trial.status !== "ok") throw new Error("Trial refused");
  expect(trial.result.refs).toContainEqual({ ref: "refs/arc/user/andrew/personal", scope: "identity", person: "andrew", action: "merge" });
  expect(trial.result.notices).toContainEqual({ condition: expect.stringContaining("copy.combined"), remedy: { text: "Save the combined state." } });
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await expect(invokeStoreMigrate(h.argv, ports)).rejects.toThrow("Paused after remote copy");
  for (const text of ["Source edit.", "Destination edit."]) expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "grep", "-F", text, "refs/arc/user/andrew/personal"])).stdout).toContain(text);
  const refs = (await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim().split("\n");
  expect(refs.sort()).toEqual(trial.result.refs.filter(row => row.action !== "delete").map(row => row.ref).sort());
}, 45_000);

it("deletes only an ancestral forwarding record and retains its root commit beside the copied tips", async () => {
  const h = await copyFixture();
  const registryCommit = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const moved = await plantRef(h.destination, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) }], { gitDir: h.destination });
  const trial = await invokeStoreMigrate([...h.argv, "--trial"], h.a.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  if (trial.status !== "ok") throw new Error("An ancestral move back refused");
  expect(trial.result.refs).toContainEqual({ ref: "refs/arc/project/moved", scope: "project", action: "delete" });
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "rev-parse", "refs/arc/project/moved"])).stdout.trim()).toBe(moved.tip);
  await expect(invokeStoreMigrate(h.argv, h.pause)).rejects.toThrow("Paused after remote copy");
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  for (const ref of ["refs/arc/tmp/migrate/copied/deleted-record", "refs/arc/tmp/migrate/deleted-record"]) {
    expect((await h.a.exec("git", ["rev-parse", ref])).stdout.trim()).toBe(moved.tip);
  }
}, 45_000);


it("retains a deleted forwarding root when a landed copy loses its response and then resumes", async () => {
  const h = await copyFixture(), registryCommit = (await h.a.git(["rev-parse", "refs/arc/project/registry"])).stdout.trim();
  const moved = await plantRef(h.destination, "refs/arc/project/moved", [{ path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) }], { gitDir: h.destination });
  let armed = true;
  const uncertain = await invokeStoreMigrate(h.argv, { ...h.a.ports, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (armed && args.includes("push") && args.includes(h.destination)) {
      armed = false;
      throw makeGitProcessError({ command, args, signal: "SIGTERM", stderr: "The copy landed but its response was lost." });
    }
    return result;
  } });
  expect(uncertain).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "unreachable" } } });
  expect((await h.a.exec("git", [`--git-dir=${h.destination}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/tmp/migrate/deleted-record"])).stdout.trim()).toBe(moved.tip);
  await expect(invokeStoreMigrate([], h.pause)).rejects.toThrow("Paused after remote copy");
  for (const ref of ["refs/arc/tmp/migrate/copied/deleted-record", "refs/arc/tmp/migrate/deleted-record"]) {
    expect((await h.a.exec("git", ["for-each-ref", "--format=%(objectname)", ref])).stdout.trim()).toBe(moved.tip);
  }
}, 45_000);


describe.each(["registry-less", "identity-less"] as const)("a move from a %s state remote", (shape) => {
  it.each([false, true])("refuses before any record or copy (trial: %s)", async (trial) => {
    const h = await refSyncFixture(), destination = join(h.a.root, "destination.git");
    await h.a.exec("git", ["init", "--bare", destination]);
    if (shape === "identity-less") {
      const created = success(await h.a.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "unidentified" } }),
        content: makeMetaFixture("unidentified"), placement: { kind: "active" }, provenance }));
      success(await h.a.store.write({ action: "put", expected: success(await h.a.store.read({ reference: created.reference })).version,
        reference: RecordReferenceSchema.parse({ ...created.reference, owner: { ...created.reference.owner, name: "renamed" } }),
        content: makeMetaFixture("renamed"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
      success(await h.a.store.push());
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/registry"])).stdout.trim()).toBe("refs/arc/project/registry");
    }
    const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    expect(await invokeStoreMigrate(["--to", destination, ...trial ? ["--trial"] : []], h.a.ports)).toMatchObject({ status: "refused",
      refusal: { code: "store", refusal: { code: "not-found", class: "recoverable", reference: identity } } });
    expect((await h.a.exec("git", [`--git-dir=${destination}`, "for-each-ref"])).stdout).toBe("");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(source);
    expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  });
});

it.each(["fetch", "push"] as const)("refuses a destination naming the source's own %s URL before any write", async (named) => {
  const h = await copyFixture(), pushUrl = `file://${h.origin}`;
  await h.a.exec("git", ["config", "remote.origin.pushurl", pushUrl]);
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await invokeStoreMigrate(["--to", named === "fetch" ? h.origin : pushUrl], h.a.ports)).toMatchObject({ status: "refused",
    refusal: { code: "request-invalid", condition: expect.stringContaining("same state remote") } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(source);
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
});

it("ends a move whose destination is its source under another spelling after a bounded number of rounds", async () => {
  const h = await copyFixture();
  const looped = await invokeStoreMigrate(["--to", `${h.origin}/`], h.a.ports);
  expect(looped).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    remedy: { argv: ["arc", "store", "migrate", "--leave-source"] } } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await invokeStoreMigrate(["--leave-source"], h.a.ports)).status).toBe("ok");
  expect((await h.a.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect(success(await h.a.store.pull()).states).toEqual([]);
}, 60_000);
