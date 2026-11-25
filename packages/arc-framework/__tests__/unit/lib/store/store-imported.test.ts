/** Detecting an imported store, and the refusal a sealed write carries. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import {
  refuseWriteIfStoreImported, storeImported, StoreImportedError, storeImportedHere, storeImportedRefusal,
} from "../../../../src/lib/store/store-imported.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function checkout(options: { storeRepository?: boolean } = {}): Promise<{ root: string; commonDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "arc-store-imported-"));
  roots.push(root);
  const commonDir = join(root, ".git");
  await mkdir(options.storeRepository ? join(commonDir, "arc", "store") : commonDir, { recursive: true });
  return { root, commonDir };
}
const found: GitExec = () => Promise.resolve({ stdout: "0123456789abcdef0123456789abcdef01234567\n" });
const absent: GitExec = () => Promise.reject(new Error("git rev-parse exited 1"));
const lookup = (gitDir: string): string[] => [`--git-dir=${gitDir}`, "rev-parse", "--verify", "--quiet", "refs/arc/project/registry"];

describe("imported store detection", () => {
  it("looks the registry ref up in the code repository when no store repository is installed", async () => {
    const { root, commonDir } = await checkout();
    const exec = vi.fn(found);
    expect(await storeImported(root, exec)).toBe(true);
    expect(exec).toHaveBeenCalledWith("git", lookup(commonDir), { cwd: root });
  });

  it("looks the registry ref up in the shared store repository once one is installed", async () => {
    const { root, commonDir } = await checkout({ storeRepository: true });
    const exec = vi.fn(found);
    expect(await storeImported(root, exec)).toBe(true);
    expect(exec).toHaveBeenCalledWith("git", lookup(join(commonDir, "arc", "store")), { cwd: root });
  });

  it("leaves writes open when the ref is absent, its lookup fails, or no repository can be read", async () => {
    const { root } = await checkout();
    expect(await storeImported(root, absent)).toBe(false);
    const exec = vi.fn(found);
    expect(await storeImported(join(root, "not-a-checkout"), exec)).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  it("finds the repository through a writer's own Git runner when the writer holds no checkout path", async () => {
    const { commonDir } = await checkout({ storeRepository: true });
    const exec = vi.fn<GitExec>((_command, args) => (args[0] === "rev-parse"
      ? Promise.resolve({ stdout: `${commonDir}\n` }) : found("git", args)));
    expect(await storeImportedHere(exec)).toBe(true);
    expect(exec.mock.calls.map(([, args]) => args)).toEqual([
      ["rev-parse", "--path-format=absolute", "--git-common-dir"], lookup(join(commonDir, "arc", "store")),
    ]);
  });

  it("leaves a writer's identity writes open when its runner names no absolute repository or fails", async () => {
    expect(await storeImportedHere(() => Promise.resolve({ stdout: ".git\n" }))).toBe(false);
    expect(await storeImportedHere(absent)).toBe(false);
  });
});

describe("sealed write refusal", () => {
  it("is a recoverable store refusal naming the observed condition and a Git remedy", () => {
    const refusal = StoreRefusalSchema.parse(storeImportedRefusal());
    expect(refusal).toMatchObject({ code: "store-imported", class: "recoverable" });
    expect(refusal.condition).toMatch(/predates the storage cutover.*already been imported/su);
    expect(refusal.remedy.text).toMatch(/git merge .*rebuild/su);
    expect(refusal.remedy.text).not.toMatch(/refs\/arc|update-ref|delete|remove/iu);
  });

  it("throws before a sealed write, carrying the refusal and its text, and returns once the store is not imported", async () => {
    const { root } = await checkout();
    const refusal = storeImportedRefusal();
    const error = await refuseWriteIfStoreImported(root, found).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StoreImportedError);
    expect(error).toMatchObject({ code: "store.imported", refusal, message: `${refusal.condition} ${refusal.remedy.text}` });
    await expect(refuseWriteIfStoreImported(root, absent)).resolves.toBeUndefined();
  });
});
