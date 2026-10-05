/** Passive Store composition never causes Git to fetch promised objects. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import type { GitExecOptions } from "../../src/lib/git/exec.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { trackedWriteFixture } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("leaves a missing promised meta local during passive listing and reads after explicit object repair", async () => {
  const h = await trackedWriteFixture();
  await h.exec("git", ["commit", "--allow-empty", "-m", "empty base"]);
  await h.exec("git", ["checkout", "-b", "feat/foreign"]);
  const content = makeMetaFixture("foreign", { branch: "feat/foreign" });
  await mkdir(join(h.root, ".arc/active"), { recursive: true });
  await writeFile(join(h.root, ".arc/active/meta-foreign.md"), content);
  await h.exec("git", ["add", "."]);
  await h.exec("git", ["commit", "-m", "foreign record"]);
  const blob = (await h.exec("git", ["rev-parse", "feat/foreign:.arc/active/meta-foreign.md"])).stdout.trim();
  await h.exec("git", ["checkout", "main"]);
  const server = join(h.root, "server.git"), partial = join(h.root, "partial");
  await h.exec("git", ["clone", "--bare", h.root, server]);
  await h.exec("git", ["config", "uploadpack.allowFilter", "true"], { cwd: server });
  await h.exec("git", ["clone", "--filter=blob:none", "--no-checkout", `file://${server}`, partial]);
  const actual = makeGitExec(partial);
  await expect(actual("git", ["cat-file", "-e", blob], { objectAccess: "local-only" })).rejects.toBeDefined();
  const calls: Array<{ args: string[]; options?: GitExecOptions }> = [];
  const exec: typeof actual = async (command, args, options) => {
    calls.push({ args, options });
    return actual(command, args, options);
  };
  const store = createStore(createDefaultStorePorts({ checkoutRoot: partial, exec, execInput: makeGitExecInput(partial) }));
  const tracePath = join(h.root, "passive-git-trace.log");
  await writeFile(tracePath, "");
  const previousTrace = process.env.GIT_TRACE;
  process.env.GIT_TRACE = tracePath;
  try {
    expect(success(await store.list({ family: "work-item", kind: "work-item/meta" }))).toMatchObject({
      status: "unreadable", condition: expect.stringContaining("foreign"), remedy: { text: expect.stringContaining("retry") },
    });
  }
  finally {
    if (previousTrace === undefined) delete process.env.GIT_TRACE;
    else process.env.GIT_TRACE = previousTrace;
  }
  const trace = await readFile(tracePath, "utf8");
  expect(trace).not.toMatch(/run_command: git.*fetch|built-in: git fetch|upload-pack/u);
  await expect(actual("git", ["cat-file", "-e", blob], { objectAccess: "local-only" })).rejects.toBeDefined();
  const branchReads = calls.filter(({ args }) => ["show", "ls-tree"].includes(args[0] ?? ""));
  expect(branchReads.length).toBeGreaterThan(0);
  expect(branchReads.every(({ options }) => options?.objectAccess === "local-only")).toBe(true);
  // Object repair is explicit and local; the passive operation itself supplies no network authority.
  const restored = await makeGitExecInput(partial)(["hash-object", "-w", "--stdin"], content);
  expect(restored.trim()).toBe(blob);
  const repaired = success(await store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(repaired).toMatchObject({ status: "complete", missed: false,
    records: [expect.objectContaining({ content, reference: expect.objectContaining({ owner: expect.objectContaining({ name: "foreign" }) }) })] });
  expect(calls.some(({ args }) => args[0] === "fetch" || args[0] === "push")).toBe(false);
});
