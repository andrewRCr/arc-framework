import { describe, expect, it } from "vitest";
import { parsePushPorcelain } from "../../../src/lib/git/push.js";
import { classifyPushOutcome } from "../../../src/lib/git/push-classification.js";

const first = "refs/arc/work/00000000-0000-4000-8000-000000000001", second = "refs/arc/project/registry";
const rejected = (ref: string, label: string, reason: string) => `!\t${"a".repeat(40)}:${ref}\t[${label}] (${reason})`;
const parsed = (rows: string[], stderr = "") => parsePushPorcelain(`To <remote>\n${rows.join("\n")}\nDone\n`, stderr, 1);

describe("state push classification", () => {
  it.each(["non-fast-forward", "fetch first", "stale info"])("recognizes the client race %s", (reason) => {
    expect(classifyPushOutcome(parsed([rejected(first, "rejected", reason)]))).toMatchObject({
      status: "lost-race", causes: [{ ref: first, disposition: "lost-race", reason }],
    });
  });
  it.each([
    "cannot lock ref 'refs/arc/work/example': is at another tip",
    "incorrect old value provided",
    "reference already exists",
    "reference does not exist",
    "TF401028: The reference has already been updated",
  ])("recognizes the server race %s", (reason) => {
    expect(classifyPushOutcome(parsed([rejected(first, "remote rejected", reason)]))).toMatchObject({
      status: "lost-race", causes: [{ ref: first, disposition: "lost-race", reason }],
    });
  });
  it.each(["failed to update ref", "pre-receive hook declined", "atomic transaction failed", "a host-specific refusal"])("reads %s by state", (reason) => {
    expect(classifyPushOutcome(parsed([rejected(first, "remote rejected", reason)]))).toMatchObject({
      status: "by-state", causes: [{ ref: first, disposition: "by-state", reason }],
    });
  });
  it.each([
    ["non-fast-forward", "rejected", "lost-race"],
    ["failed to update ref", "remote rejected", "by-state"],
    ["already exists", "rejected", "refused"],
  ])("reads atomic collateral by its %s cause", (reason, label, status) => {
    const result = classifyPushOutcome(parsed([rejected(first, label, reason), rejected(second, "rejected", "atomic push failed")]));
    expect(result).toMatchObject({ status, causes: [{ ref: first, disposition: status, reason }] });
  });
  it("does not call mixed known and unclassified causes a settled race", () => {
    expect(classifyPushOutcome(parsed([rejected(first, "rejected", "stale info"), rejected(second, "remote rejected", "failed to update ref")]))).toMatchObject({
      status: "by-state", causes: [{ ref: first, disposition: "lost-race" }, { ref: second, disposition: "by-state" }],
    });
  });
  it("retains a terminal cause beside an unclassified cause", () => {
    expect(classifyPushOutcome(parsed([rejected(first, "rejected", "already exists"), rejected(second, "remote rejected", "failed to update ref")]))).toMatchObject({
      status: "refused", reason: "rejected", causes: [{ ref: first, disposition: "refused" }, { ref: second, disposition: "by-state" }],
    });
  });
  it("reads cause-free atomic collateral by state", () => {
    expect(classifyPushOutcome(parsed([rejected(first, "remote rejected", "atomic push failure")]))).toMatchObject({ status: "by-state", causes: [] });
  });
  it("does not classify diagnostic prose as a per-ref cause", () => {
    const stderr = "remote: cannot lock ref appears in this hook's instructions\n";
    expect(classifyPushOutcome(parsed([rejected(first, "remote rejected", "pre-receive hook declined")], stderr))).toMatchObject({ status: "by-state" });
  });
  it("retains the server's remote lines verbatim in a terminal refusal", () => {
    const stderr = "remote: Policy refused this update.   \r\nremote: Repair it, then retry.\t\r\nerror: failed to push some refs\n";
    const outcome = parsed([rejected(first, "rejected", "already exists")], stderr), result = classifyPushOutcome(outcome);
    expect(result).toMatchObject({ status: "refused", reason: "rejected" });
    expect(result.message).toContain(stderr);
    expect(result.message).toContain(outcome.stdout);
  });
  it.each([
    ["pre-push refused this update\nerror: failed to push some refs\n", 1, "hook-declined"],
    ["fatal: the receiving end does not support --atomic push\n", 128, "atomic-unsupported"],
  ])("keeps the whole-push refusal %s", (stderr, exitCode, reason) => {
    expect(classifyPushOutcome(parsePushPorcelain("", stderr, exitCode))).toEqual({ status: "refused", reason, causes: [], message: stderr });
  });
  it.each(["network", "auth", "error", "timeout"] as const)("preserves unreachable cause %s", (cause) => {
    const stderr = "fatal: connection failed\n";
    expect(classifyPushOutcome(parsePushPorcelain("", stderr, 128, cause))).toEqual({ status: "unreachable", cause, message: stderr });
  });
  it("accepts successful per-ref and empty no-op reports", () => {
    for (const stdout of ["", `=\t${"a".repeat(40)}:${first}\t[up to date]\n`]) {
      expect(classifyPushOutcome(parsePushPorcelain(stdout, "", 0))).toEqual({ status: "ok", message: stdout });
    }
  });
});
