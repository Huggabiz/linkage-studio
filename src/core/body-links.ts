import type { Body, Joint, Link, SliderConstraint, AngleConstraint } from '../types';
import { distance } from './math/vec2';

/**
 * Generate internal links and angle constraints for rigid body simulation.
 *
 * Links: Full pairwise — every pair of joints in a body gets a distance
 * constraint. This eliminates the "springy indirect chains" problem of the
 * old 2N-3 topology. Cost is N(N-1)/2 links per body, which is negligible
 * for typical body sizes (3-8 joints).
 *
 * Angle constraints: For any triplet of joints in a body that are
 * approximately collinear (or exactly collinear), add an angle constraint
 * at the middle joint. Distance constraints alone become degenerate for
 * collinear sets (the Jacobian has a null mode along the line), so the
 * angle constraint provides the missing perpendicular stiffness.
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
  const angleMap = new Map<string, AngleConstraint>();

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

  // Collinearity threshold: cross product / (len1 * len2) < threshold
  // ~0.05 ≈ 3° off-line
  const COLLINEAR_THRESHOLD = 0.05;

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

    // Angle constraints for collinear (or near-collinear) triplets.
    // For each joint B, check if it's collinear with any pair (A, C).
    if (n >= 3) {
      for (let bi = 0; bi < n; bi++) {
        const jB = joints[ids[bi]];
        if (!jB) continue;
        for (let ai = 0; ai < n; ai++) {
          if (ai === bi) continue;
          const jA = joints[ids[ai]];
          if (!jA) continue;
          for (let ci = ai + 1; ci < n; ci++) {
            if (ci === bi) continue;
            const jC = joints[ids[ci]];
            if (!jC) continue;

            // Compute cross product (B-A) × (C-A) normalized by lengths
            const bax = jB.position.x - jA.position.x;
            const bay = jB.position.y - jA.position.y;
            const cax = jC.position.x - jA.position.x;
            const cay = jC.position.y - jA.position.y;
            const cross = Math.abs(bax * cay - bay * cax);
            const lenBA = Math.sqrt(bax * bax + bay * bay);
            const lenCA = Math.sqrt(cax * cax + cay * cay);
            if (lenBA < 1e-6 || lenCA < 1e-6) continue;

            const sinAngle = cross / (lenBA * lenCA);
            if (sinAngle < COLLINEAR_THRESHOLD) {
              // Also check that B is between A and C (not outside the segment)
              const dot = bax * cax + bay * cay;
              const tProj = dot / (lenCA * lenCA);
              // B should be roughly between A and C (0 < t < 1) to be a "middle" joint
              if (tProj > -0.1 && tProj < 1.1) {
                // Compute rest angle at B
                const abx = jA.position.x - jB.position.x;
                const aby = jA.position.y - jB.position.y;
                const cbx = jC.position.x - jB.position.x;
                const cby = jC.position.y - jB.position.y;
                const restAngle = Math.atan2(abx * cby - aby * cbx, abx * cbx + aby * cby);

                // Deduplicate: use sorted A,C ids + B as key
                const [sA, sC] = ids[ai] < ids[ci] ? [ids[ai], ids[ci]] : [ids[ci], ids[ai]];
                const angleId = `angle_${sA}_${ids[bi]}_${sC}`;
                if (!angleMap.has(angleId)) {
                  angleMap.set(angleId, {
                    id: angleId,
                    jointIdA: ids[ai],
                    jointIdB: ids[bi],
                    jointIdC: ids[ci],
                    restAngle,
                  });
                }
              }
            }
          }
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
    angleConstraints: Array.from(angleMap.values()),
  };
}
