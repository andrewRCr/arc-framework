/** Project path policy for normalized review surface authority. */

import type { ChangeSet } from "../../../../lib/change-facts.js";

const CHANGE_STATUSES = new Set(["added", "modified", "deleted", "renamed", "copied", "type-changed"]);

/** Closed authority classification consumed by review routing. */
export type SurfaceAuthority =
  | "planning-grooming"
  | "ordinary"
  | "design-authority"
  | "constitutional"
  | "unverifiable-derived"
  | "unknown";

/** Full-change-set authority result. */
export interface SurfaceAuthorityResolution {
  authority: SurfaceAuthority;
}

/** Project evidence seams used while classifying declared derived surfaces. */
export interface SurfaceAuthorityOptions {
  verifiesDerivedSurface?: (path: string) => boolean;
}

function safeRepositoryPath(path: string): boolean {
  return path.length > 0
    && !path.startsWith("/")
    && !path.includes("\0")
    && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

/** Whether a path is a formative work-unit or cohort artifact. */
export function isPlanningGroomingPath(path: string): boolean {
  return /^\.arc\/(?:active|backlog\/(?:planned|provisional))(?:\/[^/]+)*\/(?:draft|tasks|meta|notes)-[^/]+\.md$/u
    .test(path)
    || /^\.arc\/(?:active|backlog\/(?:planned|provisional))(?:\/[^/]+)*\/cohort-[^/]+\.md$/u.test(path);
}

/** Whether a path carries settled design authority. */
export function isDesignAuthorityPath(path: string): boolean {
  return /^\.arc\/(?:active|backlog\/(?:planned|provisional)|completed)(?:\/[^/]+)*\/(?:spec|prd)-[^/]+\.md$/u
    .test(path)
    || /^\.arc\/reference\/(?:strategies|adr)\/[^/]+(?:\/[^/]+)*\.md$/u.test(path)
    || /^packages\/arc-framework\/arc\/reference\/strategies\/[^/]+(?:\/[^/]+)*\.md$/u.test(path);
}

/** Whether a path controls project direction, development rules, or harness contracts. */
export function isConstitutionalPath(path: string): boolean {
  return path === "AGENTS.md"
    || path === "CLAUDE.md"
    || path === ".arc/reference/PROJECT-PRD.md"
    || /^\.arc\/system\/rules\/DEV-RULES\.[^/]+\.md$/u.test(path)
    || path === "packages/arc-framework/arc/reference/PROJECT-PRD.template.md"
    || /^packages\/arc-framework\/arc\/system\/rules\/DEV-RULES\.[^/]+(?:\.template)?\.md$/u.test(path);
}

/** Whether a path is a declared projection whose source relationship requires proof. */
export function isDeclaredDerivedSurfacePath(path: string): boolean {
  return path === ".arc/backlog/ROADMAP.md";
}

function authorityForPath(path: string, options: SurfaceAuthorityOptions): SurfaceAuthority {
  if (!safeRepositoryPath(path)) return "unknown";
  if (isDeclaredDerivedSurfacePath(path)) {
    return options.verifiesDerivedSurface?.(path) === true ? "ordinary" : "unverifiable-derived";
  }
  if (isPlanningGroomingPath(path)) return "planning-grooming";
  if (isDesignAuthorityPath(path)) return "design-authority";
  if (isConstitutionalPath(path)) return "constitutional";
  return "ordinary";
}

const AUTHORITY_RANK: Record<SurfaceAuthority, number> = {
  ordinary: 0,
  "planning-grooming": 1,
  "design-authority": 2,
  constitutional: 3,
  "unverifiable-derived": 4,
  unknown: 5,
};

/** Reduce every affected endpoint to the strongest project authority. */
export function resolveSurfaceAuthority(
  changeSet: ChangeSet,
  options: SurfaceAuthorityOptions = {},
): SurfaceAuthorityResolution {
  if (changeSet.changeSet === "unknown" || changeSet.changes.length === 0) return { authority: "unknown" };
  let authority: SurfaceAuthority = "ordinary";
  try {
    for (const change of changeSet.changes) {
      if (!CHANGE_STATUSES.has(change.status)) return { authority: "unknown" };
      const moved = change.status === "renamed" || change.status === "copied";
      if (moved !== (change.previousPath !== undefined)) return { authority: "unknown" };
      const endpoints = change.previousPath === undefined
        ? [change.path]
        : [change.previousPath, change.path];
      for (const endpoint of endpoints) {
        const candidate = authorityForPath(endpoint, options);
        if (candidate === "unknown") return { authority: "unknown" };
        if (AUTHORITY_RANK[candidate] > AUTHORITY_RANK[authority]) authority = candidate;
      }
    }
  } catch {
    return { authority: "unknown" };
  }
  return { authority };
}
