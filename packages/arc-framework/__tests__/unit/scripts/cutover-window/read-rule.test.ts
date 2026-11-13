/** The read rule admits source and inherited content and rejects a distinct change. */
import { expect, it } from "vitest";
import { windowReadRulePasses } from "../../../../src/scripts/cutover-window/read-rule.js";

it.each([
  ["read", true], ["read-base", true], ["main-base", true], ["different", false],
] as const)("classifies %s content against the read and inherited content", (content, expected) => {
  expect(windowReadRulePasses({ path: ".arc/active/notes-alpha.md", content, allowed: ["read", "read-base", "main-base"] })).toBe(expected);
});

it("exempts ROADMAP content and absence from the rule", () => {
  expect(windowReadRulePasses({ path: ".arc/backlog/ROADMAP.md", content: "changed", allowed: ["prior"] })).toBe(true);
  expect(windowReadRulePasses({ path: ".arc/backlog/ROADMAP.md", content: null, allowed: [] })).toBe(true);
});

it("compares absence as content", () => {
  expect(windowReadRulePasses({ path: ".arc/active/notes-alpha.md", content: null, allowed: ["different", null] })).toBe(true);
  expect(windowReadRulePasses({ path: ".arc/active/notes-alpha.md", content: null, allowed: ["present"] })).toBe(false);
});
