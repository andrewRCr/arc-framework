/** Primary-backed locus-root resolution coverage. */

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLocusRoot } from "../../../src/lib/locus/root.js";

describe("locus root resolution", () => {
  it("resolves records and locks beneath the primary user root", async () => {
    const result = await resolveLocusRoot({
      identity: "andrew",
      scan: async () => ({
        ok: true,
        worktrees: [{ path: "/primary", head: "abc", branch: "main", detached: false, primary: true }],
      }),
    });
    expect(result).toEqual({
      ok: true,
      primaryPath: "/primary",
      userRoot: join("/primary", ".arc", "user", "andrew"),
      lociRoot: join("/primary", ".arc", "user", "andrew", ".internal", "loci"),
      locksRoot: join("/primary", ".arc", "user", "andrew", ".internal", "loci", ".locks"),
    });
  });

  it("fails closed for zero or multiple primary stanzas and topology failure", async () => {
    const fixtures = [
      { ok: true as const, worktrees: [] },
      { ok: true as const, worktrees: [
        { path: "/a", head: "a", branch: "main", detached: false, primary: true },
        { path: "/b", head: "b", branch: "other", detached: false, primary: true },
      ] },
      { ok: false as const, message: "git failed" },
    ];
    for (const fixture of fixtures) {
      await expect(resolveLocusRoot({ identity: "andrew", scan: async () => fixture }))
        .resolves.toMatchObject({ ok: false });
    }
  });
});
