/** Holder requests distinguish owner generations from unfinished creation claims. */
import { expect, it } from "vitest";
import { ownerHolderRequest } from "../../../src/lib/work-unit/locus-ports.js";
import { OwnerIdentitySchema } from "../../../src/lib/store/identity.js";
import { workUnitHoldersFixture } from "../../helpers/store/work-unit-holders.js";
import { boundWorkUnitSubject } from "../../helpers/store/bound-checkout.js";


it("passes over an archived bound namesake and locates only the requested live owner", async () => {
  const h = await workUnitHoldersFixture(), request = ownerHolderRequest(h.live);
  expect(await h.ports.checkMarkerExclusivity(request)).toEqual({ kind: "clear" });
  expect(await h.ports.findHoldingCheckout({ ...request, resolveLegacy: async () => { throw Error("No legacy scan"); } }))
    .toEqual({ kind: "none" });
  await h.write(h.livePath, boundWorkUnitSubject(h.live));
  expect(await h.ports.findHoldingCheckout({ ...request, resolveLegacy: async () => null }))
    .toEqual({ kind: "held", path: h.livePath });
  expect(await h.ports.checkMarkerExclusivity(request)).toMatchObject({ kind: "refused", checkoutPath: h.livePath });
  expect(await h.ports.findHoldingCheckout({ ...request, checkoutPath: h.livePath, resolveLegacy: async () => null }))
    .toEqual({ kind: "none" });
});

it("refuses duplicate owner UUIDs even when their marker names differ", async () => {
  const h = await workUnitHoldersFixture(), request = ownerHolderRequest(h.live);
  await h.write(h.oldPath, boundWorkUnitSubject(h.live, "former"));
  await h.write(h.livePath, boundWorkUnitSubject(h.live));
  await expect(h.ports.findHoldingCheckout({ ...request, resolveLegacy: async () => null }))
    .rejects.toThrow(/multiple marker holders/u);
  expect(await h.ports.checkMarkerExclusivity(request)).toMatchObject({ kind: "refused" });
  expect(await h.ports.findHoldingCheckout({ ...request, checkoutPath: h.oldPath, resolveLegacy: async () => null }))
    .toEqual({ kind: "held", path: h.livePath });
});

it("matches creation only to an unbound marker and excludes its own checkout", async () => {
  const h = await workUnitHoldersFixture(), request = { kind: "creation" as const, slug: "demo" };
  expect(await h.ports.checkMarkerExclusivity(request)).toEqual({ kind: "clear" });
  await h.write(h.livePath, { kind: "work-unit", name: "demo" });
  expect(await h.ports.checkMarkerExclusivity(request)).toMatchObject({ kind: "refused", checkoutPath: h.livePath });
  expect(await h.ports.findHoldingCheckout({ ...request, resolveLegacy: async () => null }))
    .toEqual({ kind: "held", path: h.livePath });
  expect(await h.ports.checkMarkerExclusivity({ ...request, checkoutPath: h.livePath })).toEqual({ kind: "clear" });
});

it("refuses an operational owner without a UUID instead of treating it as creation", async () => {
  const h = await workUnitHoldersFixture();
  const record = { ...h.live, reference: { ...h.live.reference,
    owner: OwnerIdentitySchema.parse({ type: "work-item", name: "demo" }) } };
  expect(() => ownerHolderRequest(record)).toThrow(/no owner UID.*Repair/u);
});
