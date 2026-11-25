/** Test-only checks that reference storage never enters production bundles. */

import { isAbsolute, relative, resolve, sep } from "node:path";

function isWithin(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

/** Esbuild metadata required by the no-reference-output check, without filtering production inputs. */
export interface ReferenceMetafile {
  inputs: Record<string, unknown>;
  outputs: Record<string, { inputs?: Record<string, unknown> }>;
}

/** Find reference support in raw metafile inputs and every output's input attribution.
 * @param metafile - Raw bundle metadata, including test and non-source inputs.
 * @param packageRoot - Directory relative input keys resolve against.
 * @param referenceRoot - Forbidden test-only directory.
 * @returns Sorted offending raw keys from either metadata location.
 */
export function referenceBundleInputs(metafile: ReferenceMetafile, packageRoot: string, referenceRoot: string): string[] {
  const keys = [...Object.keys(metafile.inputs), ...Object.values(metafile.outputs).flatMap((output) => Object.keys(output.inputs ?? {}))];
  return [...new Set(keys.filter((key) => isWithin(referenceRoot, resolve(packageRoot, key))))].sort();
}
