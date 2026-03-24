import type { CanvasImage, Vec2 } from '../types';
import { SELECTION_COLOR } from '../utils/constants';

/** Cache loaded HTMLImageElement objects by their data URL (or a hash of it). */
const imageCache = new Map<string, HTMLImageElement>();

function getOrLoadImage(src: string): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached && cached.complete) return cached;
  if (cached) return null; // still loading
  const img = new Image();
  img.src = src;
  imageCache.set(src, img);
  return img.complete ? img : null;
}

/** Get the four corners of the image bounding box in world space. */
export function getImageCorners(img: CanvasImage): Vec2[] {
  const hw = (img.naturalWidth * img.scale) / 2;
  const hh = (img.naturalHeight * img.scale) / 2;
  const cos = Math.cos(img.rotation);
  const sin = Math.sin(img.rotation);
  const corners: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return corners.map((c) => ({
    x: img.position.x + c.x * cos - c.y * sin,
    y: img.position.y + c.x * sin + c.y * cos,
  }));
}

/** Hit-test a world point against an image's bounding box. */
export function hitTestImage(worldPos: Vec2, img: CanvasImage): boolean {
  if (!img.visible) return false;
  // Transform worldPos into image-local space
  const dx = worldPos.x - img.position.x;
  const dy = worldPos.y - img.position.y;
  const cos = Math.cos(-img.rotation);
  const sin = Math.sin(-img.rotation);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const hw = (img.naturalWidth * img.scale) / 2;
  const hh = (img.naturalHeight * img.scale) / 2;
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
}

/** Check if world point is near the rotation handle (top-center, outside box). */
export function hitTestRotateHandle(worldPos: Vec2, img: CanvasImage, zoom: number): boolean {
  const handleDist = 30 / zoom;
  const hh = (img.naturalHeight * img.scale) / 2;
  const cos = Math.cos(img.rotation);
  const sin = Math.sin(img.rotation);
  // Handle is at (0, -hh - handleDist) in local space
  const hx = img.position.x + (0) * cos - (-hh - handleDist) * sin;
  const hy = img.position.y + (0) * sin + (-hh - handleDist) * cos;
  const dx = worldPos.x - hx;
  const dy = worldPos.y - hy;
  const threshold = 10 / zoom;
  return dx * dx + dy * dy < threshold * threshold;
}

/** Check if world point is near any scale handle (corners). */
export function hitTestScaleHandle(worldPos: Vec2, img: CanvasImage, zoom: number): boolean {
  const hw = (img.naturalWidth * img.scale) / 2;
  const hh = (img.naturalHeight * img.scale) / 2;
  const cos = Math.cos(img.rotation);
  const sin = Math.sin(img.rotation);
  const threshold = 10 / zoom;

  const cornerOffsets = [
    { x: -hw, y: -hh }, { x: hw, y: -hh },
    { x: hw, y: hh }, { x: -hw, y: hh },
  ];
  for (const c of cornerOffsets) {
    const cx = img.position.x + c.x * cos - c.y * sin;
    const cy = img.position.y + c.x * sin + c.y * cos;
    const dx = worldPos.x - cx;
    const dy = worldPos.y - cy;
    if (dx * dx + dy * dy < threshold * threshold) return true;
  }
  return false;
}

/** Draw all canvas images behind the mechanism. */
export function drawImages(
  ctx: CanvasRenderingContext2D,
  images: Record<string, CanvasImage>,
  zoom: number,
  selectedIds: Set<string>,
) {
  for (const img of Object.values(images)) {
    if (!img.visible) continue;
    const htmlImg = getOrLoadImage(img.src);
    if (!htmlImg) continue;

    ctx.save();
    ctx.translate(img.position.x, img.position.y);
    ctx.rotate(img.rotation);
    ctx.globalAlpha = img.opacity;

    const w = img.naturalWidth * img.scale;
    const h = img.naturalHeight * img.scale;
    ctx.drawImage(htmlImg, -w / 2, -h / 2, w, h);

    ctx.globalAlpha = 1;

    // Draw selection frame
    if (selectedIds.has(img.id)) {
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.setLineDash([]);

      // Corner handles
      const hw = w / 2;
      const hh = h / 2;
      const handleSize = 6 / zoom;
      ctx.fillStyle = SELECTION_COLOR;
      for (const [cx, cy] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      }

      // Rotation handle (line + circle above top center)
      const rotHandleDist = 30 / zoom;
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, -hh - rotHandleDist);
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -hh - rotHandleDist, 5 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = SELECTION_COLOR;
      ctx.fill();
    }

    ctx.restore();
  }
}
