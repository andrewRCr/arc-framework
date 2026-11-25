/** The projection's exclude list. */
import { expect, it } from "vitest";
import { projectionExcludePatterns } from "../../../../src/lib/store/projection/excludes.js";

it("lists the three shared roots and the machine-local folder as directory patterns, and no personal root", () => {
  expect(projectionExcludePatterns()).toEqual([".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.local/"]);
});
