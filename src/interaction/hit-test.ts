import type { Vec2, Joint, Link, Outline, Body } from '../types';
import { distance } from '../core/math/vec2';
import { distToSegment } from '../core/math/vec2';
import { HIT_RADIUS, LINK_HIT_THRESHOLD } from '../utils/constants';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

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

export function hitTestOutline(
  worldPos: Vec2,
  outlines: Record<string, Outline>,
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  zoom: number,
): Outline | null {
  const threshold = LINK_HIT_THRESHOLD / zoom;
  let closest: Outline | null = null;
  let closestDist = Infinity;

  for (const outline of Object.values(outlines)) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length < 2) continue;
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));

    for (let i = 0; i < worldPts.length; i++) {
      const a = worldPts[i];
      const b = worldPts[(i + 1) % worldPts.length];
      const d = distToSegment(worldPos, a, b);
      if (d < threshold && d < closestDist) {
        closestDist = d;
        closest = outline;
      }
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
