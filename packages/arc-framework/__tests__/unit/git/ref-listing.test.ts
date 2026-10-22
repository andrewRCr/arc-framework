import { describe, expect, it } from "vitest";

import { retryTornRefListing } from "../../../src/lib/git/ref-listing.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

const args = ["for-each-ref", "--format=%(objectname)", "refs/arc/"];
const refusal = "fatal: Duplicated ref, and SHA1s don't match: refs/arc/work/a\n";

function tornListing() {
  return makeGitProcessError({ command: "git", args, exitCode: 128,
    stderr: `warning: Duplicated ref: refs/arc/work/b\n${refusal}` });
}

function scriptedListing(outcomes: readonly (Error | string)[]) {
  let calls = 0;
  const list = async () => {
    const outcome = outcomes[calls++];
    if (outcome === undefined) throw new Error("Listing ran more often than scripted");
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { list, calls: () => calls };
}

describe("refused torn ref listings", () => {
  it("runs a refused listing again and returns the next attempt's result", async () => {
    const { list, calls } = scriptedListing([tornListing(), "refs"]);
    await expect(retryTornRefListing(list)).resolves.toBe("refs");
    expect(calls()).toBe(2);
  });

  it("rethrows the third consecutive refusal unchanged", async () => {
    const third = tornListing();
    const { list, calls } = scriptedListing([tornListing(), tornListing(), third, "refs"]);
    await expect(retryTornRefListing(list)).rejects.toBe(third);
    expect(calls()).toBe(3);
  });

  it.each([
    ["another Git failure", makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "fatal: bad object refs/arc/work/a\n" })],
    ["a signal-ended Git call", makeGitProcessError({ command: "git", args, signal: "SIGTERM", stderr: refusal })],
    ["an error that is not Git's", new Error(refusal)],
  ])("rethrows %s on the first attempt", async (_label, failure) => {
    const { list, calls } = scriptedListing([failure, "refs"]);
    await expect(retryTornRefListing(list)).rejects.toBe(failure);
    expect(calls()).toBe(1);
  });
});
