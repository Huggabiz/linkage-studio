import type { Body, Joint, Link } from '../types';
import { distance } from './math/vec2';

/**
 * Generate internal links for rigid body constraints.
 *
 * For N joints in a body:
 * - N < 2: no links
 * - N = 2: 1 link
 * - N >= 3: 2N-3 links (minimum for 2D rigidity)
 *   Algorithm: anchor = joint[0], connect anchor to all others (N-1 links),
 *   then connect sequential pairs joint[1]-[2], [2]-[3], etc. (N-2 links).
 *
 * Links are deduplicated across bodies (same joint pair → one link).
 * IDs are deterministic: `link_{min(idA,idB)}_{max(idA,idB)}`.
 */
export function generateBodyLinks(
  bodies: Record<string, Body>,
  joints: Record<string, Joint>,
): Link[] {
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
    // Filter to joints that actually exist
    const ids = body.jointIds.filter((id) => joints[id]);
    const n = ids.length;
    if (n < 2) continue;

    if (n === 2) {
      addPair(ids[0], ids[1]);
      continue;
    }

    // N >= 3: anchor (ids[0]) to all others + sequential pairs = 2N-3
    const anchor = ids[0];
    for (let i = 1; i < n; i++) {
      addPair(anchor, ids[i]);
    }
    for (let i = 1; i < n - 1; i++) {
      addPair(ids[i], ids[i + 1]);
    }
  }

  return Array.from(linkMap.values());
}
