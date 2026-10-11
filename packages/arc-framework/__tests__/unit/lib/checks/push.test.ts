/** Explicit Git ref input takes precedence over the manager environment. */
import { expect, it } from "vitest";
import { classifyPushRef, readPushEvent } from "../../../../src/lib/checks/push.js";
const tip = "a".repeat(40), old = "b".repeat(40);
it("captures complete stdin ref updates and positional remote identity", () => {
  expect(readPushEvent(`refs/heads/feature ${tip} refs/heads/feature ${old}\n`, "origin", "local-origin", {
    PRE_COMMIT_LOCAL_BRANCH: "refs/heads/another", PRE_COMMIT_REMOTE_NAME: "other",
  })).toEqual({ remote: "origin", url: "local-origin", refs: [
    { localRef: "refs/heads/feature", localOid: tip, remoteRef: "refs/heads/feature", remoteOid: old },
  ] });
});

it.each([
  { PRE_COMMIT_FROM_REF: old },
  { PRE_COMMIT_FROM_REF: old, PRE_COMMIT_TO_REF: "not-an-object" },
])("refuses an incomplete or malformed manager range: %j", coordinates => {
  expect(() => readPushEvent("", "", "", { PRE_COMMIT_LOCAL_BRANCH: "refs/heads/feature", ...coordinates }))
    .toThrow("Malformed pre-commit.com push range");
  expect(readPushEvent(`refs/heads/feature ${tip} refs/heads/feature ${old}\n`, "origin", "local-origin", coordinates).refs)
    .toHaveLength(1);
});

it.each([
  `refs/heads/feature ${tip} refs/heads/feature`,
  `refs/heads/feature not-an-object refs/heads/feature ${old}`,
  `refs/heads/feature ${tip} refs/heads/feature ${old} extra`,
])("refuses malformed ref input and accepts a corrected retry: %s", input => {
  expect(() => readPushEvent(input, "origin", "local-origin", {})).toThrow("Malformed Git push ref input");
  expect(readPushEvent(`refs/heads/feature ${tip} refs/heads/feature ${old}\n`, "origin", "local-origin", {}).refs)
    .toHaveLength(1);
});

it.each(["refs/heads/foreign", "refs/tags/review", "refs/heads/feature"])("selects only the current branch for %s", ref => {
  expect(classifyPushRef({ localRef: ref, localOid: tip }, "refs/heads/feature"))
    .toMatchObject({ ref, outcome: ref === "refs/heads/feature" ? "checked" : "not selected" });
});

it("gates a HEAD source through its symbolic checkout branch while retaining ref attribution", () => {
  expect(classifyPushRef({ localRef: "HEAD", localOid: tip }, "refs/heads/feature"))
    .toEqual({ ref: "HEAD", outcome: "checked" });
});

it.each([null, "refs/tags/review"])("leaves a HEAD source unselected outside a branch checkout: %s", currentRef => {
  expect(classifyPushRef({ localRef: "HEAD", localOid: tip }, currentRef))
    .toEqual({ ref: "HEAD", outcome: "not selected", reason: "no worktree for this pushed ref in the current checkout" });
});

it("selects no code ref in a detached checkout", () => {
  expect(classifyPushRef({ localRef: "refs/heads/feature", localOid: tip }, null))
    .toMatchObject({ outcome: "not selected" });
});

it("selects no tag even when HEAD points directly to it", () => {
  expect(classifyPushRef({ localRef: "refs/tags/review", localOid: tip }, "refs/tags/review"))
    .toMatchObject({ outcome: "not selected" });
});

it.each([
  { localRef: "refs/arc/state", localOid: tip, remoteRef: "refs/arc/state", remoteOid: old },
  { localRef: "refs/heads/feature", localOid: "0".repeat(40), remoteRef: "refs/heads/feature", remoteOid: old },
  { localRef: "(delete)", localOid: "0".repeat(64), remoteRef: "refs/heads/old", remoteOid: "b".repeat(64) },
])("skips updates carrying no gated code: %j", update => {
  expect(classifyPushRef(update)).toMatchObject({ ref: update.localRef, outcome: "skipped" });
});

it.each(["range", "whole new history"])("captures the manager's %s event when stdin and arguments are empty", kind => {
  const coordinates = kind === "range" ? { PRE_COMMIT_FROM_REF: old, PRE_COMMIT_TO_REF: tip } : {};
  expect(readPushEvent("", "", "", { ...coordinates, PRE_COMMIT_LOCAL_BRANCH: "refs/heads/feature",
    PRE_COMMIT_REMOTE_BRANCH: "refs/heads/destination", PRE_COMMIT_REMOTE_NAME: "upstream",
    PRE_COMMIT_REMOTE_URL: "local-upstream" })).toEqual({ remote: "upstream", url: "local-upstream", refs: [{
    localRef: "refs/heads/feature", remoteRef: "refs/heads/destination",
    ...(kind === "range" ? { localOid: tip, remoteOid: old } : {}),
  }] });
});
