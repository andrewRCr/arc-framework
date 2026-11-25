/** Only store-owned working namespaces prevent recording a window. */
import { expect, it } from "vitest";
import { isWindowStoreWorkingRef } from "../../../../src/scripts/cutover-window/preflight.js";

it.each(["designate", "follow", "migrate", "read", "seen", "version"])("reserves %s and its descendants", name => {
  expect(isWindowStoreWorkingRef(`refs/arc/tmp/${name}`)).toBe(true);
  expect(isWindowStoreWorkingRef(`refs/arc/tmp/${name}/operation`)).toBe(true);
});
it.each(["errand-close", "errand-pause/run", "base-head/run", "transient-discovery/run", "transient-materialize/run",
  "retirement-source/run", "migrate-old/run", "version-old", "delivery-candidates/run"])("permits unrelated temporary ref %s", name => {
  expect(isWindowStoreWorkingRef(`refs/arc/tmp/${name}`)).toBe(false);
});
it("does not classify a branch containing the namespace as a store working ref", () => {
  expect(isWindowStoreWorkingRef("refs/heads/foo/refs/arc/tmp/migrate/run")).toBe(false);
});
