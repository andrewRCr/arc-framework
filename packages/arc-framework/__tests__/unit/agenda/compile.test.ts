/** Agenda compilation returns a usable refusal for arms not implemented yet. */

import { describe, expect, it } from "vitest";
import { baseFrame, selectedRow, forRow, createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import type { AgendaReadPort } from "../../../src/commands/agenda/compile-input.js";

const noReads: AgendaReadPort = {
  exists: async () => { throw new Error("Unexpected file existence read"); },
  size: async () => { throw new Error("Unexpected size read"); },
  read: async () => { throw new Error("Unexpected content read"); },
  git: async () => { throw new Error("Unexpected Git read"); },
};

describe("session agenda compilation", () => {
  it("refuses an uncompiled arm with its selected row and a restart route", async () => {
    const row = selectedRow(baseFrame());
    const envelope = await forRow({ ...row, kind: "unmanaged-checkout", subject: null,
      checkout: { ...row.checkout, path: "/linked", primary: false, branch: "feat/unmanaged" } });
    const result = await compileSessionInitAgenda(createAgendaFixtureInput(envelope, { signals: {},
      answers: { answered: {}, done: [] }, read: noReads }));
    expect(result).toEqual({ ok: false, refusal: {
      code: "row-not-compiled", flags: [], row: "cold-start",
      remedy: expect.stringMatching(/cold-start.*session-init\.md.*base branch.*another checkout/u),
    } });
  });
});
