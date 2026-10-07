/** Native artifact exclusion between owning checkout actions. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { readSettledLockHolder } from "../helpers/read-lock-holder.js";
import {
  BUILD_ARTIFACT_LOCK_NAME, withBuildArtifactOwnership, withTestArtifactOwnership,
} from "../../src/lib/build-ownership.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";
import { withLocalHeavyTestAdmission } from "../../src/lib/local-test-admission.js";

function admissionGit(root: string) {
  return scriptGitExec([
    { match: ["rev-parse", "--show-toplevel"], responses: [{ stdout: `${root}\n`, stderr: "" }] },
    { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: `${join(root, ".git")}\n`, stderr: "" }] },
    { match: ["branch", "--show-current"], responses: [{ stdout: "feat/fixture\n", stderr: "" }] },
  ]).exec;
}

it("acquires CPU admission before checkout artifacts and releases both after the action", async () => {
  const packageRoot = await mkdtemp(join(tmpdir(), "arc-ordered-ownership-"));
  const input = { packageRoot, cwd: packageRoot, env: {}, tier: "integration" as const };
  const cpuPath = join(packageRoot, ".git/arc/test-suite/.local-heavy-tests.lock");
  const artifactPath = join(packageRoot, BUILD_ARTIFACT_LOCK_NAME);
  let release: (() => void) | undefined;
  let ready: (() => void) | undefined;
  let waiting = false;
  const entered = new Promise<void>((resolve) => { ready = resolve; });
  const first = withLocalHeavyTestAdmission(input, async () => {
    ready?.();
    await new Promise<void>((resolve) => { release = resolve; });
  }, { git: admissionGit(packageRoot) });
  await entered;
  const second = withTestArtifactOwnership(input, async () => {
    const cpu: unknown = await readSettledLockHolder(cpuPath);
    const artifacts: unknown = await readSettledLockHolder(artifactPath);
    expect(cpu).toMatchObject({ pid: process.pid });
    expect(artifacts).toMatchObject({ pid: process.pid });
    return "executed under both owners";
  }, { admission: { git: admissionGit(packageRoot), writeLine: () => { waiting = true; } } });
  try {
    await vi.waitFor(() => expect(waiting).toBe(true));
    await expect(readFile(artifactPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    release?.();
    await first;
    expect((await second).result).toBe("executed under both owners");
    await expect(readFile(cpuPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(artifactPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    release?.();
    await Promise.allSettled([first, second]);
    await rm(packageRoot, { recursive: true, force: true });
  }
});

it("queues a same-checkout builder until the consuming action releases", async () => {
  const packageRoot = await mkdtemp(join(tmpdir(), "arc-artifact-owner-"));
  let release: (() => void) | undefined;
  let ready: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => { ready = resolve; });
  const first = withBuildArtifactOwnership({ packageRoot, operation: "integration closing" }, async () => {
    ready?.();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await entered;
  const diagnostics: string[] = [];
  const second = withBuildArtifactOwnership({ packageRoot, operation: "manual fast build" }, async () => "built",
    { writeLine: (line) => diagnostics.push(line) });
  try {
    const state = await Promise.race([second.then(() => "built"),
      new Promise<string>((resolve) => setTimeout(() => resolve("queued"), 50))]);
    expect(state).toBe("queued");
    await vi.waitFor(() => expect(diagnostics.join("\n")).toContain("integration closing"));
    expect(diagnostics.join("\n")).toContain("interrupt this command to cancel");
    release?.();
    await first;
    await expect(second).resolves.toBe("built");
  } finally {
    release?.();
    await Promise.allSettled([first, second]);
    await rm(packageRoot, { recursive: true, force: true });
  }
});

for (const env of [{ CI: "true" }, { ARC_TEST_ALLOW_CONCURRENCY: "1" }]) {
  it(`retains artifact exclusion when CPU admission is bypassed by ${Object.keys(env)[0]}`, async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), "arc-bypass-artifacts-"));
    let release: (() => void) | undefined;
    let ready: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { ready = resolve; });
    const first = withBuildArtifactOwnership({ packageRoot, operation: "manual build" }, async () => {
      ready?.();
      await new Promise<void>((resolve) => { release = resolve; });
    });
    await entered;
    const second = withTestArtifactOwnership({ packageRoot, cwd: packageRoot, env, tier: "integration" },
      async () => "passed", { artifacts: { writeLine: () => {} } });
    try {
      const state = await Promise.race([second.then(() => "executed"),
        new Promise<string>((resolve) => setTimeout(() => resolve("queued"), 50))]);
      expect(state).toBe("queued");
      release?.();
      await first;
      await expect(second).resolves.toEqual({ result: "passed" });
    } finally {
      release?.();
      await Promise.allSettled([first, second]);
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
}

it("allows another checkout to progress while the first retains ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-independent-artifacts-"));
  const firstRoot = join(root, "first");
  const secondRoot = join(root, "second");
  await Promise.all([mkdir(firstRoot), mkdir(secondRoot)]);
  let release: (() => void) | undefined;
  let ready: (() => void) | undefined;
  let secondComplete = false;
  const entered = new Promise<void>((resolve) => { ready = resolve; });
  const first = withBuildArtifactOwnership({ packageRoot: firstRoot, operation: "test closing" }, async () => {
    ready?.();
    await new Promise<void>((resolve) => { release = resolve; });
  });
  await entered;
  const second = withBuildArtifactOwnership({ packageRoot: secondRoot, operation: "full build" }, async () => {
    secondComplete = true;
  });
  try { await vi.waitFor(() => expect(secondComplete).toBe(true)); }
  finally {
    release?.();
    await Promise.allSettled([first, second]);
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses publication after native ownership replacement and allows repaired acquisition", async () => {
  const packageRoot = await mkdtemp(join(tmpdir(), "arc-lost-artifact-owner-"));
  const lockPath = join(packageRoot, BUILD_ARTIFACT_LOCK_NAME);
  let published = false;
  let stopped = false;
  try {
    await expect(withBuildArtifactOwnership({ packageRoot, operation: "compiler" }, async (lease) => {
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: Date.now(), token: "replacement" }));
      await lease.confirmOwnership();
      published = true;
    }, { terminateProcess: () => { stopped = true; }, writeLine: () => {} })).rejects.toThrow(/ownership/iu);
    expect(published).toBe(false);
    expect(stopped).toBe(true);
    await rm(lockPath);
    await expect(withBuildArtifactOwnership({ packageRoot, operation: "repaired build" }, async (lease) => {
      await lease.confirmOwnership();
      return "qualified";
    })).resolves.toBe("qualified");
  } finally { await rm(packageRoot, { recursive: true, force: true }); }
});
