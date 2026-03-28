import type { Vec2, CameraState, SimDragState, ForceVector } from '../types';
import { GRID_COLOR, GRID_MAJOR_COLOR, BACKGROUND_COLOR } from '../utils/constants';

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
  gridSize: number,
) {
  const { pan, zoom } = camera;

  // Determine visible world bounds
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (canvasWidth - pan.x) / zoom;
  const bottom = (canvasHeight - pan.y) / zoom;

  // Adaptive grid: scale grid spacing with zoom
  // Use gridSize as the base unit; only collapse when too dense on screen
  let step = gridSize;
  while (step * zoom < 8) step *= 2;

  const startX = Math.floor(left / step) * step;
  const startY = Math.floor(top / step) * step;

  ctx.lineWidth = 1 / zoom;

  for (let x = startX; x <= right; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = x === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.stroke();
  }

  for (let y = startY; y <= bottom; y += step) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.strokeStyle = y === 0 ? GRID_MAJOR_COLOR : GRID_COLOR;
    ctx.stroke();
  }

  // Origin cross
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5 / zoom;
  const crossSize = 15 / zoom;
  ctx.beginPath();
  ctx.moveTo(-crossSize, 0);
  ctx.lineTo(crossSize, 0);
  ctx.moveTo(0, -crossSize);
  ctx.lineTo(0, crossSize);
  ctx.stroke();
}

/**
 * Draw ruler strips pinned to the top and left edges of the canvas.
 * Tick positions correspond to world coordinates (1cm = 25 world units).
 * The strips stay fixed to the viewport — they don't scroll with the canvas.
 *
 * IMPORTANT: This must be called AFTER resetCamera() since it draws in screen space.
 */
export function drawRulers(
  ctx: CanvasRenderingContext2D,
  camera: CameraState,
  canvasWidth: number,
  canvasHeight: number,
) {
  const { pan, zoom } = camera;
  const PX_PER_CM = 25; // 1cm = 25 world units
  const RULER_SIZE = 20; // px height/width of ruler strip

  // Work in screen-space (identity transform assumed)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Visible world bounds
  const left = -pan.x / zoom;
  const top = -pan.y / zoom;
  const right = (canvasWidth - pan.x) / zoom;
  const bottom = (canvasHeight - pan.y) / zoom;

  // Adaptive tick spacing
  const cmScreenPx = PX_PER_CM * zoom;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let majorCm = 1;
  for (const s of steps) {
    if (s * cmScreenPx >= 40) { majorCm = s; break; }
  }
  const minorCm = majorCm / 5;
  const minorScreenPx = minorCm * cmScreenPx;

  // --- Top ruler strip (horizontal, along X axis) ---
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(RULER_SIZE, 0, canvasWidth - RULER_SIZE, RULER_SIZE);
  // Bottom border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE, RULER_SIZE);
  ctx.lineTo(canvasWidth, RULER_SIZE);
  ctx.stroke();

  const xStartCm = Math.floor((left / PX_PER_CM) / minorCm) * minorCm;
  const xEndCm = Math.ceil((right / PX_PER_CM) / minorCm) * minorCm;

  for (let cm = xStartCm; cm <= xEndCm; cm += minorCm) {
    const worldX = cm * PX_PER_CM;
    const screenX = worldX * zoom + pan.x;
    if (screenX < RULER_SIZE || screenX > canvasWidth) continue;

    const isMajor = Math.abs(cm - Math.round(cm / majorCm) * majorCm) < minorCm * 0.1;
    const tickH = isMajor ? RULER_SIZE : RULER_SIZE * 0.4;

    ctx.beginPath();
    ctx.moveTo(screenX, RULER_SIZE);
    ctx.lineTo(screenX, RULER_SIZE - tickH);
    ctx.strokeStyle = isMajor ? '#888' : '#bbb';
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.stroke();

    if (isMajor && minorScreenPx > 2) {
      ctx.font = '9px monospace';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatRulerLabel(cm), screenX, 2);
    }
  }

  // --- Left ruler strip (vertical, along Y axis) ---
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, canvasHeight - RULER_SIZE);
  // Right border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE, RULER_SIZE);
  ctx.lineTo(RULER_SIZE, canvasHeight);
  ctx.stroke();

  const yStartCm = Math.floor((top / PX_PER_CM) / minorCm) * minorCm;
  const yEndCm = Math.ceil((bottom / PX_PER_CM) / minorCm) * minorCm;

  for (let cm = yStartCm; cm <= yEndCm; cm += minorCm) {
    const worldY = cm * PX_PER_CM;
    const screenY = worldY * zoom + pan.y;
    if (screenY < RULER_SIZE || screenY > canvasHeight) continue;

    const isMajor = Math.abs(cm - Math.round(cm / majorCm) * majorCm) < minorCm * 0.1;
    const tickW = isMajor ? RULER_SIZE : RULER_SIZE * 0.4;

    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, screenY);
    ctx.lineTo(RULER_SIZE - tickW, screenY);
    ctx.strokeStyle = isMajor ? '#888' : '#bbb';
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.stroke();

    if (isMajor && minorScreenPx > 2) {
      ctx.save();
      ctx.translate(10, screenY);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '9px monospace';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatRulerLabel(cm), 0, 0);
      ctx.restore();
    }
  }

  // Corner square (where rulers meet)
  ctx.fillStyle = 'rgba(248, 248, 248, 0.92)';
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, RULER_SIZE, RULER_SIZE);

  ctx.restore();
}

function formatRulerLabel(cm: number): string {
  const absCm = Math.abs(cm);
  if (absCm >= 100) {
    const m = cm / 100;
    return Number.isInteger(m) ? `${m}m` : `${m.toFixed(1)}m`;
  }
  if (absCm >= 1) {
    return Number.isInteger(cm) ? `${cm}cm` : `${cm.toFixed(1)}cm`;
  }
  return `${(cm * 10).toFixed(0)}mm`;
}

export function drawPathTraces(
  ctx: CanvasRenderingContext2D,
  traces: Map<string, Vec2[]>,
  zoom: number,
) {
  ctx.lineWidth = 1.5 / zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const colors = ['#E91E63', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];
  let colorIdx = 0;

  for (const [, points] of traces) {
    if (points.length < 2) continue;
    ctx.strokeStyle = colors[colorIdx % colors.length];
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    colorIdx++;
  }
}

export function drawLinkGhost(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  zoom: number,
) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = 'rgba(33, 150, 243, 0.5)';
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([6 / zoom, 4 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawHUD(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  dof: number,
  cursorWorld: Vec2 | null,
) {
  ctx.font = '12px monospace';
  ctx.textBaseline = 'bottom';

  // DOF badge
  const dofText = `DOF: ${dof}`;
  ctx.fillStyle = dof === 1 ? '#4CAF50' : dof === 0 ? '#FF9800' : dof < 0 ? '#E53935' : '#2196F3';
  ctx.fillRect(8, canvasHeight - 28, ctx.measureText(dofText).width + 12, 22);
  ctx.fillStyle = '#fff';
  ctx.fillText(dofText, 14, canvasHeight - 10);

  // Cursor coords
  if (cursorWorld) {
    const coordText = `(${cursorWorld.x.toFixed(1)}, ${cursorWorld.y.toFixed(1)})`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(coordText, 90, canvasHeight - 10);
  }

}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
  color: string, lineWidth: number, zoom: number,
  dashed: boolean,
) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1 / zoom) return;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / zoom;
  if (dashed) ctx.setLineDash([5 / zoom, 3 / zoom]);
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);

  // Arrowhead
  const headLen = 10 / zoom;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle - 0.4), toY - headLen * Math.sin(angle - 0.4));
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle + 0.4), toY - headLen * Math.sin(angle + 0.4));
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth / zoom;
  ctx.stroke();
}

/** Draw all force vectors from the solver (gravity + drag) */
export function drawForceVectors(
  ctx: CanvasRenderingContext2D,
  vectors: ForceVector[],
  zoom: number,
  showForceUnits: boolean = false,
) {
  for (const v of vectors) {
    const toX = v.origin.x + v.force.x;
    const toY = v.origin.y + v.force.y;
    const lineWidth = v.color === '#42A5F5' ? 1.5 : 2.5;
    drawArrow(ctx, v.origin.x, v.origin.y, toX, toY, v.color, lineWidth, zoom, false);

    // Small dot at origin
    ctx.beginPath();
    ctx.arc(v.origin.x, v.origin.y, 3 / zoom, 0, Math.PI * 2);
    ctx.fillStyle = v.color;
    ctx.fill();

    // Force magnitude label
    if (showForceUnits) {
      const mag = Math.sqrt(v.force.x * v.force.x + v.force.y * v.force.y);
      if (mag > 0.1) {
        const label = mag >= 1000 ? `${(mag / 1000).toFixed(1)} kN` : `${mag.toFixed(1)} N`;
        const midX = v.origin.x + v.force.x * 0.5;
        const midY = v.origin.y + v.force.y * 0.5;
        // Offset label perpendicular to force direction
        const nx = -v.force.y / mag;
        const ny = v.force.x / mag;
        const offsetDist = 12 / zoom;
        ctx.font = `bold ${10 / zoom}px monospace`;
        ctx.fillStyle = v.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX + nx * offsetDist, midY + ny * offsetDist);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }
}

/** Draw CoM markers and gravity vectors for bodies with useOutlineCOM enabled. */
export function drawCOMMarkers(
  ctx: CanvasRenderingContext2D,
  comPositions: { pos: Vec2; color: string; gravityForce: Vec2 | null }[],
  zoom: number,
) {
  for (const { pos, color, gravityForce } of comPositions) {
    // Diamond marker at COM
    const s = 6 / zoom;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - s);
    ctx.lineTo(pos.x + s, pos.y);
    ctx.lineTo(pos.x, pos.y + s);
    ctx.lineTo(pos.x - s, pos.y);
    ctx.closePath();
    ctx.fillStyle = color + '88';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / zoom;
    ctx.stroke();

    // Label
    ctx.font = `${9 / zoom}px monospace`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillText('CoM', pos.x, pos.y - s - 2 / zoom);
    ctx.textAlign = 'left';

    // Gravity vector from COM
    if (gravityForce) {
      const toX = pos.x + gravityForce.x;
      const toY = pos.y + gravityForce.y;
      drawArrow(ctx, pos.x, pos.y, toX, toY, color, 2, zoom, false);
    }
  }
}

/** Draw the user drag interaction (grab point highlight + arrow to cursor) */
export function drawDragInteraction(
  ctx: CanvasRenderingContext2D,
  simDrag: SimDragState,
  grabWorldPos: Vec2,
  zoom: number,
) {
  // Grab point highlight ring
  ctx.beginPath();
  ctx.arc(grabWorldPos.x, grabWorldPos.y, 12 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 152, 0, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#FF9800';
  ctx.lineWidth = 2.5 / zoom;
  ctx.stroke();

  // Arrow from grab point to cursor
  drawArrow(ctx, grabWorldPos.x, grabWorldPos.y, simDrag.cursorPoint.x, simDrag.cursorPoint.y, '#FF9800', 2.5, zoom, true);

  // Cursor target dot
  ctx.beginPath();
  ctx.arc(simDrag.cursorPoint.x, simDrag.cursorPoint.y, 4 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = '#FF9800';
  ctx.fill();
}

/**
 * Draw the long-press arc body selector around a joint.
 * Circles animate radially from the joint center to their arc positions.
 * Drawn in screen-space (call after resetCamera).
 */
export function drawArcSelector(
  ctx: CanvasRenderingContext2D,
  arcPositions: { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number }[],
  bodyColors: string[],
  bodySelected: boolean[],
  showTime: number,
  collapseTime: number | null,
) {
  const now = Date.now();
  const CIRCLE_RADIUS = 12;
  const ANIM_DURATION = 180; // ms per circle
  const MAX_TOTAL_STAGGER = 400; // ms max total stagger across all circles
  const count = arcPositions.length;
  const STAGGER = count > 1 ? Math.min(50, MAX_TOTAL_STAGGER / (count - 1)) : 50;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let i = 0; i < arcPositions.length; i++) {
    const { screenX, screenY, centerScreenX, centerScreenY } = arcPositions[i];

    let t: number; // 0 = at center, 1 = at final position
    if (collapseTime !== null) {
      // Collapsing: reverse order (last circle collapses first stays longest, but stagger from left)
      // Actually user wants same left-to-right order for collapse
      const collapseElapsed = now - collapseTime - i * STAGGER;
      if (collapseElapsed < 0) {
        t = 1; // not started collapsing yet
      } else {
        t = 1 - Math.min(1, collapseElapsed / ANIM_DURATION);
      }
    } else {
      // Expanding
      const expandElapsed = now - showTime - i * STAGGER;
      if (expandElapsed < 0) { continue; } // not started yet
      t = Math.min(1, expandElapsed / ANIM_DURATION);
    }

    if (t <= 0) continue; // fully collapsed

    // Ease in-out (cubic)
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Interpolate position from center to final
    const drawX = centerScreenX + (screenX - centerScreenX) * eased;
    const drawY = centerScreenY + (screenY - centerScreenY) * eased;
    const r = CIRCLE_RADIUS * (0.4 + 0.6 * eased);
    const alpha = eased;

    // Filled circle with body color
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(drawX, drawY, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyColors[i];
    ctx.fill();

    // Selection ring (blue) if joint is in this body
    if (bodySelected[i]) {
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawModeBadge(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  mode: string,
) {
  if (mode !== 'simulate') return;
  ctx.font = 'bold 11px monospace';
  ctx.textBaseline = 'top';
  const text = 'SIMULATE';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = '#FF9800';
  ctx.fillRect(canvasWidth - w - 8, 8, w, 20);
  ctx.fillStyle = '#000';
  ctx.fillText(text, canvasWidth - w - 2, 12);
}

export function clearCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);
}
