import type { Vec2, Joint, Link, Outline, Body } from '../types';
import { distance } from '../core/math/vec2';
import { distToSegment } from '../core/math/vec2';
import { HIT_RADIUS, LINK_HIT_THRESHOLD } from '../utils/constants';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

/**
 * Lightweight boolean hit-test — checks if worldPos is near any joint or link.
 * Does NOT mutate click-cycling state (lastHitJointId). Use this for
 * touch gesture classification (interact vs pan) where we just need a yes/no.
 */
export function hitTestAny(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  zoom: number,
): boolean {
  const jointThreshold = HIT_RADIUS / zoom;
  for (const joint of Object.values(joints)) {
    if (distance(worldPos, joint.position) < jointThreshold) return true;
  }
  const linkThreshold = LINK_HIT_THRESHOLD / zoom;
  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;
    if (distToSegment(worldPos, jA.position, jB.position) < linkThreshold) return true;
  }
  return false;
}

// Track last hit joint for click-cycling through overlapping joints
let lastHitJointId: string | null = null;

export function hitTestJoint(
  worldPos: Vec2,
  joints: Record<string, Joint>,
  zoom: number,
): Joint | null {
  const threshold = HIT_RADIUS / zoom;

  // Collect all joints within hit radius
  const hits: { joint: Joint; dist: number }[] = [];
  for (const joint of Object.values(joints)) {
    const d = distance(worldPos, joint.position);
    if (d < threshold) {
      hits.push({ joint, dist: d });
    }
  }

  if (hits.length === 0) {
    lastHitJointId = null;
    return null;
  }

  // Sort by distance (closest first), then by id for stable order
  hits.sort((a, b) => a.dist - b.dist || a.joint.id.localeCompare(b.joint.id));

  // If only one hit or last hit not in the set, return closest
  if (hits.length === 1 || !lastHitJointId) {
    lastHitJointId = hits[0].joint.id;
    return hits[0].joint;
  }

  // Find the last hit joint in the current hits and cycle to the next one
  const lastIdx = hits.findIndex((h) => h.joint.id === lastHitJointId);
  if (lastIdx === -1) {
    lastHitJointId = hits[0].joint.id;
    return hits[0].joint;
  }

  const nextIdx = (lastIdx + 1) % hits.length;
  lastHitJointId = hits[nextIdx].joint.id;
  return hits[nextIdx].joint;
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
    if (!body || outline.points.length < 2 || !outline.visible) continue;
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

/** Point-in-polygon test using ray casting. */
function pointInPolygon(pt: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].y, yj = polygon[j].y;
    const xi = polygon[i].x, xj = polygon[j].x;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Hit-test outlines as filled shapes (not just edges) for simulate mode dragging.
 * Returns only outlines where the click point is NOT inside any other body's outline
 * (i.e., non-overlapping regions). Excludes base body outlines.
 */
export function hitTestOutlineFilled(
  worldPos: Vec2,
  outlines: Record<string, Outline>,
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  baseBodyId: string,
): Outline | null {
  // Compute world-space polygons for all outlines
  const outlinePolygons: { outline: Outline; worldPts: Vec2[] }[] = [];
  for (const outline of Object.values(outlines)) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length < 3 || !outline.visible) continue;
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));
    outlinePolygons.push({ outline, worldPts });
  }

  // Find all outlines containing the point
  const hits: { outline: Outline; bodyId: string }[] = [];
  for (const { outline, worldPts } of outlinePolygons) {
    if (pointInPolygon(worldPos, worldPts)) {
      hits.push({ outline, bodyId: outline.bodyId });
    }
  }

  if (hits.length === 0) return null;

  // Filter out base body outlines
  const nonBase = hits.filter((h) => h.bodyId !== baseBodyId);
  if (nonBase.length === 0) return null;

  // If multiple bodies' outlines overlap at this point, skip (return null)
  const uniqueBodyIds = new Set(nonBase.map((h) => h.bodyId));
  if (uniqueBodyIds.size > 1) return null;

  // Return the first non-base outline (they're all from the same body)
  return nonBase[0].outline;
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
