/** Pure projection from semantic ARC layout addresses to managed paths. */

import { assertNever, validateManagedPath, type ManagedPath, type Slug } from "../kernel/index.js";
import { companionStoredName } from "./companion-key.js";
import { LayoutError } from "./errors.js";
import {
  ArcLayoutAddressSchema,
  type ArcLayoutAddress,
  type WorkUnitPlacement,
  type OwnActiveLocation,
} from "./schema.js";

const EDITOR_DOCUMENT_ROOT = ".arc/system/.internal/schemas";

function projectPlacementRoot(tier: "active" | "planned" | "provisional" | "completed"): string {
  switch (tier) {
    case "active": return ".arc/active";
    case "planned": return ".arc/backlog/planned";
    case "provisional": return ".arc/backlog/provisional";
    case "completed": return ".arc/completed";
    default: return assertNever(tier);
  }
}

function projectContainer(placement: WorkUnitPlacement, slug: Slug): string {
  switch (placement.kind) {
    case "active":
      return projectActive(placement.scope, slug);
    case "backlog": {
      const cohort = placement.cohort.length === 0 ? "" : `/${placement.cohort.join("/")}`;
      return `.arc/backlog/${placement.commitment}${cohort}/${slug}`;
    }
    case "completed":
      return `.arc/completed/${placement.quarter}/${placement.sequence}_${slug}`;
    default:
      return assertNever(placement);
  }
}

function projectActive(scope: Extract<WorkUnitPlacement, { kind: "active" }>["scope"], slug: Slug): string {
  if (scope.kind === "contributor") return `.arc/user/${scope.identity}/active`;
  const location = scope.location;
  if (location === undefined) return ".arc/active";
  return location.kind === "another" ? `.arc/active/in-flight/${slug}` : projectOwnActive(location);
}

function projectOwnActive(location: OwnActiveLocation): string {
  return location.layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
}

function projectAddress(address: ArcLayoutAddress): string {
  switch (address.kind) {
    case "candidate-record":
    case "integration-boundary-record":
    case "transition-record":
      return projectInternalRecord(address);
    case "editor-document-root":
      return EDITOR_DOCUMENT_ROOT;
    case "editor-document":
      return `${EDITOR_DOCUMENT_ROOT}/${address.schema}.schema.json`;
    case "inbox":
      return projectInbox(address);
    case "arc-root":
      return ".arc";
    case "work-unit-export":
      return `.arc/specs/${address.slug}`;
    case "placement-root":
      return projectPlacementRoot(address.tier);
    case "work-unit-container":
      return projectContainer(address.placement, address.slug);
    case "work-unit-artifact":
      return `${projectContainer(address.placement, address.slug)}/${address.artifact}-${address.slug}.md`;
    case "work-unit-companion": {
      const file = companionStoredName(address.slug, address.key);
      return `${projectContainer(address.placement, address.slug)}/${file}`;
    }
    case "work-unit-spec-part":
      return `${projectContainer(address.placement, address.slug)}/spec-${address.slug}-${address.part}.md`;
    case "work-unit-inbound":
      return `${projectContainer(address.placement, address.slug)}/inbound-${address.slug}.md`;
    case "errand-description": {
      const directory = address.placement.kind === "completed" ? `.arc/completed/${address.placement.quarter}`
        : projectActive(address.placement.scope, address.slug);
      return `${directory}/errand-${address.slug}.md`;
    }
    case "cohort-document":
      return projectCohort(address);
    case "cohort-copy":
      return `${projectOwnActive(address.location)}/cohort-${address.cohort}.md`;
    case "procedure-root":
      return `.arc/system/${address.family}`;
    case "project-document":
      return ".arc/backlog/ROADMAP.md";
    case "user-root":
      return `.arc/user/${address.identity}`;
    case "scratch-document":
      return `.arc/user/${address.identity}/${address.key}`;
    case "user-document":
      return projectUserDocument(address);
    default:
      return assertNever(address);
  }
}

/**
 * Project a complete semantic ARC address to its canonical repository-relative path.
 *
 * @param address - Complete semantic address to validate and project
 * @returns Canonical repository-relative POSIX managed path
 * @throws {@link LayoutError} when the address or projected path is invalid
 */
export function resolveArcPath(address: ArcLayoutAddress): ManagedPath {
  const parsed = ArcLayoutAddressSchema.safeParse(address);
  if (!parsed.success) {
    throw new LayoutError("Invalid ARC layout address", "layout.invalid-address", { cause: parsed.error });
  }
  try {
    return validateManagedPath(projectAddress(parsed.data));
  } catch (error) {
    if (error instanceof LayoutError) throw error;
    throw new LayoutError("Invalid managed path projected from ARC layout address", "layout.invalid-managed-path", {
      cause: error,
    });
  }
}

function projectInternalRecord(address: Extract<ArcLayoutAddress, { kind: "candidate-record" | "integration-boundary-record" | "transition-record" }>): string {
  switch (address.kind) {
    case "candidate-record":
      return `.arc/system/.internal/candidates/${address.slug}.json`;
    case "integration-boundary-record":
      return `.arc/system/.internal/candidates/${address.slug}.boundary.json`;
    case "transition-record":
      return `.arc/system/.internal/transitions/${address.origin}.json`;
    default:
      return assertNever(address);
  }
}

function projectCohort(address: Extract<ArcLayoutAddress, { kind: "cohort-document" }>): string {
  const leaf = address.cohort[address.cohort.length - 1];
  if (leaf === undefined) {
    throw new LayoutError(`Unsupported layout address: ${JSON.stringify(address)}`, "layout.invalid-address");
  }
  if (address.placement.kind === "planned") {
    return `.arc/backlog/planned/${address.cohort.join("/")}/cohort-${leaf}.md`;
  }
  const suffix = address.placement.closeout === "leaf" ? "a" : "b";
  const directory = `${address.placement.sequence}${suffix}_cohort-${leaf}`;
  return `.arc/completed/${address.placement.quarter}/${directory}/cohort-${leaf}.md`;
}

function projectInbox(address: Extract<ArcLayoutAddress, { kind: "inbox" }>): string {
  return address.scope.kind === "project" ? ".arc/backlog/ATOMIC-INBOX.md" : `.arc/user/${address.scope.identity}/USER-INBOX.md`;
}

function projectUserDocument(address: Extract<ArcLayoutAddress, { kind: "user-document" }>): string {
  return address.document.kind === "working-memory"
    ? `.arc/user/${address.identity}/WORKING-MEMORY.md`
    : `.arc/user/${address.identity}/${address.document.workUnit}/SESSION-NOTES.md`;
}
