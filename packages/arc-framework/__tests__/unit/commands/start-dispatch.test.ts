/**
 * Unit tests for `resolveStartDispatch` — the pure routing core of `arc start`.
 *
 * `start` is the polymorphic entry verb: it resolves the named work unit's
 * lifecycle state and routes to the matching arm — explicitly create-new from a
 * nonexistent name, graduate from a backlog tier, resume from a parked shelf,
 * and a directed refusal from the already-live / terminal states. The routing is a pure function
 * of the lifecycle index, exercised here over hand-built in-memory entries (one
 * per resolved state) so each branch is asserted without touching the filesystem.
 */

import { describe, it, expect } from "vitest";

import type {
  LifecycleIndex,
  LifecycleIndexEntry,
} from "../../../src/lib/work-unit/lifecycle-index.js";
import type { LifecyclePosition } from "../../../src/lib/work-unit/lifecycle-state.js";
import { resolveStartDispatch } from "../../../src/commands/start.js";

/** Build a single-entry index whose one WU sits at the given `(phase, location)`. */
function indexAt(slug: string, position: LifecyclePosition): LifecycleIndex {
  const entry: LifecycleIndexEntry = {
    slug,
    phase: position.phase,
    location: position.location,
    cohort: null,
    dependsOn: [],
    path: `.arc/${position.location === "active" ? "active" : `backlog/${position.location}/${slug}`}/meta-${slug}.md`,
  };
  return new Map([[slug, entry]]);
}

describe("resolveStartDispatch — routing on resolved state", () => {
  it("refuses a nonexistent name without explicit creation intent", () => {
    const result = resolveStartDispatch(new Map(), "widget");
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/--new/iu);
  });

  it("routes a nonexistent name to create-new with explicit creation intent", () => {
    expect(resolveStartDispatch(new Map(), "widget", { create: true })).toEqual({ arm: "create-new" });
  });

  it("refuses explicit creation when the slug already exists", () => {
    const index = indexAt("widget", { phase: "Planning", location: "planned" });
    const result = resolveStartDispatch(index, "widget", { create: true });
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/already exists|omit.*--new/iu);
  });

  it("routes a provisional stub to graduate", () => {
    const index = indexAt("widget", { phase: "Planning", location: "provisional" });
    expect(resolveStartDispatch(index, "widget")).toEqual({ arm: "graduate" });
  });

  it("routes a planned stub to graduate (name-collision → graduate, never mis-scaffold)", () => {
    const index = indexAt("widget", { phase: "Planning", location: "planned" });
    expect(resolveStartDispatch(index, "widget")).toEqual({ arm: "graduate" });
  });

  it("routes a parked WU to resume", () => {
    const index = indexAt("widget", { phase: "Active", location: "planned" });
    expect(resolveStartDispatch(index, "widget")).toEqual({ arm: "resume" });
  });

  it("refuses a graduated planning WU — already started", () => {
    const index = indexAt("widget", { phase: "Planning", location: "active" });
    const result = resolveStartDispatch(index, "widget");
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/already started/i);
  });

  it("refuses an active WU — occupied", () => {
    const index = indexAt("widget", { phase: "Active", location: "active" });
    const result = resolveStartDispatch(index, "widget");
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/occupied|already active/i);
  });

  it("refuses an integrating WU — points to reopen", () => {
    const index = indexAt("widget", { phase: "Integrating", location: "active" });
    const result = resolveStartDispatch(index, "widget");
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/reopen/i);
  });

  it("refuses a shipped WU — points to a fresh origin-linked WU", () => {
    const index = indexAt("widget", { phase: "Shipped", location: "completed" });
    const result = resolveStartDispatch(index, "widget");
    expect(result.arm).toBe("refuse");
    if (result.arm !== "refuse") return;
    expect(result.reason).toMatch(/origin-link|new work|fresh/i);
  });
});
