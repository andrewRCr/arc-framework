/** First-party dependency selection from native compiler and loader metadata. */
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Normalize native dependency paths while excluding installed and external inputs.
 * @param inputs - Paths emitted by the actual producer, relative to its working directory
 * @param packageRoot - Producer working directory
 * @returns Sorted, unique absolute first-party source paths
 */
export function selectFirstPartyInputs(inputs: readonly string[], packageRoot: string): string[] {
  const repositoryRoot = resolve(packageRoot, "../..");
  return [...new Set(inputs.map((input) => resolve(packageRoot, input)).filter((file) => {
    const key = relative(repositoryRoot, file).split(sep).join("/");
    return key !== ".." && !key.startsWith("../") && !isAbsolute(key)
      && !key.split("/").includes("node_modules")
      && /\.(?:[cm]?[jt]sx?|json)$/u.test(key);
  }))].sort();
}

/**
 * Turn actual native producer paths into checkout-independent evidence keys.
 * @param inputs - Actual native compiler or loader dependencies
 * @param packageRoot - Native consuming package boundary
 * @returns Sorted repository-relative first-party keys
 */
export function repositoryInputKeys(inputs: readonly string[], packageRoot: string): string[] {
  const root = resolve(packageRoot, "../..");
  return selectFirstPartyInputs(inputs, packageRoot).map((file) => relative(root, file).split(sep).join("/"));
}
