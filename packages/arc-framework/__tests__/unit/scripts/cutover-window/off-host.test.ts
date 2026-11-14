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

it("reads a live branch named like an inherited object property as unavailable when neither side holds it", () => {
  const inherited = { constructor: { local: head, origin: null, reasons: ["Fixture work unit"] } };
  expect(windowHostTipFindings({ live: inherited, host: { main: head }, origin: {} }, head)).toEqual([
    expect.objectContaining({ subject: "constructor", condition: "Fetched tip absent differs from host unavailable." }),
  ]);
  expect(windowHostTipFindings({ live: inherited, host: { main: head, constructor: head }, origin: { constructor: head } }, head))
    .toEqual([]);
});
