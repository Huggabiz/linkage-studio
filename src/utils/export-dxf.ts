/**
 * DXF Export — generates a minimal DXF R12 (AC1009) file.
 *
 * Coordinate system: 1 DXF unit = 1mm.
 * World units: 25 world units = 1cm = 10mm, scale = 1/2.5.
 *
 * Uses the simplest possible DXF structure for maximum import compatibility.
 * R12 is supported by virtually every CAD tool (AutoCAD, Onshape, FreeCAD, etc).
 */

import type { Joint, Link, Body, Outline, SliderConstraint, ColliderConstraint } from '../types';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

const SCALE = 1 / 2.5;
const JOINT_RADIUS_MM = 1.5;
const FIXED_JOINT_RADIUS_MM = 2.0;

function hexToACI(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const aci: [number, number, number, number][] = [
    [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0],
    [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255],
    [7, 255, 255, 255], [8, 128, 128, 128],
    [30, 255, 127, 0], [90, 0, 255, 0], [130, 0, 255, 255],
    [170, 0, 0, 255], [210, 255, 0, 255],
  ];
  let bestIdx = 7, bestDist = Infinity;
  for (const [idx, ar, ag, ab] of aci) {
    const dist = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2;
    if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
  }
  return bestIdx;
}

function san(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export function exportDXF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  baseBodyId: string,
  outlines: Record<string, Outline>,
  sliders: Record<string, SliderConstraint>,
  colliders: Record<string, ColliderConstraint>,
  showLinksGlobal: boolean = true,
): string {
  const out: string[] = [];
  const p = (code: number, val: string | number) => { out.push(String(code)); out.push(String(val)); };

  const bodyList = Object.values(bodies);

  // ==================== SECTION: HEADER ====================
  p(0, 'SECTION'); p(2, 'HEADER');
  p(9, '$ACADVER'); p(1, 'AC1009');
  p(9, '$INSUNITS'); p(70, 4);
  p(0, 'ENDSEC');

  // ==================== SECTION: TABLES ====================
  p(0, 'SECTION'); p(2, 'TABLES');

  // --- LTYPE table ---
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 2);

  p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0);
  p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, 0.0);

  p(0, 'LTYPE'); p(2, 'DASHED'); p(70, 0);
  p(3, 'Dashed __ __ __'); p(72, 65); p(73, 2);
  p(40, 7.5); p(49, 5.0); p(49, -2.5);

  p(0, 'ENDTAB');

  // --- LAYER table ---
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, bodyList.length + 2);

  for (const body of bodyList) {
    p(0, 'LAYER'); p(2, san(body.name)); p(70, 0);
    p(62, hexToACI(body.color)); p(6, 'CONTINUOUS');
  }
  p(0, 'LAYER'); p(2, 'Colliders'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS');
  p(0, 'LAYER'); p(2, 'Sliders'); p(70, 0); p(62, 8); p(6, 'CONTINUOUS');

  p(0, 'ENDTAB');
  p(0, 'ENDSEC');

  // ==================== SECTION: ENTITIES ====================
  p(0, 'SECTION'); p(2, 'ENTITIES');

  // --- Joints as circles ---
  for (const body of bodyList) {
    const layer = san(body.name);
    for (const jid of body.jointIds) {
      const j = joints[jid];
      if (!j || j.hidden) continue;
      const r = j.type === 'fixed' ? FIXED_JOINT_RADIUS_MM : JOINT_RADIUS_MM;
      p(0, 'CIRCLE'); p(8, layer);
      p(10, (j.position.x * SCALE).toFixed(4));
      p(20, (-j.position.y * SCALE).toFixed(4));
      p(30, '0'); p(40, r.toFixed(4));
    }
  }

  // --- Outlines as POLYLINE/VERTEX/SEQEND (R12 compatible) ---
  for (const outline of Object.values(outlines)) {
    if (outline.points.length < 2 || !outline.visible) continue;
    const body = bodies[outline.bodyId];
    if (!body) continue;
    const layer = san(body.name);
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((pt) => localToWorld(pt, transform));

    p(0, 'POLYLINE'); p(8, layer); p(66, 1); p(70, 1); // 70=1 means closed
    for (const pt of worldPts) {
      p(0, 'VERTEX'); p(8, layer);
      p(10, (pt.x * SCALE).toFixed(4));
      p(20, (-pt.y * SCALE).toFixed(4));
      p(30, '0');
    }
    p(0, 'SEQEND'); p(8, layer);
  }

  // --- Links as dashed lines (only if visible) ---
  if (showLinksGlobal) {
    for (const link of Object.values(links)) {
      const jA = joints[link.jointIds[0]];
      const jB = joints[link.jointIds[1]];
      if (!jA || !jB || jA.hidden || jB.hidden) continue;

      let owningBody: Body | null = null;
      for (const body of bodyList) {
        if (body.id === baseBodyId) continue;
        if (body.jointIds.includes(link.jointIds[0]) && body.jointIds.includes(link.jointIds[1])) {
          owningBody = body;
          break;
        }
      }
      if (!owningBody || !owningBody.showLinks) continue;

      const layer = san(owningBody.name);
      p(0, 'LINE'); p(8, layer); p(6, 'DASHED');
      p(10, (jA.position.x * SCALE).toFixed(4));
      p(20, (-jA.position.y * SCALE).toFixed(4));
      p(30, '0');
      p(11, (jB.position.x * SCALE).toFixed(4));
      p(21, (-jB.position.y * SCALE).toFixed(4));
      p(31, '0');
    }
  }

  // --- Collider barriers ---
  for (const c of Object.values(colliders)) {
    const jA = joints[c.jointIdA], jC = joints[c.jointIdC];
    if (!jA || !jC) continue;
    p(0, 'LINE'); p(8, 'Colliders'); p(6, 'DASHED');
    p(10, (jA.position.x * SCALE).toFixed(4));
    p(20, (-jA.position.y * SCALE).toFixed(4));
    p(30, '0');
    p(11, (jC.position.x * SCALE).toFixed(4));
    p(21, (-jC.position.y * SCALE).toFixed(4));
    p(31, '0');
  }

  // --- Slider rails ---
  for (const s of Object.values(sliders)) {
    const jA = joints[s.jointIdA], jC = joints[s.jointIdC];
    if (!jA || !jC) continue;
    p(0, 'LINE'); p(8, 'Sliders'); p(6, 'DASHED');
    p(10, (jA.position.x * SCALE).toFixed(4));
    p(20, (-jA.position.y * SCALE).toFixed(4));
    p(30, '0');
    p(11, (jC.position.x * SCALE).toFixed(4));
    p(21, (-jC.position.y * SCALE).toFixed(4));
    p(31, '0');
  }

  p(0, 'ENDSEC');
  p(0, 'EOF');

  return out.join('\n');
}
