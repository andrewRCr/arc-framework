/** Integration coverage for delimiter-preserving configured identity reads. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readConfiguredIdentity } from "../../src/lib/git/identity.js";
import type { GitExec } from "../../src/lib/git/index.js";
import { gitExec } from "../../src/lib/io-context.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("configured identity production Git boundary", () => {
  it("preserves canonical, padded, empty, and absent values through the NUL delimiter", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-identity-"));
    temporaryRoots.push(root);
    await gitExec("git", ["init"], { cwd: root });
    const exec: GitExec = (command, args, options) => gitExec(command, args, { ...options, cwd: root });

    await gitExec("git", ["config", "arc.identity", "andrew"], { cwd: root });
    await expect(readConfiguredIdentity(exec)).resolves.toBe("andrew");

    await gitExec("git", ["config", "arc.identity", " andrew "], { cwd: root });
    await expect(readConfiguredIdentity(exec)).rejects.toMatchObject({ code: "identity.invalid" });

    await gitExec("git", ["config", "arc.identity", ""], { cwd: root });
    await expect(readConfiguredIdentity(exec)).rejects.toMatchObject({ code: "identity.invalid" });

    await gitExec("git", ["config", "--unset", "arc.identity"], { cwd: root });
    await expect(readConfiguredIdentity(exec)).resolves.toBeNull();
  });
});
