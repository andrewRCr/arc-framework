/** Only proven ancestry on a merge-commit host establishes that the flip merged. */
import { expect, it } from "vitest";
import { isWindowFlipMerged } from "../../../../src/scripts/cutover-window/merged-flip.js";
import type { WindowHostPort } from "../../../../src/scripts/cutover-window/host.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { GitExecScriptEntry } from "../../../helpers/git-exec-fake.js";
const tip = "a".repeat(40); const head = "b".repeat(40);
const resolveTip = ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${tip}^{commit}`];
const ancestry = ["--no-replace-objects", "merge-base", "--is-ancestor", head, tip];
const host: WindowHostPort = {
  refs: async () => ({ "refs/heads/main": tip }),
  mergeSettings: async () => { throw new Error("Unexpected merge settings read without a host"); },
  pullRequests: async () => { throw new Error("Unexpected request read"); },
  discoverRepository: async () => { throw new Error("Unexpected discovery"); },
};
const refusal = { findings: [expect.objectContaining({ condition: expect.any(String), remedy: expect.stringContaining("retry") })] };
function io(entries: GitExecScriptEntry[], port = host, hosted = false) {
  return { exec: scriptGitExec(entries).exec, repo: "/target", host: port, hosted };
}

it.each([0, 1, 128])("treats strict ancestry exit %s as merged, not merged, or refused", async exitCode => {
  const target = io([
    { match: resolveTip, responses: [{ stdout: tip }] },
    { match: ancestry, responses: [exitCode === 0 ? { stdout: "" } : { failure: { exitCode, stderr: "ancestry result" } }] },
  ]);
  if (exitCode === 128) await expect(isWindowFlipMerged(target, head)).rejects.toMatchObject(refusal);
  else expect(await isWindowFlipMerged(target, head)).toBe(exitCode === 0);
});

it.each([{ allowSquash: true, allowRebase: false }, { allowSquash: false, allowRebase: true }])(
  "refuses merge settings %j before reading ancestry", async settings => {
    const port = { ...host, mergeSettings: async () => settings,
      refs: async () => { throw new Error("Unexpected ref read before refusing merge settings"); } };
    await expect(isWindowFlipMerged(io([], port, true), head)).rejects.toMatchObject({ findings: [expect.objectContaining({
      condition: expect.stringContaining("merge commits"), remedy: expect.stringContaining("retry"),
    })] });
  },
);

it("accepts merge-commit-only host settings", async () => {
  const port = { ...host, mergeSettings: async () => ({ allowSquash: false, allowRebase: false }) };
  expect(await isWindowFlipMerged(io([
    { match: resolveTip, responses: [{ stdout: tip }] }, { match: ancestry, responses: [{ stdout: "" }] },
  ], port, true), head)).toBe(true);
});

it.each(["resolved", "still missing", "moved"])("fetches a missing main commit into a scratch ref: %s", async outcome => {
  const fetched = outcome === "moved" ? "c".repeat(40) : tip;
  const target = io([
    { match: resolveTip, responses: [{ failure: { exitCode: 1 } },
      outcome === "still missing" ? { failure: { exitCode: 1 } } : { stdout: tip }] },
    { match: { prefix: ["fetch", "--refmap=", "origin"] }, responses: [{ stdout: "" }] },
    { match: { predicate: args => args[0] === "--no-replace-objects" && args[1] === "rev-parse" &&
      args.at(-1)?.startsWith("refs/arc-window-scratch/") === true }, responses: [{ stdout: fetched }] },
    { match: { prefix: ["update-ref", "-d"] }, responses: [{ stdout: "" }] },
    { match: ancestry, responses: [{ stdout: "" }] },
  ]);
  if (outcome === "resolved") expect(await isWindowFlipMerged(target, head)).toBe(true);
  else await expect(isWindowFlipMerged(target, head)).rejects.toMatchObject(refusal);
});

it("refuses interrupted ancestry instead of calling it not merged", async () => {
  await expect(isWindowFlipMerged(io([
    { match: resolveTip, responses: [{ stdout: tip }] },
    { match: ancestry, responses: [{ failure: { isCanceled: true, stderr: "canceled" } }] },
  ]), head)).rejects.toMatchObject(refusal);
});

it("refuses when origin has no main tip", async () => {
  await expect(isWindowFlipMerged(io([], { ...host, refs: async () => ({}) }), head)).rejects.toMatchObject(refusal);
});
