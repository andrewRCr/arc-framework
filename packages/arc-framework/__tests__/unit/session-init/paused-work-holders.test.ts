/** A paused item never borrows a completed namesake's bound checkout. */
import { expect, it } from "vitest";
import { workUnitHoldersFixture } from "../../helpers/store/work-unit-holders.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { runPausedWork } from "../../../src/lib/session-init/paused-work.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";

it.each([false, true])("offers the live paused owner's actual holder action, live held=%s", async held => {
  const h = await workUnitHoldersFixture();
  if (held) await h.write(h.livePath, boundWorkUnitSubject(h.live));
  const pause = MetaPauseSchema.parse({ pausedBy: "test-user", since: "2026-10-24T00:00:00Z", reason: "Wait for review." });
  lifecycleSuccess(await h.store.write({ ...recordPut(h.live, { content: writeMetaPause(h.live.content, pause) }),
    provenance: { verb: "pause", lifecycleAction: "pause" } }));
  const result = await runPausedWork({ store: h.store, identity: "test-user", reviewAfterDays: 14,
    now: new Date("2026-10-24T01:00:00Z"), findHoldingCheckout: h.ports.findHoldingCheckout });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.actions[0]?.argv).toEqual(["arc", held ? "resume" : "materialize", "demo"]);
  expect(lifecycleSuccess(await h.store.read({ reference: h.archived.reference }))).toEqual(h.archived);
});
