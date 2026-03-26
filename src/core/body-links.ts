import type { Body, Joint, Link, SliderConstraint, AngleConstraint } from '../types';
import { distance } from './math/vec2';

/**
 * Generate internal links for rigid body simulation.
 *
 * Full pairwise — every pair of joints in a body gets a distance constraint.
 * This eliminates the "springy indirect chains" problem of the old 2N-3
 * topology where some joint pairs were only indirectly connected.
 *
 * For bodies with 3+ joints, a hidden "bracing" joint is generated to
 * guarantee triangulation. It is placed perpendicular to the longest span
 * at the midpoint, offset by half the span length. This prevents collinear
 * configurations from becoming degenerate without angle constraints.
 *
 * Links are deduplicated across bodies (same joint pair → one link).
 * IDs are deterministic: `link_{min(idA,idB)}_{max(idA,idB)}`.
 */
export function generateBodyLinks(
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  sliders?: Record<string, SliderConstraint>,
): { links: Link[]; angleConstraints: AngleConstraint[]; bracingJoints: Joint[] } {
  const linkMap = new Map<string, Link>();
  const bracingJoints: Joint[] = [];

  function addPair(idA: string, idB: string) {
    const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
    const linkId = `link_${lo}_${hi}`;
    if (linkMap.has(linkId)) return;
    const jA = joints[lo];
    const jB = joints[hi];
    if (!jA || !jB) return;
    linkMap.set(linkId, {
      id: linkId,
      jointIds: [lo, hi],
      restLength: distance(jA.position, jB.position),
      mass: 1,
    });
  }

  for (const body of Object.values(bodies)) {
    const ids = body.jointIds.filter((id) => joints[id]);
    const n = ids.length;
    if (n < 2) continue;

    // Full pairwise links: every pair of joints in the body
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        addPair(ids[i], ids[j]);
      }
    }

    // For 3+ joints, add a hidden bracing joint to ensure triangulation.
    // Find the two furthest-apart joints, place the brace perpendicular
    // to their midpoint, offset by half the span length.
    if (n >= 3) {
      let maxDist = 0;
      let farA = ids[0], farB = ids[1];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = distance(joints[ids[i]].position, joints[ids[j]].position);
          if (d > maxDist) {
            maxDist = d;
            farA = ids[i];
            farB = ids[j];
          }
        }
      }

      if (maxDist > 1e-6) {
        const pA = joints[farA].position;
        const pB = joints[farB].position;
        const midX = (pA.x + pB.x) / 2;
        const midY = (pA.y + pB.y) / 2;
        // Perpendicular direction (rotate span by 90°), offset by half span length
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const perpX = -dy; // perpendicular
        const perpY = dx;
        // Normalize and scale to half span length
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
        const offset = maxDist / 2;
        const braceX = midX + (perpX / perpLen) * offset;
        const braceY = midY + (perpY / perpLen) * offset;

        const braceId = `__brace_${body.id}`;
        const braceJoint: Joint = {
          id: braceId,
          type: 'revolute',
          position: { x: braceX, y: braceY },
          connectedLinkIds: [],
          hidden: true,
        };

        // Add to joints record so links can reference it
        joints[braceId] = braceJoint;
        bracingJoints.push(braceJoint);

        // Link the brace to every joint in the body
        for (const jid of ids) {
          addPair(braceId, jid);
        }
      }
    }
  }

  // Add A-C distance constraints from slider joints
  if (sliders) {
    for (const slider of Object.values(sliders)) {
      addPair(slider.jointIdA, slider.jointIdC);
    }
  }

  return {
    links: Array.from(linkMap.values()),
    angleConstraints: [],
    bracingJoints,
  };
}
