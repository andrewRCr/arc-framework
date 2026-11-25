/** Native follow history with a real merged-document advisory and interrupted copy ownership. */
import { expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lateFollowFixture } from "./follow.js";
import { capturedEntries } from "./ref-fixture-plant.js";
import { plantRef } from "./ref-plant.js";
import { invokeStoreRemote } from "./remote-command.js";
import { invokeStoreMigrate } from "./migrate-command.js";
import { createKindRegistry, type RefStorePorts, type WriteCheck } from "../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { makeGitProcessError } from "../git-exec-fake.js";

export const followAccountAdvisory = { condition: "Inspect the retained combined documents.", remedy: { text: "Keep the combined document result." } };

/** Prepare divergent native documents; checks remain armed only for the interrupted original copy. */
export async function followAccountFixture(source: "code" | "backing" = "code") {
  const h = await lateFollowFixture(true, source), original = h.follower.ports, root = h.follower.root;
  const personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const incoming = await plantRef(root, "refs/testing/account-source", [...entries,
    { path: "andrew/account-source.md", content: "Source document.\n" }], { parents: [before] });
  const destination = await plantRef(root, "refs/testing/account-destination", [...entries,
    { path: "andrew/account-destination.md", content: "Destination document.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.origin, `${incoming.tip}:${personal}`], { cwd: root });
  await original.exec("git", ["push", h.destinationDirectory, `${destination.tip}:${personal}`], { cwd: root });
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS); let armed = true, unreadable = false;
  const check: WriteCheck = async () => armed ? [{ rule: "account-documents", ...followAccountAdvisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    exec: async (command, args, options) => {
      if (unreadable && args.includes("fetch") && args.includes(h.destinationDirectory) && (options?.input?.split(/\r?\n/u) ?? []).some(arg => arg.includes("refs/arc/work/*:"))) {
        throw makeGitProcessError({ command, args, timedOut: true, stderr: "Original copy receiver is unreadable." });
      }
      return original.exec(command, args, options);
    } };
  return { h, root, original, ports, disarm: (uncertain = false) => { armed = false; unreadable = uncertain; },
    restoreReceiver: () => { unreadable = false; } };
}

/** Stop after actual publication, on either side of local confirmation, with no move record created. */
export async function interruptFollowAccount(f: Awaited<ReturnType<typeof followAccountFixture>>, outcome: "confirmed" | "unknown"): Promise<void> {
  let published = false;
  const ports: RefStorePorts = { ...f.ports,
    migrateStep: async step => { if (step === "follow.copied") throw new Error("Interrupted original follow account"); },
    exec: async (command, args, options) => {
      const result = await f.original.exec(command, args, options);
      if (args.includes("push") && args.includes(f.h.destinationDirectory)) published = true;
      return result;
    },
    execInput: async (args, input, options) => {
      if (outcome === "unknown" && published && args.includes("update-ref")) throw new Error("Interrupted original follow account");
      return f.original.execInput(args, input, options);
    } };
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: f.root, ports })).rejects.toThrow("Interrupted original follow account");
  f.disarm(outcome === "unknown");
}

/** Move the original destination again and update the follower's tracked pointer through real files and Git. */
export async function advanceFollowAccount(f: Awaited<ReturnType<typeof followAccountFixture>>): Promise<string> {
  const current = join(f.h.a.root, "account-current-home.git");
  await f.h.a.exec("git", ["init", "--bare", current]);
  expect(await invokeStoreMigrate(["--to", current], f.h.ports)).toMatchObject({ status: "ok" });
  await writeFile(f.h.follower.config, `storage.backing_repository: ${JSON.stringify(current)}\n`);
  return current;
}

/** Observe actual remote state independently of the command's report. */
export async function followAccountRemoteRefs(f: Awaited<ReturnType<typeof followAccountFixture>>, remote: string): Promise<string> {
  return (await f.original.exec("git", [`--git-dir=${remote}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: f.root })).stdout;
}
