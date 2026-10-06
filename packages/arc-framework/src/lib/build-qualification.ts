/** Compiler-free qualification of recorded runtime inputs and required live output. */
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DEV_BUILD_STAMP_NAME, hasKernelSchemas, identifyBuildInputs, parseBuildEvidence, sharedBuildIdentity, type BuildEvidence,
} from "./build-evidence.js";
import { captureBuildContext } from "./build-context.js";
import { captureBuildInventory } from "./build-inventory.js";

/** Required live artifact contract, independent of the outer npm lifecycle. */
export type BuildRequirement = "runtime" | "runtimeSchema" | "full";

/** Reuse is established only by matching current inputs and complete required files. */
export type BuildQualification =
  | { readonly status: "qualified"; readonly evidence: BuildEvidence }
  | { readonly status: "unqualified"; readonly reason: string };

/**
 * Check selected recorded inputs without loading configuration or resolving a compiler program.
 * @param packageRoot - Consuming checkout package boundary
 * @param requirement - Required artifact contract
 * @returns Current qualified evidence or an actionable reason to regenerate
 */
export function readBuildQualification(packageRoot: string, requirement: BuildRequirement): BuildQualification {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(packageRoot, "dist", DEV_BUILD_STAMP_NAME), "utf8"));
    const evidence = parseBuildEvidence(raw);
    if (evidence === null) throw new Error("Build evidence is old or malformed; regenerate it.");
    const context = captureBuildContext(packageRoot);
    const inventory = captureBuildInventory(packageRoot, evidence.inventoryRoots, false);
    const root = resolve(packageRoot, "../..");
    const contents: Record<string, string> = { ...inventory.contents, ...context.contents };
    for (const key of new Set([
      ...evidence.graphs.cli, ...evidence.graphs.schema, ...evidence.graphs.controls, ...evidence.configurationInputs,
    ])) {
      contents[key] = createHash("sha256").update(readFileSync(join(root, key))).digest("hex");
    }
    const identities = identifyBuildInputs({ ...evidence.graphs,
      controls: [...evidence.graphs.controls, ...evidence.configurationInputs],
    }, contents, sharedBuildIdentity(context.identity, inventory.identity));
    const identity = requirement === "runtime" ? "runtime" : "runtimeSchema";
    if (identities[identity] !== evidence.identities[identity]) throw new Error("Build input identity does not match.");
    requireLiveArtifacts(packageRoot, requirement, evidence);
    return { status: "qualified", evidence };
  } catch (error) {
    return { status: "unqualified", reason: error instanceof Error ? error.message : String(error) };
  }
}

function requireLiveArtifacts(packageRoot: string, requirement: BuildRequirement, evidence: BuildEvidence): void {
  const files = ["cli.js", ...(requirement === "runtime" ? [] : ["schemas/kernel.json", "metafile-esm.json"]),
    ...(requirement === "full" ? ["cli.d.ts"] : [])];
  if (requirement === "full" && !evidence.qualification.declarations) {
    throw new Error("Build evidence does not establish declaration generation.");
  }
  for (const file of files) {
    const status = lstatSync(join(packageRoot, "dist", file));
    if (!status.isFile() || status.size === 0) throw new Error(`Required live artifact ${file} is unusable.`);
  }
  if (requirement !== "runtime") {
    const schema: unknown = JSON.parse(readFileSync(join(packageRoot, "dist/schemas/kernel.json"), "utf8"));
    if (!hasKernelSchemas(schema)) throw new Error("Live kernel schema is unusable.");
  }
}
