/** Physical path containment for the window's copy and executable checks. */
import { isAbsolute, relative, sep } from "node:path";
import { canonicalLocalPath } from "../../lib/local-path-identity.js";

/** Whether a candidate is the root or beneath it by physical spelling; a child named `..copy` is beneath its parent. */
export async function windowPathContains(root: string, candidate: string): Promise<boolean> {
  const [rootIdentity, candidateIdentity] = await Promise.all([canonicalLocalPath(root), canonicalLocalPath(candidate)]);
  const rel = relative(rootIdentity, candidateIdentity);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
