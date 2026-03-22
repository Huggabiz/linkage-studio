import type { Vec2, CameraState } from '../types';

export function screenToWorld(screen: Vec2, camera: CameraState): Vec2 {
  return {
    x: (screen.x - camera.pan.x) / camera.zoom,
    y: (screen.y - camera.pan.y) / camera.zoom,
  };
}

export function worldToScreen(world: Vec2, camera: CameraState): Vec2 {
  return {
    x: world.x * camera.zoom + camera.pan.x,
    y: world.y * camera.zoom + camera.pan.y,
  };
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: CameraState) {
  ctx.setTransform(camera.zoom, 0, 0, camera.zoom, camera.pan.x, camera.pan.y);
}

export function resetCamera(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
