import type { Vec2, Joint, Link } from '../types';
import { distance } from '../core/math/vec2';
import { distToSegment } from '../core/math/vec2';
import { HIT_RADIUS, LINK_HIT_THRESHOLD } from '../utils/constants';

export function hitTestJoint(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  zoom: number,
): Joint | null {
  const threshold = HIT_RADIUS / zoom;
  let closest: Joint | null = null;
  let closestDist = Infinity;

  for (const joint of Object.values(joints)) {
    const d = distance(worldPos, joint.position);
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = joint;
    }
  }
  return closest;
}

export function hitTestLink(
  worldPos: Vec2,
  links: Record<string, Link>,
  joints: Record<string, Joint>,
  zoom: number,
): Link | null {
  const threshold = LINK_HIT_THRESHOLD / zoom;
  let closest: Link | null = null;
  let closestDist = Infinity;

  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;
    const d = distToSegment(worldPos, jA.position, jB.position);
    if (d < threshold && d < closestDist) {
      closestDist = d;
      closest = link;
    }
  }
  return closest;
}

export function hitTest(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  zoom: number,
): { type: 'joint'; item: Joint } | { type: 'link'; item: Link } | null {
  // Joints have priority over links
  const joint = hitTestJoint(worldPos, joints, zoom);
  if (joint) return { type: 'joint', item: joint };
  const link = hitTestLink(worldPos, links, joints, zoom);
  if (link) return { type: 'link', item: link };
  return null;
}
