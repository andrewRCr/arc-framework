/** Closing requires marks for recorded sides and confirmation of every retained changed range. */
import { expect, it } from "vitest";
import { windowCloseHeldFindings } from "../../../src/scripts/cutover-window/close-policy.js";
import type { WindowHeldMark, WindowHeldRange } from "../../../src/scripts/cutover-window/held-comparisons.js";
const branches = { main: { local: "main", origin: "main" }, "feat/flip": { local: "flip", origin: "flip" },
  "feat/a": { local: "base", origin: null } };
const mark: WindowHeldMark = { branch: "feat/a", side: "local", kind: "compared", recorded: "base", base: "base", tip: "mark",
  ref: "refs/arc-window/compared/local/feat/a", confirmation: null };

it("requires only the recorded non-main, non-flip sides", () => {
  const findings = windowCloseHeldFindings(branches, "feat/flip", { marks: [], ranges: [] });
  expect(findings).toHaveLength(1);
  expect(findings[0]?.subject).toBe("local/feat/a");
});

it.each([null, "older"])("refuses a range whose confirmation is %s", confirmation => {
  const range: WindowHeldRange = { branch: mark.branch, side: mark.side, kind: "moved", from: "base", tip: "mark",
    ref: mark.ref, confirmationRef: "refs/arc-window/confirmed/local/feat/a", confirmation };
  const findings = windowCloseHeldFindings(branches, "feat/flip", { marks: [mark], ranges: [range] });
  expect(findings).toHaveLength(1);
  expect(findings[0]?.condition).toContain("confirmation");
});
