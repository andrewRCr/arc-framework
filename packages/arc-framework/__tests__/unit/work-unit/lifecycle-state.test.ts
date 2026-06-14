import { describe, it, expect } from "vitest";

import {
  locationFromPath,
  resolveLifecyclePosition,
} from "../../../src/lib/work-unit/lifecycle-state.js";

describe("locationFromPath", () => {
  it("resolves location from the containing lifecycle tier", () => {
    expect(locationFromPath(".arc/completed/2026-q2/15_foo/meta-foo.md")).toBe("completed");
    expect(locationFromPath(".arc/active/meta-foo.md")).toBe("active");
    expect(locationFromPath(".arc/backlog/provisional/foo/meta-foo.md")).toBe("provisional");
    expect(locationFromPath(".arc/backlog/planned/cohort/foo/meta-foo.md")).toBe("planned");
  });

  it("matches the tier segment in an absolute path too", () => {
    expect(locationFromPath("/repo/.arc/active/meta-foo.md")).toBe("active");
    expect(locationFromPath("/repo/.arc/backlog/planned/foo/meta-foo.md")).toBe("planned");
  });

  it("does not mistake a slug containing a tier word for the tier", () => {
    // `active-something` is a WU name, not the active/ tier.
    expect(locationFromPath(".arc/backlog/planned/active-something/meta-active-something.md")).toBe(
      "planned",
    );
  });

  it("returns null for a path under no known tier", () => {
    expect(locationFromPath(".arc/reference/meta-foo.md")).toBeNull();
    expect(locationFromPath("meta-foo.md")).toBeNull();
  });
});

describe("resolveLifecyclePosition", () => {
  it("reads the phase from the meta State field", () => {
    expect(resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Active" })).toEqual({
      phase: "Active",
      location: "active",
    });
    expect(
      resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Integrating" }),
    ).toEqual({ phase: "Integrating", location: "active" });
  });

  it("resolves a planned stub and a graduated WU to the same phase, distinct locations", () => {
    expect(
      resolveLifecyclePosition({ path: ".arc/backlog/planned/foo/meta-foo.md", state: "Planning" }),
    ).toEqual({ phase: "Planning", location: "planned" });
    expect(
      resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Planning" }),
    ).toEqual({ phase: "Planning", location: "active" });
  });

  it("lets the directory win the location when meta State would imply another tier", () => {
    // State `Shipped` would imply completed/, but the WU still sits in active/
    // (an archival lag). Location follows the directory; the faithful lag pair
    // is recorded, not coerced.
    expect(
      resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Shipped" }),
    ).toEqual({ phase: "Shipped", location: "active" });
  });

  it("returns null when the State value is not a codified phase", () => {
    expect(
      resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Paused (2026-04-12)" }),
    ).toBeNull();
    expect(resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: null })).toBeNull();
    expect(resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "" })).toBeNull();
  });

  it("returns null when the path is under no known lifecycle tier", () => {
    expect(resolveLifecyclePosition({ path: ".arc/reference/meta-foo.md", state: "Active" })).toBeNull();
  });

  it("resolves synchronously — no filesystem or git seam on the resolution path", () => {
    // A non-Promise return is the structural proof that resolution touches no
    // async I/O (the no-git-inference guard holding at the surface).
    const result = resolveLifecyclePosition({ path: ".arc/active/meta-foo.md", state: "Active" });
    expect(result).not.toBeInstanceOf(Promise);
  });
});
