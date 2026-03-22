import type { Vec2 } from '../../types';

/**
 * Distance constraint: (xj-xi)^2 + (yj-yi)^2 - L^2 = 0
 * Returns the residual and fills Jacobian row entries.
 */
export function distanceConstraint(
  pi: Vec2,
  pj: Vec2,
  restLength: number,
): {
  residual: number;
  dxi: number; dyi: number;
  dxj: number; dyj: number;
} {
  const dx = pj.x - pi.x;
  const dy = pj.y - pi.y;
  const residual = dx * dx + dy * dy - restLength * restLength;
  return {
    residual,
    dxi: -2 * dx,
    dyi: -2 * dy,
    dxj: 2 * dx,
    dyj: 2 * dy,
  };
}

/**
 * On-axis constraint for prismatic joints.
 * Point must stay on the line through p0 in direction axis.
 * Constrains the perpendicular component to zero.
 */
export function onAxisConstraint(
  point: Vec2,
  p0: Vec2,
  axis: Vec2,
): {
  residual: number;
  dx: number; dy: number;
} {
  // a_perp = (-ay, ax)
  const perpX = -axis.y;
  const perpY = axis.x;
  const residual = (point.x - p0.x) * perpX + (point.y - p0.y) * perpY;
  return { residual, dx: perpX, dy: perpY };
}

/**
 * Angle driver constraint: atan2(dy, dx) - targetAngle = 0
 * Applied between a grounded joint and a driven joint.
 */
export function angleDriverConstraint(
  pFixed: Vec2,
  pDriven: Vec2,
  targetAngle: number,
): {
  residual: number;
  dxDriven: number; dyDriven: number;
} {
  const dx = pDriven.x - pFixed.x;
  const dy = pDriven.y - pFixed.y;
  let angle = Math.atan2(dy, dx);

  // Normalize residual to [-pi, pi]
  let residual = angle - targetAngle;
  while (residual > Math.PI) residual -= 2 * Math.PI;
  while (residual < -Math.PI) residual += 2 * Math.PI;

  const r2 = dx * dx + dy * dy;
  if (r2 < 1e-14) return { residual: 0, dxDriven: 0, dyDriven: 0 };

  return {
    residual,
    dxDriven: -dy / r2,
    dyDriven: dx / r2,
  };
}
