import type { Joint, Link } from '../../types';

/**
 * DOF = 2 * (free joints) - (link distance constraints) - (driver if any)
 */
export function computeDOF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  hasDriver: boolean,
): number {
  let unknowns = 0;
  for (const joint of Object.values(joints)) {
    if (joint.type === 'fixed') continue;
    unknowns += 2;
  }

  let constraints = Object.keys(links).length;
  if (hasDriver) constraints += 1;

  return unknowns - constraints;
}
