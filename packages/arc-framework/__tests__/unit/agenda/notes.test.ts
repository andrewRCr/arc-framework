/** Notes pulls and loads retain their published policy, prompts, and one-load boundary. */

import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput } from "../../helpers/agenda-fixtures.js";
import { configSessionInit, dirtyState, sessionInitFixture, userSessionInit,
  type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { compileNotesSync } from "../../../src/commands/agenda/notes.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";

async function input(settings: Partial<Record<"session.init_pull.notes" | "session.init_load.notes", "always" | "prompt" | "manual">> = {},
  probes: SessionInitProbeOverrides = {}): Promise<AgendaCompileInput> {
  const config = configSessionInit();
  Object.assign(config.settings, settings);
  return createAgendaFixtureInput(await sessionInitFixture({ config: async () => config, ...probes }));
}
const remoteAhead = async () => userSessionInit({ state: "remote-ahead", refState: "remote-ahead", shouldPromptToPull: true });
const needsLoad = async () => userSessionInit({ loadNeeded: true });
const retired = async () => ({ candidates: [SlugSchema.parse("shipped")] });

describe("agenda notes synchronization", () => {
  it("runs an automatic notes pull and recompiles", async () => {
    const value = await input({ "session.init_pull.notes": "always" }, { user: remoteAhead });
    expect(compileNotesSync(value)).toMatchObject([{ type: "exec", id: "notes:pull",
      actions: [{ argv: ["arc", "user", "pull"] }], then: { kind: "recompile" } }]);
  });

  it("offers a prompted notes pull with the producer's text", async () => {
    const value = await input({}, { user: remoteAhead });
    const user = value.envelope.user;
    if (!user.ok || user.value === null || !("state" in user.value)) throw new Error("Expected notes-backed user state");
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:pull", ask: "now",
      text: user.value.recommendedPromptText,
      choices: [{ kind: "actions", actions: [{ argv: ["arc", "user", "pull"] }], then: { kind: "recompile" } },
      { kind: "bare", decline: true }],
    }]);
  });

  it.each(["always", "prompt"] as const)("suppresses a co-triggered load while notes pull policy is %s", async policy => {
    const value = await input({ "session.init_pull.notes": policy, "session.init_load.notes": "always" },
      { user: remoteAhead, retiredSubdirs: retired });
    const steps = compileNotesSync(value);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: policy === "always" ? "exec" : "offer", id: "notes:pull" });
  });

  it("automatically loads a current note whose disk is behind", async () => {
    const value = await input({ "session.init_load.notes": "always" }, { user: needsLoad });
    expect(compileNotesSync(value)).toMatchObject([{ type: "exec", id: "notes:load",
      actions: [{ argv: ["arc", "user", "load"] }], then: { kind: "recompile" } }]);
  });

  it("automatically loads for the retired-subdirectory trigger alone", async () => {
    const value = await input({ "session.init_load.notes": "always" }, { retiredSubdirs: retired });
    expect(compileNotesSync(value)).toMatchObject([{ type: "exec", id: "notes:load" }]);
  });

  it("loads once when disk lag and retired-subdirectory triggers both fire", async () => {
    const value = await input({ "session.init_load.notes": "always" }, { user: needsLoad, retiredSubdirs: retired });
    const steps = compileNotesSync(value);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "exec", id: "notes:load" });
  });

  it("uses the retired-subdirectory prompt under prompt policy", async () => {
    const value = await input({}, { retiredSubdirs: retired });
    const slot = value.envelope.retiredSubdirs;
    if (!slot?.ok) throw new Error("Expected a retired-subdirectory result");
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:load",
      text: slot.value.recommendedPromptText }]);
  });

  it("honors a retired-subdirectory dirty-tree prompt under always policy", async () => {
    const value = await input({ "session.init_load.notes": "always" }, { user: needsLoad, retiredSubdirs: retired,
      dirty: async () => dirtyState({ state: "dirty", fileCount: 1 }) });
    const slot = value.envelope.retiredSubdirs;
    if (!slot?.ok) throw new Error("Expected a retired-subdirectory result");
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:load",
      text: slot.value.recommendedPromptText }]);
  });

  it("uses the compiler's load prompt when disk lag is the only trigger", async () => {
    const value = await input({}, { user: needsLoad });
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:load",
      text: "Notes: local notes are current but disk lags the latest note. Load?" }]);
  });

  it("falls back to a load prompt when config fails", async () => {
    const value = await input({}, { user: needsLoad, config: async () => { throw new Error("config unreadable"); } });
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:load" }]);
  });

  it("keeps the independent retired trigger when user state fails", async () => {
    const value = await input({}, { retiredSubdirs: retired, user: async () => { throw new Error("notes unreadable"); } });
    expect(compileNotesSync(value)).toMatchObject([{ type: "offer", id: "notes:load" }]);
  });

  it("keeps a load-needed automatic load when no retired trigger adds a dirty warning", async () => {
    const value = await input({ "session.init_load.notes": "always" }, { user: needsLoad,
      dirty: async () => dirtyState({ state: "dirty", fileCount: 1 }) });
    expect(compileNotesSync(value)).toMatchObject([{ type: "exec", id: "notes:load" }]);
  });

  it("emits no load under manual policy", async () => {
    const value = await input({ "session.init_load.notes": "manual" }, { user: needsLoad, retiredSubdirs: retired });
    expect(compileNotesSync(value)).toEqual([]);
  });

  it("emits nothing when no load trigger or pull is present", async () => {
    expect(compileNotesSync(await input())).toEqual([]);
  });
});
