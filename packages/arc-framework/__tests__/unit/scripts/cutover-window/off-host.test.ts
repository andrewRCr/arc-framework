/** Host absence is an observation; unavailable evidence must never count as equality. */
import { expect, it } from "vitest";
import { windowHostTipFindings } from "../../../../src/scripts/cutover-window/off-host.js";

const head = "a".repeat(40), ahead = "b".repeat(40), branch = "feat/alpha";
const live = { [branch]: { local: head, origin: head, reasons: ["Fixture work unit"] } };
it.each([
  { host: null, fetched: head },
  { host: ahead, fetched: head },
  { host: undefined, fetched: undefined },
])("refuses mismatched or unavailable branch evidence: %j", ({ host, fetched }) => {
  const observed: Record<string, string | null> = host === undefined ? { main: head } : { main: head, [branch]: host };
  const origin: Record<string, string> = fetched === undefined ? {} : { [branch]: fetched };
  expect(windowHostTipFindings({ live, host: observed, origin }, head)).toEqual([
    expect.objectContaining({ subject: branch, remedy: expect.stringContaining("Fetch") }),
  ]);
  expect(windowHostTipFindings({ live, host: { main: head, [branch]: head }, origin: { [branch]: head } }, head)).toEqual([]);
  expect(windowHostTipFindings({ live, host: { main: head, [branch]: null }, origin: {} }, head)).toEqual([]);
});
