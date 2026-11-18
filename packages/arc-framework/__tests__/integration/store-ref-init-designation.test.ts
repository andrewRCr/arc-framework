/** `arc init` designates its code remote and mints the project ID over the ref store; `arc join` mints none. */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished } from "vitest";
import { runInit, type InitOptions } from "../../src/commands/init.js";
import { runJoin } from "../../src/commands/join.js";
import { createRefStore, runStoreCreationDesignation } from "../../src/lib/store/create.js";
import { createDefaultRefStorePorts, createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { readProjectIdentityBinding } from "../../src/lib/store/project-identity.js";
import { DEFAULT_PROMPTS, createTempRepo, makeIOContext } from "../helpers/integration.js";
import { getArcTemplatePath, getInternalTemplatePath, loadRecipe } from "../helpers/init-temp-repo.js";
import { inRepoStore } from "../helpers/store/in-repo-ports.js";
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

async function repository(remote: string | null) {
  const cwd = await createTempRepo();
  onTestFinished(() => removeGitBackedDir(cwd));
  if (remote !== null) await git(cwd, "remote", "add", "origin", remote);
  return checkout(cwd);
}

function checkout(cwd: string) {
  const ports = createDefaultRefStorePorts({ checkoutRoot: cwd, backingRepository: async () => null });
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
  const r = await repository(await bareRemote());
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
