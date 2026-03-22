import type { Joint, Link } from '../types';
import {
  JOINT_RADIUS, JOINT_RADIUS_FIXED, LINK_WIDTH,
  REVOLUTE_COLOR, FIXED_COLOR, LINK_COLOR,
  SELECTION_COLOR, HOVER_COLOR,
} from '../utils/constants';

function getJointColor(type: Joint['type']): string {
  switch (type) {
    case 'revolute': return REVOLUTE_COLOR;
    case 'fixed': return FIXED_COLOR;
  }
}

export function drawLink(
  ctx: CanvasRenderingContext2D,
  link: Link,
  joints: Record<string, Joint>,
  selected: boolean,
  hovered: boolean,
  zoom: number,
) {
  const jA = joints[link.jointIds[0]];
  const jB = joints[link.jointIds[1]];
  if (!jA || !jB) return;

  ctx.beginPath();
  ctx.moveTo(jA.position.x, jA.position.y);
  ctx.lineTo(jB.position.x, jB.position.y);
  ctx.strokeStyle = selected ? SELECTION_COLOR : hovered ? HOVER_COLOR : LINK_COLOR;
  ctx.lineWidth = (selected ? LINK_WIDTH + 2 : LINK_WIDTH) / zoom;
  ctx.lineCap = 'round';
  ctx.stroke();
}

export function drawJoint(
  ctx: CanvasRenderingContext2D,
  joint: Joint,
  selected: boolean,
  hovered: boolean,
  zoom: number,
) {
  const { x, y } = joint.position;
  const baseRadius = joint.type === 'fixed' ? JOINT_RADIUS_FIXED : JOINT_RADIUS;
  const r = baseRadius / zoom;

  if (selected || hovered) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3 / zoom, 0, Math.PI * 2);
    ctx.strokeStyle = selected ? SELECTION_COLOR : HOVER_COLOR;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = getJointColor(joint.type);
  ctx.fill();

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

export function drawMechanism(
  ctx: CanvasRenderingContext2D,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  selectedIds: Set<string>,
  hoveredId: string | null,
  zoom: number,
) {
  for (const link of Object.values(links)) {
    drawLink(ctx, link, joints, selectedIds.has(link.id), hoveredId === link.id, zoom);
  }
  for (const joint of Object.values(joints)) {
    drawJoint(ctx, joint, selectedIds.has(joint.id), hoveredId === joint.id, zoom);
  }
}
