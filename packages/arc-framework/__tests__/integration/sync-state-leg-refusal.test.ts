/** Keep real Git receiver diagnostics visible through a failed state publication. */
import { expect, it } from "vitest";
import { runStateLeg } from "../../src/handlers/sync-state-leg.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed } from "../helpers/store/suite-tools.js";
import { makeCapturingSyncOutput } from "../helpers/sync-output.js";

it("reports the receiver's explanation without terminal controls in the state push failure", async () => {
  const fixture = await createRefFixture();
  fixture.remote(true);
  await seed(fixture, fixture.reference("personal/document"));
  const explanation = "Only release maintainers may update refs/arc/user/test-user/personal.";
  const colored = explanation.replace("release maintainers", "\u001b[31mrelease maintainers\u001b[0m");
  fixture.remoteState("refusing", `${colored}\b`);
  const { output, stderr } = makeCapturingSyncOutput();
  const input = { store: fixture.store, cwd: fixture.root, context: makeInteractionContext(), output };

  const { state, failed } = await runStateLeg(input);

  expect(failed).toBe(true);
  expect(state.push.result).toBe("failed");
  const terminalControl = /(?![\n\t])\p{Cc}/u;
  expect.soft(state.push.detail).toContain(explanation);
  expect.soft(state.push.detail).not.toMatch(terminalControl);
  const error = stderr.join("\n");
  expect.soft(error).toContain(explanation);
  expect.soft(error).not.toMatch(terminalControl);
  expect.soft(error).toMatch(/repair.*receiver.*retry/iu);
  fixture.remoteState("available");
  await expect(runStateLeg(input)).resolves.toMatchObject({ failed: false, state: { push: { result: "success" } } });
});
