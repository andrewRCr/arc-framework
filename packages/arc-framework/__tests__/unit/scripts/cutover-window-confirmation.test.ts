/** Confirmation validates all sides before any confirmation ref is written. */
import { expect, it } from "vitest";
import { windowConfirmationFindings, type WindowConfirmationTips } from "../../../src/scripts/cutover-window/confirmation.js";

it.each([
  { ranges: [], tips: { local: "current" }, message: "no range" },
  { ranges: [{ side: "local", tip: "current" }, { side: "origin", tip: "host" }], tips: { local: "current" }, message: "origin" },
  { ranges: [{ side: "local", tip: "current" }], tips: { local: "stale" }, message: "current mark" },
  { ranges: [{ side: "local", tip: "current" }], tips: { local: "current", origin: "host" }, message: "no origin range" },
] satisfies { ranges: { side: "local" | "origin"; tip: string }[]; tips: WindowConfirmationTips; message: string }[])("refuses invalid exact-tip authority: $message", ({ ranges, tips, message }) => {
  const findings = windowConfirmationFindings("feat/branch", ranges, tips);
  expect(findings.length).toBeGreaterThan(0);
  expect(findings.map(entry => `${entry.subject}: ${entry.condition}`).join("\n")).toContain(message);
  expect(findings.every(entry => entry.remedy.length > 0)).toBe(true);
});
