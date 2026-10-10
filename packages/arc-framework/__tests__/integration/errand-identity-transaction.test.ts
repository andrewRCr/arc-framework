/** Complete-basis identity transactions over real local and remote refs. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  type ErrandRecordIO,
  type TransientIdentityRecord,
} from "../../src/lib/errand/index.js";
import { readTransientIdentitySnapshot } from "../../src/lib/errand/identity-snapshot.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
} from "../helpers/integration.js";

const IDENTITY = "andrew";
const timestamp = "2026-07-18T00:00:00.000Z";

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

function record(slug: string, intent = slug): TransientIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "errand",
    slug,
    claimId: `${slug.charCodeAt(0).toString(16).padStart(2, "0")}`.repeat(16),
    purpose: "errand",
    origin: "description",
    originEntry: null,
    intent,
    branch: `chore/${slug}`,
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function addRecord(
  io: ErrandRecordIO,
  slug: string,
  remote: string | null,
  intent = slug,
) {
  return transactTransientIdentities(io, {
    remote,
    message: `add ${slug}`,
    transform: (basis) => {
      if (basis.has(slug)) return { kind: "idempotent", value: slug };
      return { kind: "applied", records: new Map([...basis, [slug, record(slug, intent)]]), value: slug };
    },
  });
}

async function replaceRecord(
  io: ErrandRecordIO,
  slug: string,
  intent: string,
  remote: string | null,
) {
  return transactTransientIdentities(io, {
    remote,
    message: `replace ${slug}`,
    transform: (basis) => ({
      kind: "applied",
      records: new Map([...basis, [slug, record(slug, intent)]]),
      value: intent,
    }),
  });
}

describe("identity transactions", () => {
  let dir: string;
  let remoteDir: string | undefined;

  beforeEach(async () => {
    remoteDir = undefined;
    dir = await createTempRepo();
    await makeCommit(dir, "init");
  });

  afterEach(async () => {
    await Promise.all([dir, remoteDir].filter((path): path is string => path !== undefined).map(cleanupTempDir));
  });

  it("applies and re-enters an idempotent local-only transform", async () => {
    const io = ioFor(dir);
    await expect(addRecord(io, "alpha", null)).resolves.toMatchObject({ kind: "applied", value: "alpha" });
    await expect(addRecord(io, "alpha", null)).resolves.toMatchObject({ kind: "idempotent", value: "alpha" });

    const snapshot = await readTransientIdentitySnapshot(io);
    expect(snapshot).toMatchObject({ kind: "complete", diagnostics: [] });
    if (snapshot.kind !== "complete") throw new Error("expected complete snapshot");
    expect([...snapshot.records.keys()]).toEqual(["alpha"]);
  });

  it("creates an absent remote ref and cleans its caller-unique temporary ref", async () => {
    remoteDir = await addBareRemote(dir);
    const io = ioFor(dir);
    await expect(addRecord(io, "alpha", "origin")).resolves.toMatchObject({ kind: "applied" });

    const { stdout: remoteTip } = await execFileAsync(
      "git",
      ["ls-remote", "origin", "refs/arc/user/andrew/errands"],
      { cwd: dir },
    );
    const { stdout: temporaryRefs } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/arc/user/andrew/errands__transaction__"],
      { cwd: dir },
    );
    expect(remoteTip.trim()).not.toBe("");
    expect(temporaryRefs).toBe("");
  });

  it("publishes an already-local idempotent state when the remote ref is absent", async () => {
    remoteDir = await addBareRemote(dir);
    const io = ioFor(dir);
    await addRecord(io, "alpha", null);
    const outcome = await transactTransientIdentities(io, {
      remote: "origin",
      message: "publish local identity",
      transform: () => ({ kind: "idempotent", value: "alpha" }),
    });

    expect(outcome).toMatchObject({ kind: "idempotent", value: "alpha" });
    const { stdout } = await execFileAsync(
      "git",
      ["ls-remote", "origin", "refs/arc/user/andrew/errands"],
      { cwd: dir },
    );
    expect(stdout.trim()).not.toBe("");
  });

  it("unions independent local and remote changes from their common basis", async () => {
    remoteDir = await addBareRemote(dir);
    const local = ioFor(dir);
    await addRecord(local, "base", "origin");
    await addRecord(local, "local", null);

    const siblingDir = await createTempRepo();
    try {
      await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: siblingDir });
      const sibling = ioFor(siblingDir);
      await addRecord(sibling, "remote", "origin");

      const outcome = await transactTransientIdentities(local, {
        remote: "origin",
        message: "reconcile independent identities",
        transform: () => ({ kind: "idempotent", value: "reconciled" }),
      });
      expect(outcome).toMatchObject({ kind: "idempotent", value: "reconciled" });
      const snapshot = await readTransientIdentitySnapshot(local);
      if (snapshot.kind !== "complete") throw new Error("expected complete snapshot");
      expect([...snapshot.records.keys()].sort()).toEqual(["base", "local", "remote"]);
    } finally {
      await cleanupTempDir(siblingDir);
    }
  });

  it("refuses divergent updates to the same key", async () => {
    remoteDir = await addBareRemote(dir);
    const local = ioFor(dir);
    await addRecord(local, "shared", "origin", "base");
    await replaceRecord(local, "shared", "local", null);

    const siblingDir = await createTempRepo();
    try {
      await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: siblingDir });
      const sibling = ioFor(siblingDir);
      await replaceRecord(sibling, "shared", "remote", "origin");
      await expect(transactTransientIdentities(local, {
        remote: "origin",
        message: "refuse divergent identity",
        transform: () => ({ kind: "idempotent", value: null }),
      })).resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining("shared") });
    } finally {
      await cleanupTempDir(siblingDir);
    }
  });

  it("reports a configured remote outage without treating it as absence", async () => {
    await expect(addRecord(ioFor(dir), "alpha", "missing-remote")).resolves.toMatchObject({
      kind: "error",
      stage: "fetch",
    });
  });

  it("refuses a malformed complete basis before invoking the transform", async () => {
    const io = ioFor(dir);
    const oid = (await io.execInput(["hash-object", "-w", "--stdin"], "{bad")).trim();
    await writeTreeCommit(io, new Map([["broken", oid]]), "seed malformed", [], null);

    let invoked = false;
    const outcome = await transactTransientIdentities(io, {
      remote: null,
      message: "must not write",
      transform: () => {
        invoked = true;
        return { kind: "idempotent", value: null };
      },
    });
    expect(outcome).toMatchObject({ kind: "error", stage: "basis" });
    expect(invoked).toBe(false);
  });

  it("preserves an ambiguous push failure and re-enters idempotently on explicit retry", async () => {
    remoteDir = await addBareRemote(dir);
    const real = ioFor(dir);
    let ambiguous = true;
    let original: Error | undefined;
    const exec: GitExec = async (command, args, options) => {
      const result = await real.exec(command, args, options);
      if (ambiguous && args[0] === "push" && args.at(-1)?.includes("refs/arc/user/andrew/errands") === true) {
        ambiguous = false;
        original = makeGitProcessError({ command, args, exitCode: 128,
          stderr: "connection reset after remote accepted the update" });
        throw original;
      }
      return result;
    };
    const outcome = await addRecord({ ...real, exec }, "alpha", "origin");

    expect(outcome).toMatchObject({ kind: "error", stage: "push", error: original,
      remoteFailure: { code: "unreachable", cause: "network" } });
    const snapshot = await readTransientIdentitySnapshot(real);
    if (snapshot.kind !== "complete") throw new Error("expected complete snapshot");
    expect(snapshot.records.has("alpha")).toBe(true);
    await expect(addRecord(real, "alpha", "origin")).resolves.toMatchObject({ kind: "idempotent", value: "alpha" });
  });

  it("reports the repeated push failure that exhausts reconciliation", async () => {
    remoteDir = await addBareRemote(dir);
    const real = ioFor(dir);
    const exec: GitExec = async (command, args, options) => {
      if (args[0] === "push") {
        throw makeGitProcessError({ command, args, exitCode: 1, stderr: "pre-receive hook declined" });
      }
      return real.exec(command, args, options);
    };

    await expect(addRecord({ ...real, exec }, "alpha", "origin")).resolves.toMatchObject({
      kind: "error",
      stage: "push",
      message: expect.stringContaining("pre-receive hook declined"),
    });
  });

  it("retries local compare-and-swap rejection and reports exhausted contention", async () => {
    const real = ioFor(dir);
    let failures = 1;
    const retrying: GitExec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === "refs/arc/user/andrew/errands" && failures > 0) {
        failures -= 1;
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "reference already exists" });
      }
      return real.exec(command, args, options);
    };
    await expect(addRecord({ ...real, exec: retrying }, "alpha", null)).resolves.toMatchObject({ kind: "applied" });

    const alwaysContended: GitExec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === "refs/arc/user/andrew/errands") {
        throw makeGitProcessError({ command, args, exitCode: 128,
          stderr: "is at current but expected stale" });
      }
      return real.exec(command, args, options);
    };
    await expect(addRecord({ ...real, exec: alwaysContended }, "beta", null)).resolves.toMatchObject({
      kind: "error",
      stage: "write",
    });
  });

  it("surfaces temporary-ref cleanup uncertainty", async () => {
    remoteDir = await addBareRemote(dir);
    const real = ioFor(dir);
    const exec: GitExec = async (command, args, options) => {
      if (args[0] === "update-ref" && args[1] === "-d" && args[2]?.includes("__transaction__") === true) {
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "cannot clean temporary ref" });
      }
      return real.exec(command, args, options);
    };
    await expect(addRecord({ ...real, exec }, "alpha", "origin")).resolves.toMatchObject({
      kind: "error",
      stage: "cleanup",
    });
  });
});
