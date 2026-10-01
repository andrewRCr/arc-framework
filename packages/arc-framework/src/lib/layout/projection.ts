/** Pure projection from semantic ARC layout addresses to managed paths. */

import { assertNever, validateManagedPath, type ManagedPath, type Slug } from "../kernel/index.js";
import { LayoutError } from "./errors.js";
import {
  ArcLayoutAddressSchema,
  type ArcLayoutAddress,
  type WorkUnitPlacement,
} from "./schema.js";

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
      return placement.scope.kind === "project"
        ? ".arc/active"
        : `.arc/user/${placement.scope.identity}/active`;
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

function projectAddress(address: ArcLayoutAddress): string {
  switch (address.kind) {
    case "arc-root":
      return ".arc";
    case "placement-root":
      return projectPlacementRoot(address.tier);
    case "work-unit-container":
      return projectContainer(address.placement, address.slug);
    case "work-unit-artifact":
      return `${projectContainer(address.placement, address.slug)}/${address.artifact}-${address.slug}.md`;
    case "cohort-document": {
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
    case "procedure-root":
      return `.arc/system/${address.family}`;
    case "project-document":
      return ".arc/backlog/ROADMAP.md";
    case "user-document":
      return address.document.kind === "working-memory"
        ? `.arc/user/${address.identity}/WORKING-MEMORY.md`
        : `.arc/user/${address.identity}/${address.document.workUnit}/SESSION-NOTES.md`;
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
