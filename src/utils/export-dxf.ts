/**
 * DXF Export — generates a DXF R12 (AC1009) text file from the mechanism state.
 *
 * Coordinate system: 1 DXF unit = 1mm.
 * World units are converted: 25 world units = 1cm = 10mm, so scale = 1/2.5.
 *
 * Structure:
 * - One layer per body (named after the body, colored to match)
 * - Joints → CIRCLE entities on each body layer they belong to
 * - Outlines → LWPOLYLINE (closed) on the body layer
 * - Links → LINE entities (dashed) on the owning non-base body layer
 * - Collider barriers → LINE entities (dashed) on a "Colliders" layer
 * - Slider rails → LINE entities (dashed) on a "Sliders" layer
 */

import type { Joint, Link, Body, Outline, SliderConstraint, ColliderConstraint, Vec2 } from '../types';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

const SCALE = 1 / 2.5; // world units to mm
const JOINT_RADIUS_MM = 1.5;
const FIXED_JOINT_RADIUS_MM = 2.0;

/** Map hex color to nearest AutoCAD Color Index (ACI). */
function hexToACI(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Common ACI colors (index: [r,g,b])
  const aci: [number, number, number, number][] = [
    [1, 255, 0, 0],     // red
    [2, 255, 255, 0],   // yellow
    [3, 0, 255, 0],     // green
    [4, 0, 255, 255],   // cyan
    [5, 0, 0, 255],     // blue
    [6, 255, 0, 255],   // magenta
    [7, 255, 255, 255], // white
    [8, 128, 128, 128], // grey
    [10, 255, 0, 0],
    [30, 255, 127, 0],  // orange
    [40, 255, 191, 0],
    [50, 255, 255, 0],  // yellow
    [70, 127, 255, 0],
    [90, 0, 255, 0],    // green
    [110, 0, 255, 127],
    [130, 0, 255, 255], // cyan
    [150, 0, 127, 255],
    [170, 0, 0, 255],   // blue
    [190, 127, 0, 255],
    [210, 255, 0, 255], // magenta
    [230, 255, 0, 127],
  ];

  let bestIdx = 7;
  let bestDist = Infinity;
  for (const [idx, ar, ag, ab] of aci) {
    const dist = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function sanitizeLayerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_');
}

export function exportDXF(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  bodies: Record<string, Body>,
  baseBodyId: string,
  outlines: Record<string, Outline>,
  sliders: Record<string, SliderConstraint>,
  colliders: Record<string, ColliderConstraint>,
): string {
  const lines: string[] = [];

  function w(...args: string[]) {
    for (const s of args) lines.push(s);
  }

  // Helper: write a group code + value pair
  function g(code: number, value: string | number) {
    w(String(code), String(value));
  }

  // --- HEADER ---
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 4); // 4 = millimeters
  g(0, 'ENDSEC');

  // --- TABLES (layers + linetypes) ---
  g(0, 'SECTION');
  g(2, 'TABLES');

  // Linetype table
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 3);
  // Continuous
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, 0.0);
  // Dashed
  g(0, 'LTYPE');
  g(2, 'DASHED');
  g(70, 0);
  g(3, 'Dashed __ __ __');
  g(72, 65);
  g(73, 2);
  g(40, 3.0);
  g(49, 2.0);
  g(49, -1.0);
  g(0, 'ENDTAB');

  // Layer table
  const bodyList = Object.values(bodies);
  const layerCount = bodyList.length + 2; // +2 for Colliders and Sliders
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, layerCount);

  for (const body of bodyList) {
    g(0, 'LAYER');
    g(2, sanitizeLayerName(body.name));
    g(70, 0);
    g(62, hexToACI(body.color));
    g(6, 'CONTINUOUS');
  }

  g(0, 'LAYER');
  g(2, 'Colliders');
  g(70, 0);
  g(62, 7); // white
  g(6, 'DASHED');

  g(0, 'LAYER');
  g(2, 'Sliders');
  g(70, 0);
  g(62, 8); // grey
  g(6, 'DASHED');

  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  // --- ENTITIES ---
  g(0, 'SECTION');
  g(2, 'ENTITIES');

  // Joints as circles on each body layer they belong to
  for (const body of bodyList) {
    const layerName = sanitizeLayerName(body.name);
    for (const jid of body.jointIds) {
      const joint = joints[jid];
      if (!joint || joint.hidden) continue;
      const x = joint.position.x * SCALE;
      const y = -joint.position.y * SCALE; // flip Y (DXF Y-up, canvas Y-down)
      const radius = joint.type === 'fixed' ? FIXED_JOINT_RADIUS_MM : JOINT_RADIUS_MM;

      g(0, 'CIRCLE');
      g(8, layerName);
      g(10, x.toFixed(4));
      g(20, y.toFixed(4));
      g(30, 0);
      g(40, radius.toFixed(4));
    }
  }

  // Outlines as closed polylines on body layer
  for (const outline of Object.values(outlines)) {
    if (outline.points.length < 2 || !outline.visible) continue;
    const body = bodies[outline.bodyId];
    if (!body) continue;
    const layerName = sanitizeLayerName(body.name);
    const transform = computeBodyTransform(body, joints);
    const worldPts = outline.points.map((p) => localToWorld(p, transform));

    g(0, 'LWPOLYLINE');
    g(8, layerName);
    g(70, 1); // closed
    g(90, worldPts.length);
    for (const pt of worldPts) {
      g(10, (pt.x * SCALE).toFixed(4));
      g(20, (-pt.y * SCALE).toFixed(4));
    }
  }

  // Links as dashed lines on owning non-base body layer
  for (const link of Object.values(links)) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB || jA.hidden || jB.hidden) continue;

    // Find non-base body that owns both endpoints
    let owningBody: Body | null = null;
    for (const body of bodyList) {
      if (body.id === baseBodyId) continue;
      if (body.jointIds.includes(link.jointIds[0]) && body.jointIds.includes(link.jointIds[1])) {
        owningBody = body;
        break;
      }
    }
    if (!owningBody) continue; // skip base-only links

    const layerName = sanitizeLayerName(owningBody.name);
    g(0, 'LINE');
    g(8, layerName);
    g(6, 'DASHED');
    g(10, (jA.position.x * SCALE).toFixed(4));
    g(20, (-jA.position.y * SCALE).toFixed(4));
    g(30, 0);
    g(11, (jB.position.x * SCALE).toFixed(4));
    g(21, (-jB.position.y * SCALE).toFixed(4));
    g(31, 0);
  }

  // Collider barriers
  for (const collider of Object.values(colliders)) {
    const jA = joints[collider.jointIdA];
    const jC = joints[collider.jointIdC];
    if (!jA || !jC) continue;

    g(0, 'LINE');
    g(8, 'Colliders');
    g(6, 'DASHED');
    g(10, (jA.position.x * SCALE).toFixed(4));
    g(20, (-jA.position.y * SCALE).toFixed(4));
    g(30, 0);
    g(11, (jC.position.x * SCALE).toFixed(4));
    g(21, (-jC.position.y * SCALE).toFixed(4));
    g(31, 0);
  }

  // Slider rails
  for (const slider of Object.values(sliders)) {
    const jA = joints[slider.jointIdA];
    const jC = joints[slider.jointIdC];
    if (!jA || !jC) continue;

    g(0, 'LINE');
    g(8, 'Sliders');
    g(6, 'DASHED');
    g(10, (jA.position.x * SCALE).toFixed(4));
    g(20, (-jA.position.y * SCALE).toFixed(4));
    g(30, 0);
    g(11, (jC.position.x * SCALE).toFixed(4));
    g(21, (-jC.position.y * SCALE).toFixed(4));
    g(31, 0);
  }

  g(0, 'ENDSEC');
  g(0, 'EOF');

  return lines.join('\n');
}
