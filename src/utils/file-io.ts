import type { Joint, Link, Body, Outline, CanvasImage, SliderConstraint, Vec2 } from '../types';

declare const __APP_VERSION__: string;

/** Serializable format for a linkage file (.slinker) */
interface SlinkerFile {
  version: string;
  joints: Record<string, { id: string; type: string; position: Vec2; connectedLinkIds: string[] }>;
  links: Record<string, { id: string; jointIds: [string, string]; restLength: number; mass: number }>;
  bodies: Record<string, { id: string; name: string; color: string; jointIds: string[]; useOutlineCOM: boolean }>;
  baseBodyId: string;
  outlines: Record<string, { id: string; bodyId: string; name?: string; points: Vec2[] }>;
  images?: Record<string, { id: string; bodyId: string; src: string; position: Vec2; scale: number; rotation: number; opacity: number; visible: boolean; naturalWidth: number; naturalHeight: number }>;
  sliders?: Record<string, { id: string; jointIdA: string; jointIdB: string; jointIdC: string; t: number }>;
}

export function serializeMechanism(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  baseBodyId: string,
  outlines: Record<string, Outline>,
  images?: Record<string, CanvasImage>,
  sliders?: Record<string, SliderConstraint>,
): string {
  const data: SlinkerFile = {
    version: __APP_VERSION__,
    joints: {},
    links: {},
    bodies: {},
    baseBodyId,
    outlines: {},
  };

  for (const [id, j] of Object.entries(joints)) {
    data.joints[id] = { id: j.id, type: j.type, position: { x: j.position.x, y: j.position.y }, connectedLinkIds: [...j.connectedLinkIds] };
  }
  for (const [id, l] of Object.entries(links)) {
    data.links[id] = { id: l.id, jointIds: [l.jointIds[0], l.jointIds[1]], restLength: l.restLength, mass: l.mass };
  }
  for (const [id, b] of Object.entries(bodies)) {
    data.bodies[id] = { id: b.id, name: b.name, color: b.color, jointIds: [...b.jointIds], useOutlineCOM: b.useOutlineCOM };
  }
  for (const [id, o] of Object.entries(outlines)) {
    data.outlines[id] = { id: o.id, bodyId: o.bodyId, name: o.name, points: o.points.map(p => ({ x: p.x, y: p.y })) };
  }

  if (images && Object.keys(images).length > 0) {
    data.images = {};
    for (const [id, img] of Object.entries(images)) {
      data.images[id] = {
        id: img.id, bodyId: img.bodyId, src: img.src,
        position: { x: img.position.x, y: img.position.y },
        scale: img.scale, rotation: img.rotation, opacity: img.opacity,
        visible: img.visible, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      };
    }
  }

  if (sliders && Object.keys(sliders).length > 0) {
    data.sliders = {};
    for (const [id, s] of Object.entries(sliders)) {
      data.sliders[id] = { id: s.id, jointIdA: s.jointIdA, jointIdB: s.jointIdB, jointIdC: s.jointIdC, t: s.t };
    }
  }

  return JSON.stringify(data, null, 2);
}

export function deserializeMechanism(json: string): {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images?: Record<string, CanvasImage>;
  sliders?: Record<string, SliderConstraint>;
} | null {
  try {
    const data: SlinkerFile = JSON.parse(json);
    if (!data.joints || !data.bodies || !data.baseBodyId) return null;

    const joints: Record<string, Joint> = {};
    for (const [id, j] of Object.entries(data.joints)) {
      joints[id] = {
        id: j.id,
        type: j.type as 'revolute' | 'fixed',
        position: { x: j.position.x, y: j.position.y },
        connectedLinkIds: j.connectedLinkIds || [],
      };
    }

    const links: Record<string, Link> = {};
    for (const [id, l] of Object.entries(data.links || {})) {
      links[id] = {
        id: l.id,
        jointIds: [l.jointIds[0], l.jointIds[1]],
        restLength: l.restLength,
        mass: l.mass,
      };
    }

    const bodies: Record<string, Body> = {};
    for (const [id, b] of Object.entries(data.bodies)) {
      bodies[id] = {
        id: b.id,
        name: b.name,
        color: b.color,
        jointIds: b.jointIds || [],
        useOutlineCOM: b.useOutlineCOM ?? false,
      };
    }

    const outlines: Record<string, Outline> = {};
    for (const [id, o] of Object.entries(data.outlines || {})) {
      outlines[id] = {
        id: o.id,
        bodyId: o.bodyId,
        name: o.name || `Shape ${Object.keys(outlines).length + 1}`,
        points: o.points.map(p => ({ x: p.x, y: p.y })),
      };
    }

    const images: Record<string, CanvasImage> = {};
    if (data.images) {
      for (const [id, img] of Object.entries(data.images)) {
        images[id] = {
          id: img.id, bodyId: img.bodyId, src: img.src,
          position: { x: img.position.x, y: img.position.y },
          scale: img.scale, rotation: img.rotation, opacity: img.opacity,
          visible: img.visible, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        };
      }
    }

    const sliders: Record<string, SliderConstraint> = {};
    if (data.sliders) {
      for (const [id, s] of Object.entries(data.sliders)) {
        sliders[id] = { id: s.id, jointIdA: s.jointIdA, jointIdB: s.jointIdB, jointIdC: s.jointIdC, t: s.t };
      }
    }

    return { joints, links, bodies, baseBodyId: data.baseBodyId, outlines, images, sliders };
  } catch {
    return null;
  }
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Save with native file picker if available, otherwise download with prompt for name. */
export async function saveFileAs(content: string, suggestedName: string): Promise<void> {
  // Try File System Access API (Chrome/Edge desktop)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Slinker files',
          accept: { 'application/json': ['.slinker'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // user cancelled
      // Fall through to prompt + download
    }
  }
  // Fallback: prompt for name then download
  const name = prompt('Save as:', suggestedName);
  if (!name) return;
  const finalName = name.endsWith('.slinker') ? name : name + '.slinker';
  downloadFile(content, finalName);
}

export function openFilePicker(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.slinker,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
