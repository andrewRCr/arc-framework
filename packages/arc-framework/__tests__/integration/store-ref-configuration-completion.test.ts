/** Configuration absence/no-op requires completed evidence before publication or repoint continues. */
import { describe, expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { switchFixture, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError, type GitFailureEvidence } from "../helpers/git-exec-fake.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const failures: { label: string; evidence: (exitCode: number) => (GitFailureEvidence & { isMaxBuffer?: true }) | undefined }[] = [
  { label: "signaled", evidence: exitCode => ({ exitCode, signal: "SIGTERM" }) },
  { label: "canceled", evidence: exitCode => ({ exitCode, isCanceled: true }) },
  { label: "timed out", evidence: exitCode => ({ exitCode, timedOut: true }) },
  { label: "output limited", evidence: exitCode => ({ exitCode, isMaxBuffer: true }) },
  { label: "different completed Git failure", evidence: () => ({ exitCode: 128 }) },
  { label: "untyped local failure", evidence: () => undefined },
];

function configurationFailure(args: string[], evidence: ReturnType<typeof failures[number]["evidence"]>): Error {
  return evidence ? makeGitProcessError({ command: "git", args, ...evidence }) : new Error("Local configuration read failed");
}

describe.each(["default", "separate"] as const)("configuration read completion in %s", layout => {
  it.each(failures)("preserves a $label rewrite read failure and publishes only after recovery", async ({ evidence }) => {
    const h = await refSyncFixture(layout);
    await h.a.exec("git", ["config", "remote.origin.arc-state", "off"]);
    if (layout === "separate") await h.a.git(["remote", "remove", "backing"]);
    await h.a.exec("git", ["remote", "add", "upstream", h.origin]);
    await h.a.exec("git", ["config", "remote.upstream.arc-state", "push"]);
    const reference = RecordReferenceSchema.parse({ ...personal, key: "complete-config.md" });
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "Unpublished until configuration is complete.\n", provenance }));
    const before = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    const failure = configurationFailure(["config", "--null", "--get-regexp", "^url\\..*\\.(insteadof|pushinsteadof)$"], evidence(1));
    let broken = true;
    const store = createRefStore({ ...h.a.ports, exec: (command, args, options) => {
      if (broken && args.includes("config") && args.includes("--get-regexp") && args.some(arg => arg.startsWith("^url\\."))) throw failure;
      return h.a.ports.exec(command, args, options);
    } });
    await expect(store.push()).rejects.toBe(failure);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
    expect(success(await store.read({ reference })).content).toBe("Unpublished until configuration is complete.\n");
    broken = false;
    expect(success(await store.push()).publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    expect((await h.remote("git", ["grep", "-F", "Unpublished until configuration is complete.", "refs/arc/user/andrew/personal"])).stdout)
      .toContain("Unpublished until configuration is complete.");
  }, 60_000);
});

it.each(failures)("holds a repoint after a $label unset-all failure and retries completed no-key evidence", async ({ evidence }) => {
  const h = await switchFixture("backing", "backing");
  const before = (await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout;
  const failure = configurationFailure(["config", "--unset-all", "remote.backing.pushurl"], evidence(5));
  let broken = true;
  const ports = { ...h.ports, exec: (command: string, args: string[], options?: Parameters<typeof h.ports.exec>[2]) => {
    if (broken && args.includes("config") && args.includes("--unset-all") && args.at(-1) === "remote.backing.pushurl") throw failure;
    return h.ports.exec(command, args, options);
  } };
  await expect(invokeStoreMigrate(["--to", h.to], ports)).rejects.toBe(failure);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout.trim()).toBe("off");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout).toBe(before);
  broken = false;
  expect((await invokeStoreMigrate([], ports)).status).toBe("ok");
  success(await h.store.push());
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Pending local state.", "refs/arc/user/andrew/personal"])).stdout)
    .toContain("Pending local state.");
}, 60_000);
