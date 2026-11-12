import { expect, it } from "vitest";
import { nativeWindowsCommandLineUnits, assertNativeGitCommandLineCapacity } from "../../../src/lib/git/command-line-capacity.js";

it.each([
  { command: "git", args: [""], expected: 7 },
  { command: "git", args: ["two words"], expected: 16 },
  { command: "git", args: ['a"b'], expected: 11 },
  { command: "git", args: ['a\\"b'], expected: 13 },
  { command: "git", args: ["a b\\"], expected: 12 },
  { command: "C:\\Program Files\\Git\\cmd\\git.exe", args: ["😀"], expected: 38 },
])("counts libuv serialization: $command $args", ({ command, args, expected }) => {
  expect(nativeWindowsCommandLineUnits(command, args)).toBe(expected);
});

it("admits the full native limit and refuses the next UTF-16 unit", () => {
  expect(() => assertNativeGitCommandLineCapacity("git", ["x".repeat(32_762)], "win32")).not.toThrow();
  expect(() => assertNativeGitCommandLineCapacity("git", ["x".repeat(32_763)], "win32")).toThrow(expect.objectContaining({
    kind: "command-line-capacity", stdout: "", stderr: "", commandLine: { units: 32_768, limit: 32_767 },
  }));
  expect(() => assertNativeGitCommandLineCapacity("git", ["x".repeat(40_000)], "linux")).not.toThrow();
});
