/** Keep real Git receiver diagnostics visible through a failed state publication. */
import { expect, it } from "vitest";
import { runStateLeg } from "../../src/handlers/sync-state-leg.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed } from "../helpers/store/suite-tools.js";
import { makeCapturingSyncOutput } from "../helpers/sync-output.js";

it("reports the receiver's explanation in the failed state push record and error", async () => {
  const fixture = await createRefFixture();
  fixture.remote(true);
  await seed(fixture, fixture.reference("personal/document"));
  const explanation = "Only release maintainers may update refs/arc/user/test-user/personal.";
  fixture.remoteState("refusing", explanation);
  const { output, stderr } = makeCapturingSyncOutput();
  const input = { store: fixture.store, cwd: fixture.root, context: makeInteractionContext(), output };

  const { state, failed } = await runStateLeg(input);

  expect(failed).toBe(true);
  expect(state.push.result).toBe("failed");
  expect.soft(state.push.detail).toContain(explanation);
  expect.soft(stderr).toContainEqual(expect.stringContaining(explanation));
  fixture.remoteState("available");
  await expect(runStateLeg(input)).resolves.toMatchObject({ failed: false, state: { push: { result: "success" } } });
});
