/** Explicit entry fixtures bind real personal readers to an in-memory operational store. */
import type { AgendaCompileInput } from "../../src/commands/agenda/compile-input.js";
import { describeStorePull } from "../../src/lib/session-init/store-user-pull.js";
import { createAgendaFixtureInput } from "./agenda-fixtures.js";
import { activeSessionInit, derivedFrameFromActive, sessionInitFixture, userSessionInit, type SessionInitProbeOverrides } from "./session-init-fixtures.js";
import { createInboxHarness } from "./inbox-harness.js";
import { createTestStatusContext } from "./status-context.js";

/** Build a complete served envelope and matching entry context without a real Git repository. */
export async function createSignalAgendaFixture(content?: string, probes: SessionInitProbeOverrides = {}, stateOffBranch = true) {
  const inbox = createInboxHarness();
  if (content !== undefined) await inbox.inbox("personal", content);
  const context = await createTestStatusContext({ store: inbox.fixture.store, identity: "test-user", cwd: "/repo" });
  const envelope = await sessionInitFixture({
    ...(stateOffBranch ? { derivedLocusState: async () => derivedFrameFromActive(activeSessionInit(), "test-user", null, null, null, true) } : {}),
    user: async () => stateOffBranch ? describeStorePull({ status: "no-remote" }) : userSessionInit({ identity: "test-user" }), ...probes }, { identity: "test-user", stateOffBranch });
  const input: AgendaCompileInput = { ...createAgendaFixtureInput(envelope, { read: {
    exists: async () => true, size: async () => 1000, read: async () => "",
    git: async () => { throw new Error("Unexpected signal Git read"); },
  } }), entry: { ...context, store: stateOffBranch ? context.store : undefined } };
  return { input, inbox };
}
