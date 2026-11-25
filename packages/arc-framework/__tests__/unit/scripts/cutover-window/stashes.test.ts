/** Stash listing decoding keeps complete positions and messages and refuses truncated evidence. */
import { expect, it } from "vitest";
import { resolve } from "node:path";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { parseWindowStashEntries, readWindowStashFindings } from "../../../../src/scripts/cutover-window/stashes.js";
import { WindowRefusal } from "../../../../src/scripts/cutover-window/result.js";

const first = "a".repeat(40), second = "b".repeat(64);
it.each([
  { source: "", entries: [] },
  { source: `${second}\0\0`, entries: [{ position: "stash@{0}", message: "", tip: second }] },
  { source: `${first}\0On main: Newer work\0${second}\0On feat/alpha: Older work\0`, entries: [
    { position: "stash@{0}", message: "On main: Newer work", tip: first },
    { position: "stash@{1}", message: "On feat/alpha: Older work", tip: second },
  ] },
])("decodes the complete native listing: %j", ({ source, entries }) => {
  expect(parseWindowStashEntries(source)).toEqual(entries);
});

it.each([
  `${first}\0Missing terminator`, `${first}\0`, `not-an-object\0Message\0`, `${first}\0Message\0\0`,
])("refuses incomplete or malformed stash evidence: %j", source => {
  expect(() => parseWindowStashEntries(source)).toThrow(WindowRefusal);
});

it("retains a shared-ref read failure and permits retry after access is repaired", async () => {
  const boundary = scriptGitExec([{ match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "--end-of-options", "refs/stash"],
    responses: [{ failure: { exitCode: 128, stderr: "fatal: shared ref access denied" } }, { failure: { exitCode: 1 } }] }]);
  const io = { repo: resolve("checkout"), exec: boundary.exec };
  await expect(readWindowStashFindings(io)).resolves.toEqual([expect.objectContaining({ subject: "refs/stash",
    condition: expect.stringContaining("shared ref access denied"), remedy: expect.stringContaining("retry check") })]);
  await expect(readWindowStashFindings(io)).resolves.toEqual([]);
});
