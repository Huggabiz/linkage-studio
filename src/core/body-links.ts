import type { Body, Joint, Link, SliderConstraint, AngleConstraint } from '../types';
import { distance } from './math/vec2';

/**
 * Generate internal links for rigid body simulation.
 *
 * Full pairwise — every pair of joints in a body gets a distance constraint.
 * This eliminates the "springy indirect chains" problem of the old 2N-3
 * topology where some joint pairs were only indirectly connected.
 *
 * Cost is N(N-1)/2 links per body, which is negligible for typical body
 * sizes (3-8 joints).
 *
 * Links are deduplicated across bodies (same joint pair → one link).
 * IDs are deterministic: `link_{min(idA,idB)}_{max(idA,idB)}`.
 */
export function generateBodyLinks(
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
  sliders?: Record<string, SliderConstraint>,
): { links: Link[]; angleConstraints: AngleConstraint[] } {
  const linkMap = new Map<string, Link>();

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
  };
}
