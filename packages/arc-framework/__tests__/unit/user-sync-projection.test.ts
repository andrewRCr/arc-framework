/**
 * Unit tests for the canonical tombstone-free projection — `projectManifest`
 * strips `## Removed:` sections from cross-WU files while passing per-WU subdir
 * files through unchanged, so coherence comparisons read through one basis.
 */

import { describe, it, expect } from "vitest";

import type { SyncManifest } from "../../src/lib/git/user-sync.js";
import { projectManifest } from "../../src/lib/user-sync/index.js";

const manifest = (files: Record<string, string>): SyncManifest => ({ version: 2, files });

describe("projectManifest", () => {
  it("strips tombstone sections from a cross-WU file", () => {
    const content = `# Working Memory\n\n## Memories\n\n**Kept:**\n_Remove when: x._\n\nBody.\n\n---\n\n## Removed: **Dropped:**\n\n- _Section:_ Memories\n- _Removed:_ 2026-05-25T12:00:00.000Z\n`;

    const projected = projectManifest(manifest({ "WORKING-MEMORY.md": content }));
    const out = projected.files["WORKING-MEMORY.md"];

    expect(out).not.toContain("## Removed:");
    expect(out).toContain("**Kept:**");
  });

  it("round-trips tombstone-free content byte-identically", () => {
    const content = `# Working Memory\n\n## Memories\n\n**Kept:**\n_Remove when: x._\n\nBody.\n\n---\n`;

    const projected = projectManifest(manifest({ "WORKING-MEMORY.md": content }));

    expect(projected.files["WORKING-MEMORY.md"]).toBe(content);
  });

  it("passes per-WU subdir files through unchanged", () => {
    const content = `# Session Notes\n\n## Removed: not a real tombstone\n\nsome body\n`;

    const projected = projectManifest(manifest({ "notes-merge-coherence/SESSION-NOTES.md": content }));

    expect(projected.files["notes-merge-coherence/SESSION-NOTES.md"]).toBe(content);
  });

  it("passes per-WU subdir files through unchanged even when their basename has a merge shape", () => {
    const content = `# Working Memory\n\n## Removed: not a cross-WU tombstone\n\nsome body\n`;

    const projected = projectManifest(manifest({ "notes-merge-coherence/WORKING-MEMORY.md": content }));

    expect(projected.files["notes-merge-coherence/WORKING-MEMORY.md"]).toBe(content);
  });

  it("preserves the manifest version", () => {
    const projected = projectManifest({ version: 1, files: {} });

    expect(projected.version).toBe(1);
  });
});
