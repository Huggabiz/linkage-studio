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
  let step = gridSize;
  while (step * zoom < 15) step *= 5;

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
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5 / zoom;
  const crossSize = 15 / zoom;
  ctx.beginPath();
  ctx.moveTo(-crossSize, 0);
  ctx.lineTo(crossSize, 0);
  ctx.moveTo(0, -crossSize);
  ctx.lineTo(0, crossSize);
  ctx.stroke();
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
