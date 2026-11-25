/** Capture choices preserve the selected backend's adoption operand. */
import { describe, expect, it } from "vitest";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { prepareErrandAdoption } from "../../../src/lib/inbox/errand-adoption.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { entry } from "../../helpers/inbox-harness.js";

async function compile(input: AgendaCompileInput) {
  const result = await compileSessionInitAgenda(input);
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("store-backed Errand captures", () => {
  it.each([false, true])("offers distinct qualified IDs for flagged personal Errands with isolate=%s", async isolate => {
    const content = "## Errand\n\n" + [entry("11111111", "Same title", "- _Hold:_ `true`"),
      entry("22222222", "Same title", "- _Remind:_ `true`"), entry("33333333", "Unflagged")].join("\n\n")
      + "\n\n## Work Unit\n\n" + entry("44444444", "Work", "- _Hold:_ `true`");
    const { input } = await createSignalAgendaFixture(content);
    input.signals = { errand: true, ...(isolate ? { isolate: true as const } : {}) };
    const agenda = await compile(input);
    const offer = agenda.steps.at(-1);
    if (offer?.type !== "offer") throw new Error("Expected capture picker");
    expect(offer.choices).toEqual([
      { kind: "signal", label: "Same title (personal:11111111)", signal: "errand", value: "personal:11111111",
        recompile: ["arc", "agenda", "session-init", "--json", "--errand", "personal:11111111", ...(isolate ? ["--isolate"] : [])] },
      { kind: "signal", label: "Same title (personal:22222222)", signal: "errand", value: "personal:22222222",
        recompile: ["arc", "agenda", "session-init", "--json", "--errand", "personal:22222222", ...(isolate ? ["--isolate"] : [])] },
      { kind: "elicit", label: "Describe a new concern", signal: "errand",
        recompile: ["arc", "agenda", "session-init", "--json", ...(isolate ? ["--isolate"] : [])] },
      { kind: "signal", label: "Continue without an Errand", signal: "errand", value: null, decline: true,
        recompile: ["arc", "agenda", "session-init", "--json", "--answered", "errand:pick=decline"] },
    ]);
  });

  it.each(["personal", "project"] as const)("hands an explicit %s ID to the real adoption planner", async list => {
    const { input, inbox } = await createSignalAgendaFixture();
    await inbox.inbox(list, entry("12345678", "Selected concern"));
    const seed = `${list}:12345678`;
    input.signals = { errand: seed, isolate: true };
    const agenda = await compile(input);
    const step = agenda.steps.at(-1);
    if (step?.type !== "fragment") throw new Error("Expected launch fragment");
    expect(step.args).toEqual({ mode: "launch", seed, fromInbox: seed, isolate: true });
    const from = step.args.fromInbox;
    if (typeof from !== "string") throw new Error("Expected adoption operand");
    expect(await prepareErrandAdoption({ slug: "selected", from }, inbox.context))
      .toMatchObject({ status: "ok", result: { origin: { title: seed }, writes: expect.any(Array) } });
  });

  it("keeps a disappeared selection as a reference and permits retry after repair", async () => {
    const { input, inbox } = await createSignalAgendaFixture();
    input.signals = { errand: "personal:12345678" };
    const step = (await compile(input)).steps.at(-1);
    if (step?.type !== "fragment") throw new Error("Expected launch fragment");
    expect(step.args.fromInbox).toBe("personal:12345678");
    const from = step.args.fromInbox;
    if (typeof from !== "string") throw new Error("Expected adoption operand");
    expect(await prepareErrandAdoption({ slug: "selected", from }, inbox.context))
      .toMatchObject({ status: "refused", refusal: { code: "entry-gone" } });
    await inbox.inbox("personal", entry("12345678", "Restored concern"));
    expect(await prepareErrandAdoption({ slug: "selected", from }, inbox.context))
      .toMatchObject({ status: "ok", result: { origin: { title: from } } });
  });

  it("treats a flagged title as a new concern after the flip", async () => {
    const { input, inbox } = await createSignalAgendaFixture("## Errand\n\n" + entry("12345678", "Captured concern", "- _Hold:_ `true`"));
    input.signals = { errand: "Captured concern" };
    const step = (await compile(input)).steps.at(-1);
    if (step?.type !== "fragment") throw new Error("Expected launch fragment");
    expect(step.args).toEqual({ mode: "launch", seed: "Captured concern", isolate: false });
    const from = step.args.fromInbox;
    if (from !== undefined && typeof from !== "string") throw new Error("Unexpected adoption operand");
    expect(await prepareErrandAdoption({ slug: "new-concern", from, intent: "Captured concern" }, inbox.context))
      .toMatchObject({ status: "ok", result: { origin: null } });
  });

});
