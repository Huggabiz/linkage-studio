import type { Joint, Link, Body, Outline, SliderConstraint, Vec2 } from '../types';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
import {
  JOINT_RADIUS, JOINT_RADIUS_FIXED, LINK_WIDTH,
  REVOLUTE_COLOR, FIXED_COLOR, LINK_COLOR,
  SELECTION_COLOR, HOVER_COLOR,
} from '../utils/constants';

/** Darken a hex color by a factor (0 = black, 1 = original) */
function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export function drawLink(
  ctx: CanvasRenderingContext2D,
  link: Link,
  joints: Record<string, Joint>,
  zoom: number,
  color: string,
) {
  const jA = joints[link.jointIds[0]];
  const jB = joints[link.jointIds[1]];
  if (!jA || !jB) return;

  ctx.beginPath();
  ctx.moveTo(jA.position.x, jA.position.y);
  ctx.lineTo(jB.position.x, jB.position.y);
  // Temp links are nearly invisible (black at 5% opacity)
  ctx.strokeStyle = link.id.startsWith('__templink_') ? 'rgba(0, 0, 0, 0.05)' : color;
  ctx.lineWidth = 4 / zoom;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function drawJoint(
  ctx: CanvasRenderingContext2D,
  joint: Joint,
  selected: boolean,
  hovered: boolean,
  zoom: number,
  memberBodies: Body[],
) {
  const { x, y } = joint.position;
  const baseRadius = joint.type === 'fixed' ? JOINT_RADIUS_FIXED : JOINT_RADIUS;
  const r = baseRadius / zoom;
  const ringWidth = 3 / zoom;

  // Draw concentric body-color rings (outermost first)
  for (let i = memberBodies.length - 1; i >= 0; i--) {
    const ringR = r + (i + 1) * ringWidth + 1 / zoom;
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = memberBodies[i].color;
    ctx.lineWidth = ringWidth;
    ctx.stroke();
  }

  // Selection / hover ring (outside body rings)
  if (selected || hovered) {
    const outerR = r + (memberBodies.length + 1) * ringWidth + 2 / zoom;
    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = selected ? SELECTION_COLOR : HOVER_COLOR;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  // Joint body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = joint.type === 'fixed' ? FIXED_COLOR : REVOLUTE_COLOR;
  ctx.fill();

  // Inner marker
  if (joint.type === 'revolute') {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (joint.type === 'fixed') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / zoom;
    const s = r * 0.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * s, y - s);
      ctx.lineTo(x + i * s - s * 0.4, y + s);
      ctx.stroke();
    }
  }
}

/** Draw slider rail lines (grey lines between A and C, blue when selected). */
export function drawSliderRails(
  ctx: CanvasRenderingContext2D,
  sliders: Record<string, SliderConstraint>,
  joints: Record<string, Joint>,
  zoom: number,
  selectedIds: Set<string>,
) {
  const SLIDER_COLOR = '#777';
  for (const slider of Object.values(sliders)) {
    const jA = joints[slider.jointIdA];
    const jC = joints[slider.jointIdC];
    if (!jA || !jC) continue;
    const isSelected = selectedIds.has(slider.id);
    ctx.beginPath();
    ctx.moveTo(jA.position.x, jA.position.y);
    ctx.lineTo(jC.position.x, jC.position.y);
    ctx.strokeStyle = isSelected ? SELECTION_COLOR : SLIDER_COLOR;
    ctx.lineWidth = (isSelected ? 4 : 3) / zoom;
    ctx.lineCap = 'round';
    ctx.setLineDash([8 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Draw ghost preview during slider placement (A placed, cursor = C). */
export function drawSliderGhost(
  ctx: CanvasRenderingContext2D,
  pointA: Vec2,
  cursorWorld: Vec2 | null,
  zoom: number,
) {
  if (!cursorWorld) return;
  const midX = (pointA.x + cursorWorld.x) / 2;
  const midY = (pointA.y + cursorWorld.y) / 2;

  // Draw rail line
  ctx.beginPath();
  ctx.moveTo(pointA.x, pointA.y);
  ctx.lineTo(cursorWorld.x, cursorWorld.y);
  ctx.strokeStyle = '#777';
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([8 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw ghost B at midpoint
  ctx.beginPath();
  ctx.arc(midX, midY, 6 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(153, 153, 153, 0.5)';
  ctx.fill();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.5 / zoom;
  ctx.stroke();

  // Draw ghost C at cursor
  ctx.beginPath();
  ctx.arc(cursorWorld.x, cursorWorld.y, 6 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(153, 153, 153, 0.5)';
  ctx.fill();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.5 / zoom;
  ctx.stroke();
}

export function drawMechanism(
  ctx: CanvasRenderingContext2D,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  outlines: Record<string, Outline>,
  sliders: Record<string, SliderConstraint>,
  selectedIds: Set<string>,
  hoveredId: string | null,
  zoom: number,
  showLinks: boolean = true,
  baseBodyId?: string,
  frozenOutlinePoints?: Map<string, Vec2[]>,
) {
  // Build body membership map for joints
  const jointBodies = new Map<string, Body[]>();
  for (const body of Object.values(bodies)) {
    for (const jid of body.jointIds) {
      const arr = jointBodies.get(jid) || [];
      arr.push(body);
      jointBodies.set(jid, arr);
    }
  }

  // Base body joint set for filtering base-only links
  const baseJointIds = baseBodyId && bodies[baseBodyId]
    ? new Set(bodies[baseBodyId].jointIds)
    : new Set<string>();

  // Build link-to-body color map: find the body that owns both endpoints
  const linkColors = new Map<string, string>();
  for (const link of Object.values(links)) {
    const [idA, idB] = link.jointIds;
    let bestColor = '#666666'; // fallback
    for (const body of Object.values(bodies)) {
      if (body.jointIds.includes(idA) && body.jointIds.includes(idB)) {
        bestColor = body.color;
        break;
      }
    }
    linkColors.set(link.id, bestColor);
  }

  // Draw links with body-derived color (skip base-body-only links, respect per-body showLinks)
  if (showLinks) {
    for (const link of Object.values(links)) {
      const [idA, idB] = link.jointIds;
      // Find the owning body for this link (non-base body that owns both endpoints)
      let owningBody: Body | null = null;
      for (const body of Object.values(bodies)) {
        if (body.id === baseBodyId) continue;
        if (body.jointIds.includes(idA) && body.jointIds.includes(idB)) {
          owningBody = body;
          break;
        }
      }
      // Skip links where both endpoints are only in the base body
      if (!owningBody && baseJointIds.has(idA) && baseJointIds.has(idB)) continue;
      // Skip if the owning body has links hidden
      if (owningBody && !owningBody.showLinks) continue;
      drawLink(ctx, link, joints, zoom, linkColors.get(link.id) || '#666666');
    }
  }

  // Draw slider rails
  drawSliderRails(ctx, sliders, joints, zoom, selectedIds);

  // Draw outlines (use frozen points if outlines are locked)
  drawOutlines(ctx, Object.values(outlines), bodies, joints, zoom, selectedIds, frozenOutlinePoints);

  // Draw joints with body rings
  for (const joint of Object.values(joints)) {
    const memberBodies = jointBodies.get(joint.id) || [];
    drawJoint(ctx, joint, selectedIds.has(joint.id), hoveredId === joint.id, zoom, memberBodies);
  }
}

/** Draw all completed outlines, transformed to current body positions. */
export function drawOutlines(
  ctx: CanvasRenderingContext2D,
  outlineList: Outline[],
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  zoom: number,
  selectedIds: Set<string>,
  frozenPoints?: Map<string, Vec2[]>,
) {
  for (const outline of outlineList) {
    const body = bodies[outline.bodyId];
    if (!body || outline.points.length < 2 || !outline.visible) continue;

    const worldPoints = frozenPoints?.get(outline.id)
      ?? (() => {
        const transform = computeBodyTransform(body, joints);
        return outline.points.map((p) => localToWorld(p, transform));
      })();
    const isSelected = selectedIds.has(outline.id);

    ctx.beginPath();
    ctx.moveTo(worldPoints[0].x, worldPoints[0].y);
    for (let i = 1; i < worldPoints.length; i++) {
      ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
    }
    ctx.closePath();

    // Fill with transparent body color
    ctx.fillStyle = body.color + (isSelected ? '33' : '1A');
    ctx.fill();

    // Stroke
    ctx.strokeStyle = isSelected ? SELECTION_COLOR : body.color;
    ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
    ctx.stroke();
  }
}

/** Draw outline in editing mode: blue dashed border + draggable vertex squares. */
export function drawOutlineEditMode(
  ctx: CanvasRenderingContext2D,
  worldPoints: Vec2[],
  zoom: number,
  selectedVertexIndex: number | null,
) {
  if (worldPoints.length < 2) return;

  // Draw blue dashed outline
  ctx.beginPath();
  ctx.moveTo(worldPoints[0].x, worldPoints[0].y);
  for (let i = 1; i < worldPoints.length; i++) {
    ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Light fill
  ctx.fillStyle = 'rgba(74, 158, 255, 0.08)';
  ctx.fill();

  // Draw vertex squares
  const vertSize = 5 / zoom;
  for (let i = 0; i < worldPoints.length; i++) {
    const p = worldPoints[i];
    const isSelected = i === selectedVertexIndex;
    ctx.fillStyle = isSelected ? SELECTION_COLOR : '#fff';
    ctx.fillRect(p.x - vertSize, p.y - vertSize, vertSize * 2, vertSize * 2);
    ctx.strokeStyle = isSelected ? '#fff' : SELECTION_COLOR;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(p.x - vertSize, p.y - vertSize, vertSize * 2, vertSize * 2);
  }
}

/** Draw the in-progress outline ghost (world-space points + cursor). */
export function drawOutlineGhost(
  ctx: CanvasRenderingContext2D,
  points: Vec2[],
  cursorWorld: Vec2 | null,
  bodyColor: string,
  zoom: number,
) {
  if (points.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (cursorWorld) {
    ctx.lineTo(cursorWorld.x, cursorWorld.y);
  }

  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw dots at each placed point
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = bodyColor;
    ctx.fill();
  }

  // Highlight first point (close target) if 3+ points
  if (points.length >= 3) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, 8 / zoom, 0, Math.PI * 2);
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();
  }
}
