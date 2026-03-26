import type { Joint, Link, Body, Outline, CanvasImage, SliderConstraint, Vec2, SimDragState, AppMode, ForceVector, CreateTool } from '../types';
import type { CameraState } from '../types';
import { applyCamera, resetCamera } from './camera';
import { drawMechanism, drawOutlineGhost, drawSliderGhost, drawOutlineEditMode } from './draw-mechanism';
import { drawImages } from './draw-images';
import { drawGrid, drawRulers, drawPathTraces, drawForceVectors, drawDragInteraction, drawModeBadge, drawHUD, clearCanvas, drawCOMMarkers } from './draw-overlays';
import { lerp } from '../core/math/vec2';
import { computeBodyTransform, localToWorld, polygonCentroid, polygonArea } from '../core/body-transform';

export interface RenderState {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  outlines: Record<string, Outline>;
  images: Record<string, CanvasImage>;
  sliders: Record<string, SliderConstraint>;
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
  showVectors: boolean;
  showRulers: boolean;
  showForceUnits: boolean;
  createTool: CreateTool;
  outlinePoints: Vec2[];
  activeBodyColor: string;
  gravityEnabled: boolean;
  gravityStrength: number;
  baseBodyId: string;
  frozenOutlinePoints?: Map<string, Vec2[]>;
  sliderPointA?: Vec2 | null;
  editingOutlineId?: string | null;
  editingVertexIndex?: number | null;
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

  if (state.showRulers) {
    drawRulers(ctx, state.camera, w, h);
  }

  // Draw images behind mechanism
  drawImages(ctx, state.images, state.camera.zoom, state.selectedIds);

  // When editing an outline, exclude it from frozen points so it renders from live data
  let frozenPts = state.frozenOutlinePoints;
  if (state.editingOutlineId && frozenPts && frozenPts.has(state.editingOutlineId)) {
    frozenPts = new Map(frozenPts);
    frozenPts.delete(state.editingOutlineId);
  }
  drawMechanism(ctx, state.joints, state.links, state.bodies, state.outlines, state.sliders, state.selectedIds, state.hoveredId, state.camera.zoom, state.showLinks, state.baseBodyId, frozenPts);

  drawPathTraces(ctx, state.pathTraces, state.camera.zoom);

  // Outline edit mode overlay
  if (state.mode === 'create' && state.editingOutlineId) {
    const outline = state.outlines[state.editingOutlineId];
    if (outline) {
      const body = state.bodies[outline.bodyId];
      if (body && outline.points.length >= 2) {
        const transform = computeBodyTransform(body, state.joints);
        const worldPts = outline.points.map((p) => localToWorld(p, transform));
        drawOutlineEditMode(ctx, worldPts, state.camera.zoom, state.editingVertexIndex ?? null);
      }
    }
  }

  // Outline ghost (in-progress drawing)
  if (state.mode === 'create' && state.createTool === 'outline' && state.outlinePoints.length > 0) {
    drawOutlineGhost(ctx, state.outlinePoints, state.cursorWorld, state.activeBodyColor, state.camera.zoom);
  }

  // Slider ghost (placing second point)
  if (state.mode === 'create' && state.createTool === 'slider' && state.sliderPointA) {
    drawSliderGhost(ctx, state.sliderPointA, state.cursorWorld, state.camera.zoom);
  }

  if (state.mode === 'simulate' && state.forceVectors.length > 0 && state.showVectors) {
    drawForceVectors(ctx, state.forceVectors, state.camera.zoom, state.showForceUnits);
  }

  // Draw CoM markers for bodies with useOutlineCOM enabled (both modes)
  if (state.showVectors) {
    const comPositions: { pos: Vec2; color: string; gravityForce: Vec2 | null }[] = [];
    for (const body of Object.values(state.bodies)) {
      if (!body.useOutlineCOM) continue;
      const bodyOutlines = Object.values(state.outlines).filter((o) => o.bodyId === body.id);
      if (bodyOutlines.length === 0) continue;
      const transform = computeBodyTransform(body, state.joints);
      const allWorldPts = bodyOutlines.flatMap((o) => o.points.map((p) => localToWorld(p, transform)));
      const com = polygonCentroid(allWorldPts);
      // Scale gravity vector by area-based mass (matching physics calculation)
      let gravityForce: Vec2 | null = null;
      if (state.gravityEnabled) {
        const area = polygonArea(allWorldPts);
        const massMult = Math.max(0.1, area / 1000);
        gravityForce = { x: 0, y: state.gravityStrength * massMult * 0.005 };
      }
      comPositions.push({ pos: com, color: body.color, gravityForce });
    }
    if (comPositions.length > 0) {
      drawCOMMarkers(ctx, comPositions, state.camera.zoom);
    }
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
