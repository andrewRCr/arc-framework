/** Sealing anchors retain explicit rehearsal coordinates and repairable read failures. */
import { expect, it } from "vitest";
import { readWindowSealAnchor, readWindowCheckoutAncestryFindings } from "../../../../src/scripts/cutover-window/seals.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import type { WindowCheckout } from "../../../../src/scripts/cutover-window/checkouts.js";

const derived = "a".repeat(40), supplied = "b".repeat(40);

it("resolves an admitted supplied anchor instead of replacing it with the derived one", async () => {
  const exec = scriptGitExec([
    { match: { prefix: ["--no-replace-objects", "log"] }, responses: [{ stdout: derived }] },
    { match: ["--no-replace-objects", "rev-parse", "--verify", "--quiet", "--end-of-options", "bbbbbbbbbbbb^{commit}"],
      responses: [{ stdout: supplied }] },
  ]).exec;
  expect(await readWindowSealAnchor({ repo: "/target", exec }, "bbbbbbbbbbbb")).toBe(supplied);
});

it("preserves an anchor history read failure and resumes after Git access is repaired", async () => {
  const exec = scriptGitExec([{ match: { prefix: ["--no-replace-objects", "log"] }, responses: [
    { failure: { exitCode: 128, stderr: "anchor history unavailable" } }, { stdout: derived },
  ] }]).exec;
  await expect(readWindowSealAnchor({ repo: "/target", exec })).rejects.toMatchObject({ findings: [expect.objectContaining({
    subject: "sealing anchor", condition: expect.stringContaining("anchor history unavailable"), remedy: expect.stringContaining("retry"),
  })] });
  expect(await readWindowSealAnchor({ repo: "/target", exec })).toBe(derived);
});

const checkout: WindowCheckout = { path: "/target", head: supplied, branch: "main", primary: true, detached: false,
  folderPresent: true, kind: "primary", marker: { kind: "absent" } };

it("refuses a head outside the sealing history and passes after that checkout merges main", async () => {
  const merged = "c".repeat(40);
  const exec = scriptGitExec([
    { match: ["--no-replace-objects", "merge-base", "--is-ancestor", derived, checkout.head], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["--no-replace-objects", "merge-base", "--is-ancestor", derived, merged], responses: [{ stdout: "" }] },
  ]).exec;
  expect(await readWindowCheckoutAncestryFindings({ repo: "/target", exec }, [checkout], derived)).toEqual([expect.objectContaining({
    subject: checkout.path, condition: expect.stringContaining("does not descend"), remedy: expect.stringMatching(/merge main.*build:fast/iu),
  })]);
  expect(await readWindowCheckoutAncestryFindings({ repo: "/target", exec }, [{ ...checkout, head: merged }], derived)).toEqual([]);
});

it.each([{ exitCode: 128, stderr: "ancestry unavailable" }, { exitCode: 1, isCanceled: true, stderr: "ancestry interrupted" }])(
  "reports unproven sealing ancestry with a retry route: %j", async failure => {
    const exec = scriptGitExec([{ match: ["--no-replace-objects", "merge-base", "--is-ancestor", derived, checkout.head],
      responses: [{ failure }, { stdout: "" }] }]).exec;
    expect(await readWindowCheckoutAncestryFindings({ repo: "/target", exec }, [checkout], derived)).toEqual([expect.objectContaining({
      subject: checkout.path, condition: expect.stringContaining(failure.stderr), remedy: expect.stringContaining("retry"),
    })]);
    expect(await readWindowCheckoutAncestryFindings({ repo: "/target", exec }, [checkout], derived)).toEqual([]);
  });
