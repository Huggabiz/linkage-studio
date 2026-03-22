import type { Body } from '../types';

export function isJointFixed(
  jointId: string,
  bodies: Record<string, Body>,
  baseBodyId: string,
): boolean {
  const base = bodies[baseBodyId];
  return base ? base.jointIds.includes(jointId) : false;
}

export function getJointBodies(
  jointId: string,
  bodies: Record<string, Body>,
): Body[] {
  return Object.values(bodies).filter((b) => b.jointIds.includes(jointId));
}
