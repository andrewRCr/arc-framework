/** Memory envelope for each native compiler, in MiB unless a name states otherwise. */
export const SOFT_LIMIT_MIB = 6000;
export const BACKSTOP_MARGIN_MIB = 1817;

/** Inherited address-space ceilings from Linux procfs, in bytes. */
export interface AddressSpaceLimits { soft?: number; hard?: number }

/** Read both address-space columns, treating unlimited as absence of a ceiling. */
export function parseAddressSpaceLimits(text: string): AddressSpaceLimits {
  const match = /^Max address space\s+(\d+|unlimited)\s+(\d+|unlimited)/m.exec(text);
  if (!match) throw new Error("Cannot read inherited Max address space from /proc/self/limits.");
  return {
    ...(match[1] === "unlimited" ? {} : { soft: Number(match[1]) }),
    ...(match[2] === "unlimited" ? {} : { hard: Number(match[2]) }),
  };
}

/** Return the shell backstop in KiB, or preserve a lower inherited ceiling. */
export function addressSpaceBackstop(softLimitMiB: number, limits: AddressSpaceLimits): number | undefined {
  const backstopKiB = (softLimitMiB + BACKSTOP_MARGIN_MIB) * 1024;
  const belowBackstop = (value: number | undefined): boolean => value !== undefined && value < backstopKiB * 1024;
  return belowBackstop(limits.soft) || belowBackstop(limits.hard) ? undefined : backstopKiB;
}
