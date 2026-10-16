import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { updateRefTransaction, type RefTransactionPorts } from "../../src/lib/git/ref-transaction.js";

const roots: string[] = [];
afterEach(async () => {
  await removeGitBackedDirs(roots.splice(0));
});

async function repository(format: string) {
  const root = await mkdtemp(join(tmpdir(), "arc-ref-transaction-"));
  roots.push(root);
  const ports = { exec: makeGitExec(root), execInput: makeGitExecInput(root) };
  await ports.exec("git", ["init", "--bare", `--ref-format=${format}`]);
  const tree = (await ports.execInput(["mktree"], "")).trim();
  const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.com"];
  const first = (await ports.exec("git", [...identity, "commit-tree", tree, "-m", "first"])).stdout.trim();
  const second = (await ports.exec("git", [...identity, "commit-tree", tree, "-p", first, "-m", "second"])).stdout.trim();
  return { root, ports, first, second };
}

async function refs(ports: RefTransactionPorts): Promise<Record<string, string>> {
  const { stdout } = await ports.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  return Object.fromEntries(stdout.trim().split("\n").filter(Boolean).map((line) => line.split(" ")));
}

async function holdLock(path: string) {
  const child = spawn(process.execPath, ["-e", `
    const fs = require("node:fs");
    const path = process.argv[1];
    fs.writeFileSync(path, "held", { flag: "wx" });
    const release = () => { fs.rmSync(path, { force: true }); process.exit(0); };
    setTimeout(release, 5000);
    process.stdin.resume();
    process.stdin.on("end", release);
    process.stdout.write("ready\\n");
  `, path], { stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => reject(new Error("Lock holder exited before readiness")));
    child.stdout.once("data", () => resolve());
  });
  return { child, closed };
}

describe.each(["files", "reftable"])("Git ref transactions (%s)", (format) => {
  it("creates, updates, and deletes with their expected values in one commit", async () => {
    const { ports, first, second } = await repository(format);
    await ports.exec("git", ["update-ref", "refs/arc/update", first]);
    await ports.exec("git", ["update-ref", "refs/arc/delete", first]);

    const result = await updateRefTransaction(ports, [
      { ref: "refs/arc/create", next: first, expected: null },
      { ref: "refs/arc/update", next: second, expected: first },
      { ref: "refs/arc/delete", delete: true, expected: first },
    ]);

    expect(result).toEqual({ status: "committed" });
    expect(await refs(ports)).toEqual({ "refs/arc/create": first, "refs/arc/update": second });
  });

  it("reports every mismatched tip without applying any change, then commits repaired expectations", async () => {
    const { ports, first, second } = await repository(format);
    const before = {
      "refs/arc/stable": first,
      "refs/arc/raced-create": second,
      "refs/arc/raced-update": second,
      "refs/arc/raced-delete": second,
    };
    for (const [ref, oid] of Object.entries(before)) await ports.exec("git", ["update-ref", ref, oid]);

    const result = await updateRefTransaction(ports, [
      { ref: "refs/arc/stable", next: second, expected: first },
      { ref: "refs/arc/new", next: first, expected: null },
      { ref: "refs/arc/raced-create", next: first, expected: null },
      { ref: "refs/arc/raced-update", next: first, expected: first },
      { ref: "refs/arc/raced-delete", delete: true, expected: first },
      { ref: "refs/arc/absent-update", next: first, expected: first },
      { ref: "refs/arc/absent-delete", delete: true, expected: first },
    ]);

    expect(result).toEqual({ status: "lost-race", refs: [
      { ref: "refs/arc/raced-create", expected: null, actual: second },
      { ref: "refs/arc/raced-update", expected: first, actual: second },
      { ref: "refs/arc/raced-delete", expected: first, actual: second },
      { ref: "refs/arc/absent-update", expected: first, actual: null },
      { ref: "refs/arc/absent-delete", expected: first, actual: null },
    ] });
    expect(await refs(ports)).toEqual(before);

    await expect(updateRefTransaction(ports, [
      { ref: "refs/arc/stable", next: second, expected: first },
      { ref: "refs/arc/new", next: first, expected: null },
      { ref: "refs/arc/raced-create", next: first, expected: second },
      { ref: "refs/arc/raced-update", next: first, expected: second },
      { ref: "refs/arc/raced-delete", delete: true, expected: second },
      { ref: "refs/arc/absent-update", next: first, expected: null },
    ])).resolves.toEqual({ status: "committed" });
    expect(await refs(ports)).toEqual({
      "refs/arc/stable": second, "refs/arc/new": first, "refs/arc/raced-create": first,
      "refs/arc/raced-update": first, "refs/arc/absent-update": first,
    });
  });


  it("keeps Git's stale-lock error when every tip matches and succeeds after repair", async () => {
    const { root, ports, first, second } = await repository(format);
    const ref = "refs/arc/locked";
    await ports.exec("git", ["update-ref", ref, first]);
    const lock = format === "reftable" ? join(root, "reftable", "tables.list.lock") : join(root, `${ref}.lock`);
    await writeFile(lock, "stale");
    const changes = [{ ref, next: second, expected: first }];

    await expect(updateRefTransaction(ports, changes, { lockWaitMs: 10 })).rejects.toMatchObject({
      kind: "nonzero-exit", exitCode: 128, stderr: expect.stringMatching(/\S/u),
    });
    expect(await refs(ports)).toEqual({ [ref]: first });
    await rm(lock);
    await expect(updateRefTransaction(ports, changes)).resolves.toEqual({ status: "committed" });
    expect(await refs(ports)).toEqual({ [ref]: second });
  });

  it("waits for another process to release its ref lock before committing", async () => {
    const { root, ports, first, second } = await repository(format);
    const ref = "refs/arc/contended";
    await ports.exec("git", ["update-ref", ref, first]);
    const lock = format === "reftable" ? join(root, "reftable", "tables.list.lock") : join(root, `${ref}.lock`);
    const { child, closed } = await holdLock(lock);
    const release = setTimeout(() => child.stdin.end(), 350);
    try {
      await expect(updateRefTransaction(ports, [{ ref, next: second, expected: first }]))
        .resolves.toEqual({ status: "committed" });
      expect(await refs(ports)).toEqual({ [ref]: second });
    } finally {
      clearTimeout(release);
      child.stdin.end();
      await closed;
    }
  }, 10_000);

  it("keeps a directory-collision error instead of mistaking a descendant for the requested ref", async () => {
    const { ports, first, second } = await repository(format);
    const ref = "refs/arc/prefix";
    await ports.exec("git", ["update-ref", `${ref}/child`, first]);
    const changes = [{ ref, next: second, expected: null }];

    await expect(updateRefTransaction(ports, changes)).rejects.toMatchObject({
      kind: "nonzero-exit", exitCode: 128, stderr: expect.stringMatching(/\S/u),
    });
    expect(await refs(ports)).toEqual({ [`${ref}/child`]: first });
    await ports.exec("git", ["update-ref", "-d", `${ref}/child`, first]);
    await expect(updateRefTransaction(ports, changes)).resolves.toEqual({ status: "committed" });
    expect(await refs(ports)).toEqual({ [ref]: second });
  });


  it("updates and deletes the named ref without following a symbolic ref into another namespace", async () => {
    const { ports, first, second } = await repository(format);
    const alias = "refs/arc/alias";
    const target = "refs/heads/protected";
    await ports.exec("git", ["update-ref", target, first]);
    await ports.exec("git", ["symbolic-ref", alias, target]);

    await expect(updateRefTransaction(ports, [{ ref: alias, next: second, expected: first }]))
      .resolves.toEqual({ status: "committed" });
    const targetAfterUpdate = (await ports.exec("git", ["rev-parse", target])).stdout;
    const recordsAfterUpdate = await refs(ports);

    await ports.exec("git", ["update-ref", target, first]);
    await ports.exec("git", ["symbolic-ref", alias, target]);
    await expect(updateRefTransaction(ports, [{ ref: alias, delete: true, expected: first }]))
      .resolves.toEqual({ status: "committed" });
    const targetAfterDelete = (await ports.exec("git", ["for-each-ref", "--format=%(objectname)", target])).stdout;
    const recordsAfterDelete = await refs(ports);
    expect({ targetAfterUpdate, recordsAfterUpdate, targetAfterDelete, recordsAfterDelete }).toEqual({
      targetAfterUpdate: first, recordsAfterUpdate: { [alias]: second },
      targetAfterDelete: first, recordsAfterDelete: {},
    });
  });

});
import { spawn } from "node:child_process";
