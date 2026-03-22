import type { Joint, Link, Body, Vec2, SimDragState, AppMode, ForceVector } from '../types';
import type { CameraState } from '../types';
import { applyCamera, resetCamera } from './camera';
import { drawMechanism } from './draw-mechanism';
import { drawGrid, drawPathTraces, drawForceVectors, drawDragInteraction, drawModeBadge, drawHUD, clearCanvas } from './draw-overlays';
import { lerp } from '../core/math/vec2';

export interface RenderState {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  selectedIds: Set<string>;
  hoveredId: string | null;
  camera: CameraState;
  gridEnabled: boolean;
  gridSize: number;
  dof: number;
  cursorWorld: Vec2 | null;
  pathTraces: Map<string, Vec2[]>;
  simDrag: SimDragState | null;
  mode: AppMode;
  forceVectors: ForceVector[];
  showLinks: boolean;
}

export function render(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: RenderState,
) {
  const w = canvas.width;
  const h = canvas.height;

  clearCanvas(ctx, w, h);
  applyCamera(ctx, state.camera);

  if (state.gridEnabled) {
    drawGrid(ctx, state.camera, w, h, state.gridSize);
  }

  drawMechanism(ctx, state.joints, state.links, state.bodies, state.selectedIds, state.hoveredId, state.camera.zoom, state.showLinks);

  drawPathTraces(ctx, state.pathTraces, state.camera.zoom);

  if (state.mode === 'simulate' && state.forceVectors.length > 0) {
    drawForceVectors(ctx, state.forceVectors, state.camera.zoom);
  }

  if (state.simDrag && state.simDrag.active) {
    let grabWorldPos: Vec2 = state.simDrag.grabPoint;
    if (state.simDrag.linkId) {
      const link = state.links[state.simDrag.linkId];
      if (link) {
        const jA = state.joints[link.jointIds[0]];
        const jB = state.joints[link.jointIds[1]];
        if (jA && jB) grabWorldPos = lerp(jA.position, jB.position, state.simDrag.grabT);
      }
    }
    drawDragInteraction(ctx, state.simDrag, grabWorldPos, state.camera.zoom);
  }

  resetCamera(ctx);
  drawHUD(ctx, w, h, state.dof, state.cursorWorld);
  drawModeBadge(ctx, w, state.mode);
}
