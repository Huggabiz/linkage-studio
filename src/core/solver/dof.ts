import type { Joint, Link } from '../../types';

/**
 * DOF = 2 * (free joints) - (link distance constraints) - (driver if any)
 */
export function computeDOF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  hasDriver: boolean,
  fixedJointIds?: Set<string>,
): number {
  let unknowns = 0;
  for (const joint of Object.values(joints)) {
    if (joint.hidden) continue; // exclude bracing joints from user-facing DOF
    const isFixed = fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed';
    if (isFixed) continue;
    unknowns += 2;
  }

  // Exclude links involving hidden bracing joints from DOF count
  let constraints = 0;
  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (jA?.hidden || jB?.hidden) continue;
    constraints++;
  }
  if (hasDriver) constraints += 1;

  return unknowns - constraints;
}
