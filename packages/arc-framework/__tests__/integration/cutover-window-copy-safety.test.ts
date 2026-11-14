/** Isolation assertions run over native copied Git metadata and the host discovery boundary. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { prepareWindowCopy } from "../../src/scripts/cutover-window/copy.js";
import { assertWindowCopySafety } from "../../src/scripts/cutover-window/copy-safety.js";
import { writeBackingRepository } from "../../src/lib/config/status-reader.js";
import { ordinaryErrand, seedTransients, transientSourceRef } from "../helpers/store/import-transients.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";

async function copiedFixture(beforeCopy?: (h: Awaited<ReturnType<typeof windowFixture>>) => Promise<void>) {
  const h = await windowFixture();
  await h.git("git", ["worktree", "add", join(h.root, ".arc-fixture/linked"), "feat/alpha"]);
  await beforeCopy?.(h);
  return { ...h, layout: await takeCopy(h.root) };
}

async function takeCopy(repo: string) {
  const container = await mkdtemp(join(tmpdir(), "arc-window-safety-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const stdout: string[] = [];
  let layout: Awaited<ReturnType<typeof prepareWindowCopy>> | undefined;
  const exit = await runWindow(["copy", "--repo", repo, "--destination", join(container, "copy"), "--json"], {
    copy: async request => {
      layout = await prepareWindowCopy(request);
      return { operation: "copy", status: "reported", findings: [], data: layout };
    },
  }, { stdout: value => { stdout.push(value); }, stderr: () => undefined });
  expect(exit, stdout.join("")).toBe(0);
  if (!layout) throw new Error("Missing copy layout");
  return layout;
}

it("admits an isolated copy whose host discovery answers none", async () => {
  const h = await copiedFixture();
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it.each(["repo", "mirror"] as const)("refuses an awaiting-merge Errand on the %s and admits a new copy once it leaves the live repository", async side => {
  const h = await copiedFixture(async source => {
    const headSha = (await source.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await seedTransients(source, [TransientIdentityRecordSchema.parse({ ...ordinaryErrand, state: "awaiting-merge", changeRequest: {
      repositoryRef: "owner/repository", hostRef: "7", baseRef: "main", headRef: "chore/example", headSha,
    } })]);
    await source.git("git", ["push", "origin", transientSourceRef]);
  });
  const other = h.layout[side === "repo" ? "mirror" : "repo"];
  await h.git("git", ["update-ref", "-d", transientSourceRef], { cwd: other });
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ subject: expect.stringContaining("example"),
      condition: expect.stringContaining("awaiting"),
      remedy: "Merge or abandon Errand example on the live repository, then take a new copy." })] });
  await h.git("git", ["update-ref", "-d", transientSourceRef]);
  await h.git("git", ["push", "origin", `:${transientSourceRef}`]);
  const fresh = await takeCopy(h.root);
  await expect(assertWindowCopySafety(fresh, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it.each([true, false])("refuses a backing repository in a primary=%s checkout and admits its repair", async primary => {
  const h = await copiedFixture(), checkout = h.layout.worktrees.find(row => row.primary === primary);
  if (!checkout) throw new Error("Missing copied checkout");
  await writeBackingRepository(checkout.path, h.root);
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ subject: expect.stringContaining("storage.backing_repository") })] });
  await writeBackingRepository(checkout.path, null);
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it.each(["gitfile", "registration"] as const)("refuses a copied %s pointing outside the copy and admits its repair", async kind => {
  const h = await copiedFixture(), linked = h.layout.worktrees.find(row => !row.primary);
  if (!linked) throw new Error("Missing linked copy");
  const copiedGit = (await readFile(join(linked.path, ".git"), "utf8")).trim().slice(8);
  const sourceGit = (await readFile(join(linked.source, ".git"), "utf8")).trim().slice(8);
  const path = kind === "gitfile" ? join(linked.path, ".git") : join(copiedGit, "gitdir");
  const before = await readFile(path, "utf8");
  await writeFile(path, kind === "gitfile" ? `gitdir: ${sourceGit}\n` : `${join(linked.source, ".git")}\n`);
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ condition: expect.stringContaining("outside the copy") })] });
  await writeFile(path, before);
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it("refuses a gitfile inside the copied Git directory that names the live repository and admits its removal", async () => {
  const h = await copiedFixture();
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const planted = join(h.layout.repo, ".git", "arc", "review-gate", "materializations", "planted");
  await mkdir(planted, { recursive: true });
  await writeFile(join(planted, ".git"), `gitdir: ${join(common, "worktrees", "planted")}\n`);
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ subject: join(planted, ".git"),
      condition: expect.stringContaining("outside the copy") })] });
  await rm(planted, { recursive: true });
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it.each([
  ["repo", "url", "/another/local/repository"], ["repo", "pushurl", "https://github.com/owner/repository.git"],
  ["mirror", "url", "https://github.com/owner/repository.git"], ["mirror", "pushurl", "/another/local/repository"],
] as const)("refuses an effective %s remote %s outside the mirror and admits its repair", async (side, key, value) => {
  const h = await copiedFixture(), cwd = h.layout[side];
  await h.git("git", ["config", "--add", `remote.origin.${key}`, value], { cwd });
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ subject: expect.stringContaining("origin"),
      condition: expect.stringContaining("mirror") })] });
  await h.git("git", ["config", "--replace-all", `remote.origin.${key}`, h.layout.mirror], { cwd });
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it("refuses when host discovery finds a repository and admits it after discovery answers none", async () => {
  const h = await copiedFixture();
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => "owner/repository" } }))
    .rejects.toMatchObject({ findings: [expect.objectContaining({ condition: expect.stringContaining("owner/repository") })] });
  await expect(assertWindowCopySafety(h.layout, { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);
