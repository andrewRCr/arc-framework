/**
 * Unit tests for the shared lifecycle-verb binding shape ({@link resolveVerbTargetOrReport}).
 * The pure dispatch core (target selection, candidate derivation) is tested in
 * `dispatch.test.ts`; these cover the handler glue the core can't: the
 * current-WU fallback read, mode-gated default resolution, and the non-interactive
 * candidate-list-and-exit surface.
 *
 * `@clack/prompts`, the active-meta reader, and the lifecycle index are mocked at
 * the module seam; the real dispatch core runs against the mocked index.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { Location, Phase } from "../../../src/lib/work-unit/lifecycle-state.js";

const mockLogError = vi.fn();
vi.mock("@clack/prompts", () => ({ log: { error: (...args: unknown[]) => mockLogError(...args) } }));

const mockReadActiveMetaCandidates = vi.fn();
vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  readActiveMetaCandidates: (...args: unknown[]) => mockReadActiveMetaCandidates(...args),
}));

const mockBuildLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: (...args: unknown[]) => mockBuildLifecycleIndex(...args),
}));

const { resolveVerbTargetOrReport } = await import("../../../src/handlers/lifecycle.js");

function entry(slug: string, phase: Phase, location: Location): LifecycleIndexEntry {
  return { slug, phase, location, cohort: null, dependsOn: [], path: `.arc/${location}/meta-${slug}.md` };
}

function indexWith(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((e) => [e.slug, e]));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

describe("resolveVerbTargetOrReport — explicit slug", () => {
  it("resolves directly without reading the current WU or the index", async () => {
    const slug = await resolveVerbTargetOrReport("park", "widget", "/repo");
    expect(slug).toBe("widget");
    expect(mockReadActiveMetaCandidates).not.toHaveBeenCalled();
    expect(mockBuildLifecycleIndex).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});

describe("resolveVerbTargetOrReport — context-defaulting, no slug", () => {
  it("falls back to the single current worktree's WU", async () => {
    mockReadActiveMetaCandidates.mockResolvedValue({ candidates: [{ filename: "meta-current-wu.md" }] });
    const slug = await resolveVerbTargetOrReport("park", undefined, "/repo");
    expect(slug).toBe("current-wu");
    expect(mockBuildLifecycleIndex).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("surfaces the candidate list and exits when no unambiguous current WU resolves", async () => {
    mockReadActiveMetaCandidates.mockResolvedValue({ candidates: [] });
    mockBuildLifecycleIndex.mockResolvedValue(
      indexWith(entry("live", "Active", "active"), entry("shelved", "Active", "planned")),
    );
    const slug = await resolveVerbTargetOrReport("park", undefined, "/repo");
    expect(slug).toBeNull();
    expect(process.exitCode).toBe(1);
    expect(mockLogError).toHaveBeenCalledWith("Active: `live` · usage `arc park <slug>`");
  });
});

describe("resolveVerbTargetOrReport — slug-required, no slug", () => {
  it("never reads the current WU and lists the valid candidates non-interactively", async () => {
    mockBuildLifecycleIndex.mockResolvedValue(indexWith(entry("shelved", "Active", "planned")));
    const slug = await resolveVerbTargetOrReport("resume", undefined, "/repo");
    expect(slug).toBeNull();
    expect(mockReadActiveMetaCandidates).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(mockLogError).toHaveBeenCalledWith("Parked: `shelved` · usage `arc resume <slug>`");
  });
});
