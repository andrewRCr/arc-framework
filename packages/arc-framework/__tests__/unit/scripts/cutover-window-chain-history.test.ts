/** Complete Candidate histories compare canonical records without collapsing changed generations. */
import { expect, it } from "vitest";
import { windowCandidateHistory } from "../../../src/scripts/cutover-window/chain-history.js";

it("collapses formatting-only repeats while retaining complete versions and nonadjacent returns", () => {
  expect(windowCandidateHistory(['{"recordRevision":"one","value":1}', '{ "value":1,"recordRevision":"one" }',
    '{"recordRevision":"two","value":1}', "legacy bytes", '{"recordRevision":"one","value":1}']))
    .toEqual(['json:{"recordRevision":"one","value":1}', 'json:{"recordRevision":"two","value":1}',
      "raw:legacy bytes", 'json:{"recordRevision":"one","value":1}']);
});
