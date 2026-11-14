/** Save over the in-repo store names the step that keeps both its tracked and its personal state. */
import { expect, it } from "vitest";
import { projectionSaveResult } from "../../../../src/lib/store/projection/save.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import { projectionSaveStep } from "../../../../src/lib/store/pre-flip-steps.js";
import { inRepoStore } from "../../../helpers/store/in-repo-ports.js";

it("refuses before the flip, naming the tracked commit beside the personal save, with no runnable argv", async () => {
  const store = inRepoStore(createDefaultStorePorts({ checkoutRoot: "/checkout" }));
  expect(await projectionSaveResult(store)).toEqual({ status: "refused", refusal: { code: "unsupported",
    condition: "Projection save is unavailable with the current storage backend.", remedy: { text: projectionSaveStep() } } });
});
