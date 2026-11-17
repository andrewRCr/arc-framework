/** Physical path containment for the window's copy and executable checks. */
import { localPathContains } from "../../lib/local-path-identity.js";

/** Whether a candidate is the root or beneath it by physical spelling; a child named `..copy` is beneath its parent. */
export async function windowPathContains(root: string, candidate: string): Promise<boolean> {
  return localPathContains(root, candidate);
}
