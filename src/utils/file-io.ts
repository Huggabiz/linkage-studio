import type { Joint, Link, Body, Outline, Vec2 } from '../types';

/** Serializable format for a linkage file (.slinker) */
interface SlinkerFile {
  version: string;
  joints: Record<string, { id: string; type: string; position: Vec2; connectedLinkIds: string[] }>;
  links: Record<string, { id: string; jointIds: [string, string]; restLength: number; mass: number }>;
  bodies: Record<string, { id: string; name: string; color: string; jointIds: string[]; useOutlineCOM: boolean }>;
  baseBodyId: string;
  outlines: Record<string, { id: string; bodyId: string; points: Vec2[] }>;
}

export function serializeMechanism(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  baseBodyId: string,
  outlines: Record<string, Outline>,
): string {
  const data: SlinkerFile = {
    version: '0.2.0',
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
    data.outlines[id] = { id: o.id, bodyId: o.bodyId, points: o.points.map(p => ({ x: p.x, y: p.y })) };
  }

  return JSON.stringify(data, null, 2);
}

export function deserializeMechanism(json: string): {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
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
        points: o.points.map(p => ({ x: p.x, y: p.y })),
      };
    }

    return { joints, links, bodies, baseBodyId: data.baseBodyId, outlines };
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
