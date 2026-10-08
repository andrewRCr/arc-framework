/** Classify one lock observation and retry renewing fixture records deterministically. */
import { expect, it } from "vitest";
import { classifyAdvisoryLockRead } from "../../src/lib/advisory-lock.js";
import { readSettledLockHolder } from "../helpers/read-lock-holder.js";

const holder = { pid: 123, acquiredAt: 1, token: "owner", leaseUntil: 100, metadata: { tier: "unit" } };
const cases = [
  { label: "holder", input: { text: JSON.stringify(holder) }, expected: holder },
  { label: "absent", input: { error: { code: "ENOENT" } }, expected: "absent" },
  { label: "empty", input: { text: " \n" }, expected: "empty" },
  { label: "corrupt", input: { text: '{"pid":' }, expected: "corrupt" },
  { label: "unreadable", input: { error: { code: "EACCES" } }, expected: "unreadable" },
];
it.each(cases)("classifies a $label observation", ({ input, expected }) => {
  expect(classifyAdvisoryLockRead(input)).toEqual(expected);
});

it.each(["", '{"pid":'])("retries transient %j text until the holder is readable", async (first) => {
  const reads = [first, JSON.stringify(holder)];
  expect(await readSettledLockHolder("fixture.lock", {
    readFile: async () => reads.shift() ?? "",
    sleep: async () => {},
  })).toEqual(holder);
});

it.each(["", '{"pid":'])("names a lock that stays transient %j beyond the retry bound", async (text) => {
  let readsLeft = 2;
  await expect(readSettledLockHolder("unsettled.lock", {
    readFile: async () => readsLeft-- > 0 ? text : JSON.stringify(holder),
    sleep: async () => {},
    attempts: 2,
  })).rejects.toThrow("unsettled.lock");
});

it.each(["ENOENT", "EACCES"])("refuses a settled %s read failure without retrying", async (code) => {
  let first = true;
  await expect(readSettledLockHolder("missing.lock", {
    readFile: async () => {
      if (!first) return JSON.stringify(holder);
      first = false;
      throw Object.assign(new Error("read failed"), { code });
    },
    sleep: async () => {},
  })).rejects.toThrow("missing.lock");
});
