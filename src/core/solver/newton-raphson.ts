import type { Joint, Link, SliderConstraint, AngleConstraint, Vec2, SolverResult, ForceVector } from '../../types';
import { distanceConstraint, angleDriverConstraint } from './constraints';
import { createMatrix, solveLU } from '../math/linalg';
import { SOLVER_MAX_ITERATIONS, SOLVER_TOLERANCE, SOLVER_DAMPING } from '../../utils/constants';

interface DriverInfo {
  fixedJointId: string;
  drivenJointId: string;
  targetAngle: number;
}

function solveSystem(J: number[][], phi: number[], m: number, n: number): number[] | null {
  if (m === n) {
    const negPhi = phi.map((v) => -v);
    const Jcopy = J.map((r) => [...r]);
    if (!solveLU(Jcopy, negPhi)) return null;
    return negPhi;
  }
  const JtJ = createMatrix(n, n);
  const Jtphi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) sum += J[k][i] * J[k][j];
      JtJ[i][j] = sum;
    }
    for (let k = 0; k < m; k++) Jtphi[i] -= J[k][i] * phi[k];
  }
  if (!solveLU(JtJ, Jtphi)) return null;
  return Jtphi;
}

function projectConstraints(
  q: number[], joints: Record<string, Joint>, links: Record<string, Link>,
  jointIndex: Map<string, number>, freeJoints: Joint[], n: number,
): { residual: number; iterations: number; converged: boolean } {
  const linkArray = Object.values(links);
  const numConstraints = linkArray.length;
  if (numConstraints === 0) return { residual: 0, iterations: 0, converged: true };

  let residual = Infinity;
  let iter = 0;

  for (; iter < SOLVER_MAX_ITERATIONS; iter++) {
    const phi = new Array<number>(numConstraints).fill(0);
    const J = createMatrix(numConstraints, n);
    let row = 0;
    for (const link of linkArray) {
      const idxI = jointIndex.get(link.jointIds[0]);
      const idxJ = jointIndex.get(link.jointIds[1]);
      const ji = joints[link.jointIds[0]]; const jj = joints[link.jointIds[1]];
      if (!ji || !jj) { row++; continue; }
      const pi: Vec2 = idxI !== undefined ? { x: q[idxI], y: q[idxI + 1] } : ji.position;
      const pj: Vec2 = idxJ !== undefined ? { x: q[idxJ], y: q[idxJ + 1] } : jj.position;
      const c = distanceConstraint(pi, pj, link.restLength);
      phi[row] = c.residual;
      if (idxI !== undefined) { J[row][idxI] = c.dxi; J[row][idxI + 1] = c.dyi; }
      if (idxJ !== undefined) { J[row][idxJ] = c.dxj; J[row][idxJ + 1] = c.dyj; }
      row++;
    }
    residual = 0;
    for (let i = 0; i < numConstraints; i++) residual += phi[i] * phi[i];
    residual = Math.sqrt(residual);
    if (residual < SOLVER_TOLERANCE) break;
    const dq = solveSystem(J, phi, numConstraints, n);
    if (!dq) break;
    for (let i = 0; i < n; i++) q[i] += SOLVER_DAMPING * dq[i];
  }
  return { residual, iterations: iter, converged: residual < SOLVER_TOLERANCE };
}

/**
 * Kinematic solver (create mode motor drivers).
 */
export function solve(
  joints: Record<string, Joint>, links: Record<string, Link>, driver: DriverInfo | null,
  fixedJointIds?: Set<string>,
): SolverResult {
  const freeJoints: Joint[] = [];
  const jointIndex = new Map<string, number>();
  for (const joint of Object.values(joints)) {
    const isFixed = fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed';
    if (isFixed) continue;
    jointIndex.set(joint.id, freeJoints.length * 2);
    freeJoints.push(joint);
  }
  const n = freeJoints.length * 2;
  if (n === 0) return { converged: true, iterations: 0, residual: 0, positions: new Map(), forceVectors: [] };

  const q = new Array<number>(n);
  for (let i = 0; i < freeJoints.length; i++) {
    q[i * 2] = freeJoints[i].position.x; q[i * 2 + 1] = freeJoints[i].position.y;
  }

  const linkArray = Object.values(links);
  const numConstraints = linkArray.length + (driver ? 1 : 0);
  let residual = Infinity; let iter = 0;

  for (; iter < SOLVER_MAX_ITERATIONS; iter++) {
    const phi = new Array<number>(numConstraints).fill(0);
    const J = createMatrix(numConstraints, n);
    let row = 0;
    for (const link of linkArray) {
      const idxI = jointIndex.get(link.jointIds[0]); const idxJ = jointIndex.get(link.jointIds[1]);
      const ji = joints[link.jointIds[0]]; const jj = joints[link.jointIds[1]];
      if (!ji || !jj) { row++; continue; }
      const pi: Vec2 = idxI !== undefined ? { x: q[idxI], y: q[idxI + 1] } : ji.position;
      const pj: Vec2 = idxJ !== undefined ? { x: q[idxJ], y: q[idxJ + 1] } : jj.position;
      const c = distanceConstraint(pi, pj, link.restLength);
      phi[row] = c.residual;
      if (idxI !== undefined) { J[row][idxI] = c.dxi; J[row][idxI + 1] = c.dyi; }
      if (idxJ !== undefined) { J[row][idxJ] = c.dxj; J[row][idxJ + 1] = c.dyj; }
      row++;
    }
    if (driver) {
      const fj = joints[driver.fixedJointId]; const di = jointIndex.get(driver.drivenJointId);
      if (fj && di !== undefined) {
        const pd: Vec2 = { x: q[di], y: q[di + 1] };
        const c = angleDriverConstraint(fj.position, pd, driver.targetAngle);
        phi[row] = c.residual; J[row][di] = c.dxDriven; J[row][di + 1] = c.dyDriven;
      }
      row++;
    }
    residual = 0;
    for (let i = 0; i < numConstraints; i++) residual += phi[i] * phi[i];
    residual = Math.sqrt(residual);
    if (residual < SOLVER_TOLERANCE) break;
    const dq = solveSystem(J, phi, numConstraints, n);
    if (!dq) break;
    for (let i = 0; i < n; i++) q[i] += SOLVER_DAMPING * dq[i];
  }

  const positions = new Map<string, Vec2>();
  for (let i = 0; i < freeJoints.length; i++) positions.set(freeJoints[i].id, { x: q[i * 2], y: q[i * 2 + 1] });
  for (const j of Object.values(joints)) if (j.type === 'fixed') positions.set(j.id, j.position);
  return { converged: residual < SOLVER_TOLERANCE, iterations: iter, residual, positions, forceVectors: [] };
}

// --- Position-Based Dynamics simulation ---

export interface ForceInfo { linkId: string; grabT: number; target: Vec2; }
export interface GravityInfo { enabled: boolean; strength: number; }

// Velocity-based state for semi-implicit Euler (replaces Verlet prev-positions)
const velocities = new Map<string, Vec2>();

export function resetVelocities() {
  velocities.clear();
}

const PULL_STRENGTH = 6;
const NUM_SUBSTEPS = 10;
const CONSTRAINT_PASSES = 6;

/**
 * Physics simulation using substep PBD with explicit velocity tracking.
 *
 * Uses multiple substeps per frame to minimise constraint projection energy loss.
 * Damping is applied as velocity scaling per substep, time-based so it's
 * frame-rate independent.
 *
 * damping parameter: 0.0 = maximum damping, 1.0 = no damping.
 * Internally converted to a per-second retention factor.
 */
export function solveWithForce(
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  gravity: GravityInfo,
  pullForce: ForceInfo | null,
  damping: number,
  dragMultiplier: number,
  dragDamping: number,
  dt: number,
  fixedJointIds?: Set<string>,
  jointGravityWeights?: Map<string, number>,
  sliders?: Record<string, SliderConstraint>,
  angleConstraints?: AngleConstraint[],
): SolverResult {
  const freeJoints: Joint[] = [];
  const jointIndex = new Map<string, number>();
  const forceVectors: ForceVector[] = [];

  for (const joint of Object.values(joints)) {
    const isFixed = fixedJointIds ? fixedJointIds.has(joint.id) : joint.type === 'fixed';
    if (isFixed) continue;
    jointIndex.set(joint.id, freeJoints.length * 2);
    freeJoints.push(joint);
  }

  const n = freeJoints.length * 2;
  if (n === 0) {
    return { converged: true, iterations: 0, residual: 0, positions: new Map(), forceVectors };
  }

  const linkArray = Object.values(links);

  // --- Precompute constant gravity acceleration per joint ---
  // jointGravityWeights: per-joint multiplier for gravity. Default (no weights) = equal distribution.
  // Custom weights allow shifting effective COM (e.g. from outline center of area).
  const gravAccX = new Float64Array(freeJoints.length);
  const gravAccY = new Float64Array(freeJoints.length);

  if (gravity.enabled) {
    const g = gravity.strength;
    if (jointGravityWeights && jointGravityWeights.size > 0) {
      // Use provided weights
      for (const fj of freeJoints) {
        const idx = jointIndex.get(fj.id)!;
        const weight = jointGravityWeights.get(fj.id) ?? 1;
        gravAccY[idx / 2] += g * weight;
      }
    } else {
      // Default: per-link distribution (each endpoint gets g)
      for (const link of linkArray) {
        const jA = joints[link.jointIds[0]];
        const jB = joints[link.jointIds[1]];
        if (!jA || !jB) continue;
        const idxA = jointIndex.get(jA.id);
        const idxB = jointIndex.get(jB.id);
        if (idxA !== undefined) gravAccY[idxA / 2] += g;
        if (idxB !== undefined) gravAccY[idxB / 2] += g;
      }
    }
  }

  // --- Drag link info (precompute which link is being dragged) ---
  let dragLink: Link | null = null;
  let dragIdxA: number | undefined;
  let dragIdxB: number | undefined;
  let dragFixedPosA: Vec2 | null = null;
  let dragFixedPosB: Vec2 | null = null;
  if (pullForce) {
    for (const link of linkArray) {
      if (link.id === pullForce.linkId) {
        dragLink = link;
        const jA = joints[link.jointIds[0]];
        const jB = joints[link.jointIds[1]];
        dragIdxA = jointIndex.get(jA?.id ?? '');
        dragIdxB = jointIndex.get(jB?.id ?? '');
        if (dragIdxA === undefined && jA) dragFixedPosA = jA.position;
        if (dragIdxB === undefined && jB) dragFixedPosB = jB.position;
        break;
      }
    }
  }

  // --- Current positions into working array ---
  const q = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < freeJoints.length; i++) {
    const joint = freeJoints[i];
    q[i * 2] = joint.position.x;
    q[i * 2 + 1] = joint.position.y;
    const vel = velocities.get(joint.id);
    if (vel) { v[i * 2] = vel.x; v[i * 2 + 1] = vel.y; }
  }

  // --- Damping factor per substep (time-based) ---
  const subDt = dt / NUM_SUBSTEPS;
  const retentionPerSecond = damping < 0.001 ? 0.001 : damping;
  const dampPerSubstep = Math.pow(retentionPerSecond, subDt);
  const effectiveStrength = PULL_STRENGTH * dragMultiplier;

  // --- Substep loop ---
  for (let sub = 0; sub < NUM_SUBSTEPS; sub++) {
    // 1. Compute per-substep acceleration: constant gravity + position-dependent drag
    for (let i = 0; i < freeJoints.length; i++) {
      let axi = gravAccX[i];
      let ayi = gravAccY[i];

      // Critically damped spring drag: F = k * displacement - c * velocity
      // c = 2 * sqrt(k) * dampingRatio gives critical damping at ratio=1
      if (pullForce && dragLink) {
        const t = pullForce.grabT;
        const ax1 = dragIdxA !== undefined ? q[dragIdxA] : dragFixedPosA!.x;
        const ay1 = dragIdxA !== undefined ? q[dragIdxA + 1] : dragFixedPosA!.y;
        const bx1 = dragIdxB !== undefined ? q[dragIdxB] : dragFixedPosB!.x;
        const by1 = dragIdxB !== undefined ? q[dragIdxB + 1] : dragFixedPosB!.y;
        const grabX = ax1 + (bx1 - ax1) * t;
        const grabY = ay1 + (by1 - ay1) * t;

        // Spring force (proportional to displacement)
        const springFx = (pullForce.target.x - grabX) * effectiveStrength;
        const springFy = (pullForce.target.y - grabY) * effectiveStrength;

        // Velocity at grab point (interpolated from joint velocities)
        let grabVx = 0, grabVy = 0;
        if (dragIdxA !== undefined) { grabVx += v[dragIdxA] * (1 - t); grabVy += v[dragIdxA + 1] * (1 - t); }
        if (dragIdxB !== undefined) { grabVx += v[dragIdxB] * t; grabVy += v[dragIdxB + 1] * t; }

        // Damping force (proportional to velocity, scaled by sqrt(k) for critical damping)
        // dragDamping slider: 0 = undamped, 0.5 = critically damped, 1.0 = overdamped
        const dampCoeff = 2 * Math.sqrt(effectiveStrength) * (dragDamping * 2);
        const dampFx = -grabVx * dampCoeff;
        const dampFy = -grabVy * dampCoeff;

        const dax = springFx + dampFx;
        const day = springFy + dampFy;

        const idx2 = i * 2;
        if (dragIdxA !== undefined && dragIdxA === idx2) {
          axi += dax * (1 - t);
          ayi += day * (1 - t);
        }
        if (dragIdxB !== undefined && dragIdxB === idx2) {
          axi += dax * t;
          ayi += day * t;
        }
      }

      v[i * 2] += axi * subDt;
      v[i * 2 + 1] += ayi * subDt;
    }

    // 2. Predict position
    const predicted = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      predicted[i] = q[i] + v[i] * subDt;
    }

    // 3. Project distance constraints + slider constraints
    const sliderArray = sliders ? Object.values(sliders) : [];
      const angleArray = angleConstraints || [];
    for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
      for (const link of linkArray) {
        const idxI = jointIndex.get(link.jointIds[0]);
        const idxJ = jointIndex.get(link.jointIds[1]);
        const ji = joints[link.jointIds[0]];
        const jj = joints[link.jointIds[1]];
        if (!ji || !jj) continue;

        const x1 = idxI !== undefined ? predicted[idxI] : ji.position.x;
        const y1 = idxI !== undefined ? predicted[idxI + 1] : ji.position.y;
        const x2 = idxJ !== undefined ? predicted[idxJ] : jj.position.x;
        const y2 = idxJ !== undefined ? predicted[idxJ + 1] : jj.position.y;

        const ddx = x2 - x1;
        const ddy = y2 - y1;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < 1e-8) continue;

        const diff = (dist - link.restLength) / dist;
        const isFreeI = idxI !== undefined;
        const isFreeJ = idxJ !== undefined;
        const w = (isFreeI ? 1 : 0) + (isFreeJ ? 1 : 0);
        if (w === 0) continue;

        const cx = ddx * diff / w;
        const cy = ddy * diff / w;
        if (isFreeI) { predicted[idxI!] += cx; predicted[idxI! + 1] += cy; }
        if (isFreeJ) { predicted[idxJ!] -= cx; predicted[idxJ! + 1] -= cy; }
      }

      // Slider constraints: B must lie on segment AC (between A and C).
      // B acts as a sliding pivot — the body with A&C can both slide along
      // the rail axis AND rotate around B. The perpendicular correction uses
      // lever-arm weighting so A and C get different corrections based on
      // their distance from B, naturally producing torque/rotation.
      for (const slider of sliderArray) {
        const idxA = jointIndex.get(slider.jointIdA);
        const idxB = jointIndex.get(slider.jointIdB);
        const idxC = jointIndex.get(slider.jointIdC);
        const jA = joints[slider.jointIdA];
        const jB = joints[slider.jointIdB];
        const jC = joints[slider.jointIdC];
        if (!jA || !jB || !jC) continue;

        const freeA = idxA !== undefined;
        const freeB = idxB !== undefined;
        const freeC = idxC !== undefined;

        // Current predicted positions
        let ax = freeA ? predicted[idxA!] : jA.position.x;
        let ay = freeA ? predicted[idxA! + 1] : jA.position.y;
        let bx = freeB ? predicted[idxB!] : jB.position.x;
        let by = freeB ? predicted[idxB! + 1] : jB.position.y;
        let cx2 = freeC ? predicted[idxC!] : jC.position.x;
        let cy2 = freeC ? predicted[idxC! + 1] : jC.position.y;

        // Direction along AC
        let acx = cx2 - ax;
        let acy = cy2 - ay;
        let acLenSq = acx * acx + acy * acy;
        if (acLenSq < 1e-8) continue;
        let acLen = Math.sqrt(acLenSq);

        // Unit vectors: along AC and perpendicular
        let ux = acx / acLen;
        let uy = acy / acLen;
        let perpX = -uy;
        let perpY = ux;

        // B's position relative to A in (along, perp) coordinates
        let abx = bx - ax;
        let aby = by - ay;
        let perpDist = abx * perpX + aby * perpY;
        let alongDist = abx * ux + aby * uy;

        // --- Sub-constraint 1: Perpendicular correction (rotation-aware) ---
        //
        // B is at parameter t along AC. To make line AC pass through B with
        // minimum energy, we weight A and C's perpendicular corrections by
        // their lever arm from B:
        //   A moves by d*(1-t) / ((1-t)² + t²)  in perp direction
        //   C moves by d*t     / ((1-t)² + t²)  in perp direction
        // This naturally produces rotation around B:
        //   - t≈0.5 (B centered): equal correction → pure translation
        //   - t≈0   (B near A):   A moves a lot, C barely → rotation around A
        //   - t≈1   (B near C):   C moves a lot, A barely → rotation around C
        if (Math.abs(perpDist) > 1e-10) {
          const hasBSide = freeB;
          const hasACSide = freeA || freeC;
          if (hasBSide || hasACSide) {
            // Split between B-side and AC-side
            const bFrac = hasBSide ? (hasACSide ? 0.5 : 1.0) : 0;
            const acTotalFrac = hasACSide ? (hasBSide ? 0.5 : 1.0) : 0;

            // B moves toward line
            if (freeB) {
              bx -= perpX * perpDist * bFrac;
              by -= perpY * perpDist * bFrac;
              predicted[idxB!] = bx;
              predicted[idxB! + 1] = by;
            }

            // A&C: lever-arm weighted perpendicular correction
            if (hasACSide && acTotalFrac > 0) {
              // Clamp t to [0,1] for lever arm computation
              const tClamped = Math.max(0, Math.min(1, alongDist / acLen));
              const wA = 1 - tClamped; // A's lever weight (large when B near C)
              const wC = tClamped;     // C's lever weight (large when B near A)
              const denom = wA * wA + wC * wC;
              // Fallback to equal weights if B is at a degenerate position
              const corrA = denom > 1e-10 ? acTotalFrac * perpDist * wA / denom : acTotalFrac * perpDist * 0.5;
              const corrC = denom > 1e-10 ? acTotalFrac * perpDist * wC / denom : acTotalFrac * perpDist * 0.5;

              if (freeA) {
                ax += perpX * corrA;
                ay += perpY * corrA;
                predicted[idxA!] = ax;
                predicted[idxA! + 1] = ay;
              }
              if (freeC) {
                cx2 += perpX * corrC;
                cy2 += perpY * corrC;
                predicted[idxC!] = cx2;
                predicted[idxC! + 1] = cy2;
              }
            }
          }
        }

        // --- Sub-constraint 2: Along-axis clamping (B between A and C) ---
        // Recompute AC direction after perpendicular correction
        acx = cx2 - ax;
        acy = cy2 - ay;
        acLenSq = acx * acx + acy * acy;
        if (acLenSq < 1e-8) continue;
        acLen = Math.sqrt(acLenSq);
        ux = acx / acLen;
        uy = acy / acLen;

        abx = bx - ax;
        aby = by - ay;
        const tCorrected = (abx * ux + aby * uy) / acLen;

        if (tCorrected < 0) {
          // B is before A — slide entire segment so B ends up at A
          const overshoot = -tCorrected * acLen;
          if (freeB && (freeA || freeC)) {
            if (freeB) { predicted[idxB!] += ux * overshoot * 0.5; predicted[idxB! + 1] += uy * overshoot * 0.5; }
            if (freeA) { predicted[idxA!] -= ux * overshoot * 0.5; predicted[idxA! + 1] -= uy * overshoot * 0.5; }
            if (freeC) { predicted[idxC!] -= ux * overshoot * 0.5; predicted[idxC! + 1] -= uy * overshoot * 0.5; }
          } else if (freeB) {
            predicted[idxB!] += ux * overshoot;
            predicted[idxB! + 1] += uy * overshoot;
          } else if (freeA || freeC) {
            if (freeA) { predicted[idxA!] -= ux * overshoot; predicted[idxA! + 1] -= uy * overshoot; }
            if (freeC) { predicted[idxC!] -= ux * overshoot; predicted[idxC! + 1] -= uy * overshoot; }
          }
        } else if (tCorrected > 1) {
          // B is past C — slide entire segment so B ends up at C
          const overshoot = (tCorrected - 1) * acLen;
          if (freeB && (freeA || freeC)) {
            if (freeB) { predicted[idxB!] -= ux * overshoot * 0.5; predicted[idxB! + 1] -= uy * overshoot * 0.5; }
            if (freeA) { predicted[idxA!] += ux * overshoot * 0.5; predicted[idxA! + 1] += uy * overshoot * 0.5; }
            if (freeC) { predicted[idxC!] += ux * overshoot * 0.5; predicted[idxC! + 1] += uy * overshoot * 0.5; }
          } else if (freeB) {
            predicted[idxB!] -= ux * overshoot;
            predicted[idxB! + 1] -= uy * overshoot;
          } else if (freeA || freeC) {
            if (freeA) { predicted[idxA!] += ux * overshoot; predicted[idxA! + 1] += uy * overshoot; }
            if (freeC) { predicted[idxC!] += ux * overshoot; predicted[idxC! + 1] += uy * overshoot; }
          }
        }
      }

      // Angle constraints: maintain angle at joint B between A and C.
      // Uses gradient-based PBD projection. Essential for collinear joints
      // where distance constraints alone are degenerate.
      if (angleArray.length > 0) {
        for (const ac of angleArray) {
          const idxA = jointIndex.get(ac.jointIdA);
          const idxB = jointIndex.get(ac.jointIdB);
          const idxC = jointIndex.get(ac.jointIdC);
          const jA = joints[ac.jointIdA];
          const jB = joints[ac.jointIdB];
          const jC = joints[ac.jointIdC];
          if (!jA || !jB || !jC) continue;

          const freeA = idxA !== undefined;
          const freeB = idxB !== undefined;
          const freeC = idxC !== undefined;
          if (!freeA && !freeB && !freeC) continue;

          // Current positions
          const ax2 = freeA ? predicted[idxA!] : jA.position.x;
          const ay2 = freeA ? predicted[idxA! + 1] : jA.position.y;
          const bx2 = freeB ? predicted[idxB!] : jB.position.x;
          const by2 = freeB ? predicted[idxB! + 1] : jB.position.y;
          const cx3 = freeC ? predicted[idxC!] : jC.position.x;
          const cy3 = freeC ? predicted[idxC! + 1] : jC.position.y;

          // Vectors from B (vertex) to A and C
          const d1x = ax2 - bx2, d1y = ay2 - by2; // B→A
          const d2x = cx3 - bx2, d2y = cy3 - by2; // B→C

          const len1sq = d1x * d1x + d1y * d1y;
          const len2sq = d2x * d2x + d2y * d2y;
          if (len1sq < 1e-10 || len2sq < 1e-10) continue;

          // Current angle at B
          const cross = d1x * d2y - d1y * d2x;
          const dotAC = d1x * d2x + d1y * d2y;
          const currentAngle = Math.atan2(cross, dotAC);

          // Angle error
          let dAngle = currentAngle - ac.restAngle;
          // Wrap to [-π, π]
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI;

          if (Math.abs(dAngle) < 1e-10) continue;

          // Gradients: ∂θ/∂pA = perp(d1) / |d1|², ∂θ/∂pC = -perp(d2) / |d2|²
          // perp(d1) = (-d1y, d1x)
          const gAx = -d1y / len1sq, gAy = d1x / len1sq;
          const gCx = d2y / len2sq, gCy = -d2x / len2sq;
          const gBx = -(gAx + gCx), gBy = -(gAy + gCy);

          // Weighted denominator: sum of w_i * |grad_i|²
          let denom = 0;
          if (freeA) denom += gAx * gAx + gAy * gAy;
          if (freeB) denom += gBx * gBx + gBy * gBy;
          if (freeC) denom += gCx * gCx + gCy * gCy;
          if (denom < 1e-14) continue;

          const lambda = -dAngle / denom;

          if (freeA) {
            predicted[idxA!] += lambda * gAx;
            predicted[idxA! + 1] += lambda * gAy;
          }
          if (freeB) {
            predicted[idxB!] += lambda * gBx;
            predicted[idxB! + 1] += lambda * gBy;
          }
          if (freeC) {
            predicted[idxC!] += lambda * gCx;
            predicted[idxC! + 1] += lambda * gCy;
          }
        }
      }
    }

    // 4. Derive velocity from position change
    const invSubDt = 1 / subDt;
    for (let i = 0; i < n; i++) {
      v[i] = (predicted[i] - q[i]) * invSubDt;
    }

    // 5. Apply damping to velocity
    if (damping < 0.999) {
      for (let i = 0; i < n; i++) {
        v[i] *= dampPerSubstep;
      }
    }

    // 6. Update positions
    for (let i = 0; i < n; i++) {
      q[i] = predicted[i];
    }
  }

  // --- Generate force vectors for display (from final positions) ---
  for (const link of linkArray) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    if (!jA || !jB) continue;

    const idxA = jointIndex.get(jA.id);
    const idxB = jointIndex.get(jB.id);
    const posAx = idxA !== undefined ? q[idxA] : jA.position.x;
    const posAy = idxA !== undefined ? q[idxA + 1] : jA.position.y;
    const posBx = idxB !== undefined ? q[idxB] : jB.position.x;
    const posBy = idxB !== undefined ? q[idxB + 1] : jB.position.y;

    if (gravity.enabled && (idxA !== undefined || idxB !== undefined)) {
      // Skip gravity vectors for base-body-only links (both joints fixed)
      const wA = jointGravityWeights?.get(jA.id) ?? 1;
      const wB = jointGravityWeights?.get(jB.id) ?? 1;
      const totalW = wA + wB;
      const comX = totalW > 0 ? (posAx * wA + posBx * wB) / totalW : (posAx + posBx) / 2;
      const comY = totalW > 0 ? (posAy * wA + posBy * wB) / totalW : (posAy + posBy) / 2;
      forceVectors.push({
        origin: { x: comX, y: comY },
        force: { x: 0, y: link.mass * gravity.strength * 0.03 },
        color: '#42A5F5',
      });
    }

    if (pullForce && pullForce.linkId === link.id) {
      const t = pullForce.grabT;
      const grabX = posAx + (posBx - posAx) * t;
      const grabY = posAy + (posBy - posAy) * t;
      // Show spring component of force (the damping part is velocity-dependent and hard to display statically)
      const dax = (pullForce.target.x - grabX) * effectiveStrength;
      const day = (pullForce.target.y - grabY) * effectiveStrength;
      forceVectors.push({
        origin: { x: grabX, y: grabY },
        force: { x: dax * 0.015, y: day * 0.015 },
        color: '#FF9800',
      });
    }
  }

  // --- Save velocities for next frame ---
  for (let i = 0; i < freeJoints.length; i++) {
    velocities.set(freeJoints[i].id, { x: v[i * 2], y: v[i * 2 + 1] });
  }

  const positions = new Map<string, Vec2>();
  for (let i = 0; i < freeJoints.length; i++) {
    positions.set(freeJoints[i].id, { x: q[i * 2], y: q[i * 2 + 1] });
  }
  for (const joint of Object.values(joints)) {
    if (joint.type === 'fixed') positions.set(joint.id, joint.position);
  }

  return { converged: true, iterations: 0, residual: 0, positions, forceVectors };
}
