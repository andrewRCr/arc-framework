/** `arc init` designates its code remote and mints the project ID over the ref store; `arc join` mints none. */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished, vi } from "vitest";
import { runInit, type InitOptions } from "../../src/commands/init.js";
import { runJoin } from "../../src/commands/join.js";
import { UserFacingError } from "../../src/lib/errors.js";
import { createRefStore, runStoreCreationDesignation, runStoreRemote } from "../../src/lib/store/create.js";
import { createDefaultRefStorePorts, createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { readProjectIdentityBinding } from "../../src/lib/store/project-identity.js";
import { DEFAULT_PROMPTS, createTempRepo, makeIOContext } from "../helpers/integration.js";
import { getArcTemplatePath, getInternalTemplatePath, loadRecipe } from "../helpers/init-temp-repo.js";
import { inRepoStore } from "../helpers/store/in-repo-ports.js";
import { createReviewHarness } from "../helpers/store/review-harness.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { commitAll, removeGitBackedDir } from "../helpers/temp-repo.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]): Promise<string> => (await exec("git", args, { cwd })).stdout.trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

async function bareRemote(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "arc-init-remote-"));
  onTestFinished(() => removeGitBackedDir(path));
  await exec("git", ["init", "--bare", "-b", "main", path]);
  return path;
}

async function repository(remote: string | null, identityless = false) {
  const cwd = await createTempRepo();
  onTestFinished(() => removeGitBackedDir(cwd));
  if (remote !== null) await git(cwd, "remote", "add", "origin", remote);
  return checkout(cwd, identityless);
}

function checkout(cwd: string, identityless = false) {
  const ports = createDefaultRefStorePorts({ checkoutRoot: cwd, backingRepository: async () => null });
  if (identityless) ports.identity = async () => null;
  return { cwd, ports, store: createRefStore(ports) };
}

/** Clone an initialized project whose state was never published: its installed files arrive, its store does not. */
async function unpublishedClone(source: Repository) {
  await commitAll(source.cwd, "chore: install ARC");
  const parent = await mkdtemp(join(tmpdir(), "arc-join-clone-"));
  onTestFinished(() => removeGitBackedDir(parent));
  const cwd = join(parent, "clone");
  await exec("git", ["clone", "-q", source.cwd, cwd]);
  await git(cwd, "config", "user.email", "test@test.com");
  await git(cwd, "config", "user.name", "Test User");
  return checkout(cwd);
}
type Repository = Awaited<ReturnType<typeof repository>>;

async function options(r: Repository, identity: string | null): Promise<InitOptions> {
  return { cwd: r.cwd, io: makeIOContext(r.cwd), templateDir: getArcTemplatePath(), internalTemplateDir: getInternalTemplatePath(),
    recipe: await loadRecipe(), prompts: DEFAULT_PROMPTS, identityResult: identity };
}

async function init(r: Repository, identity: string | null = "test-user") {
  return runInit({ ...await options(r, identity), store: r.store, designateStateRemote: () => runStoreCreationDesignation(r.ports) });
}

async function roles(cwd: string): Promise<string> {
  return (await exec("git", ["config", "--get-regexp", "^remote\\..*\\.arc-state$"], { cwd }).catch(() => ({ stdout: "" }))).stdout.trim();
}

it.each(["test-user", null])("designates the code remote and mints a project ID in place, with identity %s", async identity => {
  const r = await repository(await bareRemote(), identity === null);
  expect(await r.ports.identity()).toBe(identity);
  await init(r, identity);
  expect(await roles(r.cwd)).toBe("remote.origin.arc-state push");
  expect((await readProjectIdentityBinding(r.store)).id).toMatch(UUID);
  const common = await git(r.cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
  await expect(stat(join(common, "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
}, 60_000);

it("mints a project ID and designates nothing without a remote", async () => {
  const r = await repository(null);
  await init(r);
  expect(await roles(r.cwd)).toBe("");
  expect((await readProjectIdentityBinding(r.store)).id).toMatch(UUID);
}, 60_000);

it("accepts the review harness's repaired project identity in the ref store", async () => {
  const review = createReviewHarness();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  const { reference, content } = await review.seedProject(projectId);
  expect(await review.projectId()).toBe(projectId);

  const { store } = await repository(null);
  const write = await store.write({ action: "put", reference, content, expected: null,
    provenance: { verb: "init", lifecycleAction: "create" } });
  expect(write.status, write.status === "refused" ? write.refusal.condition : undefined).toBe("ok");
  expect((await readProjectIdentityBinding(store)).id).toBe(projectId);
}, 60_000);

it("pulls a designated remote first and adopts the project ID it holds", async () => {
  const remote = await bareRemote(), first = await repository(remote);
  await init(first);
  const minted = (await readProjectIdentityBinding(first.store)).id;
  expect(await first.store.push()).toMatchObject({ status: "ok" });
  const second = await repository(remote);
  await git(second.cwd, "config", "remote.origin.arc-state", "push");
  await init(second, "other-user");
  expect((await readProjectIdentityBinding(second.store)).id).toBe(minted);
}, 90_000);

it("reports a registry lock and mints the first project ID on retry", async () => {
  const r = await repository(null);
  const refusal = { code: "lock-held", class: "recoverable", lock: "refs/arc/tmp/version.lock",
    condition: "Another Git writer holds the version lock.", remedy: { text: "Retry after the Git writer finishes." } } as const;
  vi.spyOn(r.store, "list").mockResolvedValueOnce({ status: "refused", refusal });

  await expect.soft(init(r, null)).rejects.toMatchObject({ failure: { reason: refusal.condition, remedy: refusal.remedy } });
  await init(r, null);
  expect((await readProjectIdentityBinding(r.store)).id).toMatch(UUID);
}, 60_000);

it("preserves an explicit off role set before creation acquires the migration lock", async () => {
  const r = await repository(await bareRemote());
  const designation = await runStoreCreationDesignation({ ...r.ports, lock: async (ref, waitMs) => {
    if (ref === "migrate") {
      expect(await runStoreRemote(r.ports, { remote: "origin", role: "off" })).toMatchObject({ status: "ok" });
    }
    return r.ports.lock(ref, waitMs);
  } });
  expect.soft(designation).toEqual({ status: "ok", result: { state: "designated" } });
  expect(await roles(r.cwd)).toBe("remote.origin.arc-state off");
  await init(r);
  expect((await readProjectIdentityBinding(r.store)).id).toMatch(UUID);
}, 60_000);

it("initializes locally when backing is the only code repository remote", async () => {
  const r = await repository(null);
  await git(r.cwd, "remote", "add", "backing", await bareRemote());
  await expect(init(r, null)).resolves.not.toBeNull();
  expect(await roles(r.cwd)).toBe("");
  expect((await readProjectIdentityBinding(r.store)).id).toMatch(UUID);
}, 60_000);

it("designates origin when the code repository's backing remote carries an off role", async () => {
  const r = await repository(await bareRemote());
  await git(r.cwd, "remote", "add", "backing", await bareRemote());
  await git(r.cwd, "config", "remote.backing.arc-state", "off");
  await init(r, null);
  expect((await roles(r.cwd)).split("\n")).toContain("remote.origin.arc-state push");
}, 60_000);

it("refuses to mint while the registry tracking ref is locked and adopts the published ID on retry", async () => {
  const remote = await bareRemote(), source = await repository(remote);
  await init(source, null);
  const { id } = await readProjectIdentityBinding(source.store);
  expect(await source.store.push()).toMatchObject({ status: "ok" });
  const registry = "refs/arc/project/registry";
  expect(await git(remote, "rev-parse", "--verify", registry)).toBe(await git(source.cwd, "rev-parse", "--verify", registry));

  const target = await repository(remote);
  await git(target.cwd, "config", "remote.origin.arc-state", "push");
  const lock = join(target.cwd, ".git", "refs/arc-remotes/origin/project/registry.lock");
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, "");

  const attempt = init(target, null).then(async () => ({ sourceId: id, installedId: (await readProjectIdentityBinding(target.store)).id }));
  await expect(attempt).rejects.toMatchObject({
    code: "init.state-remote", why: expect.stringContaining("registry.lock"), whatToDo: expect.stringMatching(/Git (writer|process)/iu),
  });
  await expect(readProjectIdentityBinding(target.store)).rejects.toThrow("Project identity record is missing.");
  await rm(lock);
  await init(target, null);
  expect((await readProjectIdentityBinding(target.store)).id).toBe(id);
}, 90_000);

async function publishedRegistry() {
  const remote = await bareRemote(), publisher = await repository(remote);
  await init(publisher, null);
  const { id } = await readProjectIdentityBinding(publisher.store);
  expect(await publisher.store.push()).toMatchObject({ status: "ok" });
  return { remote, id };
}

it.each(["preconfigured", "newly designated"])("refuses a divergent registry from a %s publisher and adopts its ID after repair", async (role) => {
  const { remote, id } = await publishedRegistry();
  const target = await repository(remote);
  if (role === "preconfigured") await git(target.cwd, "config", "remote.origin.arc-state", "push");
  const registry = "refs/arc/project/registry", tracking = "refs/arc-remotes/origin/project/registry";
  const { tip } = await plantRef(target.cwd, tracking, []);
  const publishedTip = await git(remote, "rev-parse", registry);

  const refusal: unknown = await init(target, null).catch((error: unknown) => error);
  expect(refusal).toMatchObject({ code: "init.state-remote",
    why: expect.stringContaining(`The fetched tip of ${registry} does not descend from the last head seen`),
  });
  if (!(refusal instanceof UserFacingError)) throw new Error("Expected a registry pull refusal");
  expect(await git(target.cwd, "rev-parse", tracking)).toBe(tip);
  await expect(readProjectIdentityBinding(target.store)).rejects.toThrow("Project identity record is missing.");
  expect(await git(target.cwd, "for-each-ref", "--format=%(objectname)", registry)).toBe("");

  const lines = refusal.whatToDo.split("\n");
  expect(lines.filter(line => line.includes("'push'") && line.includes(`':${registry}'`))).toEqual([]);
  const take = lines.findIndex(line => line.startsWith("Take theirs"));
  expect(take).toBeGreaterThanOrEqual(0);
  for (const line of lines.slice(take + 1)) {
    if (!line.startsWith("'git'")) break;
    const argv = [...line.matchAll(/'((?:[^']|'"'"')*)'/gu)].map(match => (match[1] ?? "").replaceAll("'\"'\"'", "'"));
    await git(target.cwd, ...argv.slice(1));
  }
  expect(await git(target.cwd, "rev-parse", registry)).toBe(publishedTip);
  expect(await git(remote, "rev-parse", registry)).toBe(publishedTip);
  await expect(init(target, null)).resolves.not.toBeNull();
  expect((await readProjectIdentityBinding(target.store)).id).toBe(id);
}, 90_000);

it("reports an unreadable publisher registry and adopts the published ID once it can be read", async () => {
  const { remote, id } = await publishedRegistry();
  const target = await repository(remote);
  await git(target.cwd, "config", "remote.origin.arc-state", "push");
  const condition = "An object required by refs/arc/project/registry is missing.";
  const remedy = { text: "Restore the missing object from a complete copy, then retry the pull." };
  vi.spyOn(target.store, "pull").mockResolvedValueOnce({ status: "ok", result: { states: [], pulls: [{
    status: "noop", remote: "origin", role: "state", families: ["project-registry"],
    notices: [{ kind: "namespace-corrupt", ref: "refs/arc/project/registry", condition, remedy }],
  }] } });

  await expect(init(target, null)).rejects.toMatchObject({ code: "init.state-remote", why: condition,
    whatToDo: expect.stringContaining(remedy.text),
  });
  await expect(readProjectIdentityBinding(target.store)).rejects.toThrow("Project identity record is missing.");
  await init(target, null);
  expect((await readProjectIdentityBinding(target.store)).id).toBe(id);
}, 90_000);

it("installs with the publisher's ID while a secondary read source's registry tracking ref is locked", async () => {
  const { remote, id } = await publishedRegistry();
  const { remote: reader } = await publishedRegistry();
  const target = await repository(remote);
  await git(target.cwd, "config", "remote.origin.arc-state", "push");
  await git(target.cwd, "remote", "add", "reader", reader);
  await git(target.cwd, "config", "remote.reader.arc-state", "read");
  const lock = join(target.cwd, ".git", "refs/arc-remotes/reader/project/registry.lock");
  await mkdir(dirname(lock), { recursive: true });
  await writeFile(lock, "");
  const pull = vi.spyOn(target.store, "pull");

  await expect.soft(init(target, null)).resolves.not.toBeNull();
  expect(pull.mock.settledResults[0]).toMatchObject({ type: "fulfilled", value: { status: "ok", result: { pulls: [
    expect.objectContaining({ remote: "origin", role: "state", status: "pulled", notices: [] }),
    expect.objectContaining({ remote: "reader", role: "read",
      notices: expect.arrayContaining([expect.objectContaining({ kind: "tracking-update-failed", ref: "refs/arc/project/registry" })]),
    }),
  ] } } });
  expect((await readProjectIdentityBinding(target.store)).id).toBe(id);
}, 90_000);

it("refuses a moved state remote before minting and adopts the original ID on retry", async () => {
  const destination = await bareRemote(), project = await repository(destination);
  await init(project, null);
  const { id: projectId } = await readProjectIdentityBinding(project.store);
  expect(await project.store.push()).toMatchObject({ status: "ok" });
  const registryCommit = await git(destination, "rev-parse", "refs/arc/project/registry");
  const departed = await bareRemote();
  await plantRef(departed, "refs/arc/project/moved", [
    { path: "moved.json", content: JSON.stringify({ projectId, registryCommit }) },
  ], { gitDir: departed });

  const fresh = await repository(departed);
  await git(fresh.cwd, "config", "remote.origin.arc-state", "push");
  const attempt = await init(fresh, null).then(() => readProjectIdentityBinding(fresh.store), (error: unknown) => error);
  expect(attempt, `init must refuse the move of project ${projectId}`).toMatchObject({
    code: "init.state-remote", whatToDo: expect.stringContaining("arc store migrate"),
  });
  await expect(readProjectIdentityBinding(fresh.store)).rejects.toThrow("Project identity record is missing.");

  await git(fresh.cwd, "remote", "set-url", "origin", destination);
  await init(fresh, null);
  expect((await readProjectIdentityBinding(fresh.store)).id).toBe(projectId);
}, 90_000);

it("refuses ambiguous push roles and adopts the published ID after one is turned off", async () => {
  const remote = await bareRemote(), source = await repository(remote);
  await init(source);
  const { id } = await readProjectIdentityBinding(source.store);
  expect(await source.store.push()).toMatchObject({ status: "ok" });

  const r = await repository(remote);
  await git(r.cwd, "remote", "add", "other", await bareRemote());
  await git(r.cwd, "config", "remote.origin.arc-state", "push");
  await git(r.cwd, "config", "remote.other.arc-state", "push");
  await expect(init(r)).rejects.toMatchObject({
    code: "init.state-remote", why: expect.stringMatching(/origin.*other/iu),
    whatToDo: expect.stringContaining("arc store remote"),
  });
  await expect(readProjectIdentityBinding(r.store)).rejects.toThrow("Project identity record is missing.");
  await runStoreRemote(r.ports, { remote: "other", role: "off" });
  await init(r);
  expect((await readProjectIdentityBinding(r.store)).id).toBe(id);
}, 90_000);

it("adopts the published project ID when init first designates a clone's origin", async () => {
  const origin = await bareRemote(), publisher = await repository(origin);
  await commitAll(publisher.cwd, "Initial code");
  await git(publisher.cwd, "push", "origin", "main");
  await init(publisher);
  const { id } = await readProjectIdentityBinding(publisher.store);
  expect(await publisher.store.push()).toMatchObject({ status: "ok" });
  expect(JSON.parse(await git(origin, "show", "refs/arc/project/registry:identity.json"))).toEqual({ projectId: id });

  const cwd = await mkdtemp(join(tmpdir(), "arc-init-clone-"));
  onTestFinished(() => removeGitBackedDir(cwd));
  await exec("git", ["clone", "-q", origin, cwd]);
  await git(cwd, "config", "user.email", "test@test.com");
  await git(cwd, "config", "user.name", "Test User");
  expect(await roles(cwd)).toBe("");
  const clone = checkout(cwd);
  await init(clone, "other-user");
  expect(await roles(cwd)).toBe("remote.origin.arc-state push");
  expect((await readProjectIdentityBinding(clone.store)).id).toBe(id);
}, 90_000);

it("keeps one project ID when an init refused after designation runs again", async () => {
  const r = await repository(await bareRemote());
  const occupied = join(r.cwd, ".arc", "system", "rules", "DEV-RULES.ARC.md");
  await mkdir(dirname(occupied), { recursive: true });
  await writeFile(occupied, "Not ARC's\n");
  await expect(init(r)).rejects.toMatchObject({ code: "manifest.install-paths-occupied" });
  expect(await roles(r.cwd)).toBe("remote.origin.arc-state push");
  const minted = (await readProjectIdentityBinding(r.store)).id;
  await rm(occupied);
  await init(r);
  expect((await readProjectIdentityBinding(r.store)).id).toBe(minted);
}, 90_000);

it("joins without minting a project ID", async () => {
  const initialized = await repository(null);
  await init(initialized);
  const r = await unpublishedClone(initialized);
  await runJoin({ cwd: r.cwd, io: makeIOContext(r.cwd), templateDir: getArcTemplatePath(), internalTemplateDir: getInternalTemplatePath(),
    prompts: { role: "maintainer", tools: [] }, identityResult: "other-user", store: r.store });
  await expect(readProjectIdentityBinding(r.store)).rejects.toThrow("Project identity record is missing.");
}, 60_000);

it("neither designates nor mints on the in-repo implementation", async () => {
  const r = await repository(await bareRemote());
  await runInit({ ...await options(r, "test-user"), store: inRepoStore(createDefaultStorePorts({ checkoutRoot: r.cwd })) });
  expect(await roles(r.cwd)).toBe("");
  expect(await git(r.cwd, "for-each-ref", "refs/arc/")).toBe("");
}, 60_000);
