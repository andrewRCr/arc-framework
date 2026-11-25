/** The rehearsal's import counts only under a finite address-space limit above its heap ceiling. */
import { expect, it } from "vitest";
import { rehearsalImportBoundsStop } from "../../../../src/scripts/cutover-window/rehearse-window.js";

it.each([
  [{ addressSpaceLimitMiB: "unlimited" as const, heapLimitMiB: 4144 }, "no address-space limit"],
  [{ addressSpaceLimitMiB: null, heapLimitMiB: 4144 }, "an unreadable address-space limit"],
  [{ addressSpaceLimitMiB: 4096, heapLimitMiB: 4144 }, "a 4096 MiB address-space limit"],
  [{ addressSpaceLimitMiB: 4144, heapLimitMiB: 4144 }, "a 4144 MiB address-space limit"],
])("stops an import that ran under %j", (bounds, ran) => {
  expect(rehearsalImportBoundsStop(bounds)).toBe(`The import ran under ${ran}, which must be finite and above its 4144 MiB heap ceiling. `
    + "Rehearse under such a limit, inherited or set through --cap-wrapper, with --heap-mb below it.");
});

it("passes an import that ran under a finite limit above its heap ceiling", () => {
  expect(rehearsalImportBoundsStop({ addressSpaceLimitMiB: 8192, heapLimitMiB: 4144 })).toBeNull();
});
