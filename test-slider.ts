/**
 * Standalone slider constraint validation test.
 * Run: npx tsx test-slider.ts
 *
 * Setup: Slider body (A-C) with B as a fixed pivot on Base.
 * An additional free joint D is connected to A, forming a pendulum off the slider.
 * Gravity pulls D down, which should cause A-C to slide along the rail through B,
 * but B must always remain between A and C.
 *
 * Test 1: Simple - just A,B,C with gravity (B fixed)
 * Test 2: Pendulum - D connected to A, gravity pulls system
 * Test 3: Offset - B not centered, A&C start displaced
 */
import type { Joint, Link, SliderConstraint } from './src/types';
import { solveWithForce, resetVelocities } from './src/core/solver/newton-raphson';

function tParam(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const acx = cx - ax, acy = cy - ay;
  const abx = bx - ax, aby = by - ay;
  const acLenSq = acx * acx + acy * acy;
  if (acLenSq < 1e-8) return 0.5;
  return (abx * acx + aby * acy) / acLenSq;
}

function perpDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const acx = cx - ax, acy = cy - ay;
  const acLen = Math.sqrt(acx * acx + acy * acy);
  if (acLen < 1e-8) return 0;
  const ux = acx / acLen, uy = acy / acLen;
  return (bx - ax) * (-uy) + (by - ay) * ux;
}

function runTest(
  name: string,
  joints: Record<string, Joint>,
  links: Record<string, Link>,
  sliders: Record<string, SliderConstraint>,
  fixedIds: Set<string>,
  steps: number,
  expectMovement: boolean,
): boolean {
  resetVelocities();
  console.log(`\n--- ${name} ---`);

  const initAx = joints.A.position.x, initAy = joints.A.position.y;
  let failed = false;
  let moved = false;

  for (let i = 0; i < steps; i++) {
    const result = solveWithForce(
      joints, links,
      { enabled: true, strength: 250 },
      null, 0.3, 25, 0.15, 1 / 60,
      fixedIds, undefined, sliders,
    );

    for (const [jid, pos] of result.positions) {
      if (joints[jid] && !fixedIds.has(jid)) {
        joints[jid] = { ...joints[jid], position: pos };
      }
    }

    const a = joints.A.position, b = joints.B.position, c = joints.C.position;
    const t = tParam(a.x, a.y, b.x, b.y, c.x, c.y);
    const pd = perpDist(a.x, a.y, b.x, b.y, c.x, c.y);

    if (Math.abs(a.x - initAx) > 1 || Math.abs(a.y - initAy) > 1) moved = true;

    if (i % 50 === 0 || i === steps - 1) {
      console.log(
        `  Step ${String(i).padStart(3)}: A=(${a.x.toFixed(1)}, ${a.y.toFixed(1)}) ` +
        `B=(${b.x.toFixed(1)}, ${b.y.toFixed(1)}) C=(${c.x.toFixed(1)}, ${c.y.toFixed(1)}) ` +
        `t=${t.toFixed(3)} perp=${pd.toFixed(3)}` +
        (joints.D ? ` D=(${joints.D.position.x.toFixed(1)}, ${joints.D.position.y.toFixed(1)})` : '')
      );
    }

    if (t < -0.05 || t > 1.05) {
      console.log(`  *** FAIL at step ${i}: t=${t.toFixed(4)} — B is OUTSIDE segment AC! ***`);
      failed = true;
      break;
    }
    if (Math.abs(pd) > 2) {
      console.log(`  *** FAIL at step ${i}: perpDist=${pd.toFixed(4)} — B is OFF the line AC! ***`);
      failed = true;
      break;
    }
  }

  if (expectMovement && !moved) {
    console.log(`  *** FAIL: Expected movement but joints didn't move ***`);
    failed = true;
  }

  console.log(failed ? `  RESULT: FAIL` : `  RESULT: PASS`);
  return !failed;
}

console.log('=== Slider Constraint Validation Suite ===');
let allPassed = true;

// Test 1: Simple vertical gravity, B fixed centered
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 200, y: 100 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 300, y: 100 }, connectedLinkIds: ['lac'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = {
    s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 },
  };
  if (!runTest('Test 1: Simple (horizontal rail, gravity down)', joints, links, sliders, new Set(['B']), 300, false))
    allPassed = false;
}

// Test 2: Pendulum off slider — D hangs from A, gravity should cause sliding
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 200, y: 100 }, connectedLinkIds: ['lac', 'lad'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 300, y: 100 }, connectedLinkIds: ['lac'] },
    D: { id: 'D', type: 'revolute', position: { x: 200, y: 200 }, connectedLinkIds: ['lad'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
    lad: { id: 'lad', jointIds: ['A', 'D'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = {
    s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 },
  };
  if (!runTest('Test 2: Pendulum off slider (D hangs from A)', joints, links, sliders, new Set(['B']), 300, true))
    allPassed = false;
}

// Test 3: Vertical rail (A above C, B fixed in between), gravity pulls A&C down
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 250, y: 50 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 250, y: 150 }, connectedLinkIds: ['lac'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = {
    s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 },
  };
  if (!runTest('Test 3: Vertical rail, gravity pulls down along rail', joints, links, sliders, new Set(['B']), 300, true))
    allPassed = false;
}

// Test 4: B at edge — A and C start both to the right of B
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 260, y: 100 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 360, y: 100 }, connectedLinkIds: ['lac'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = {
    s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 },
  };
  if (!runTest('Test 4: B at edge (A,C both to right of B initially)', joints, links, sliders, new Set(['B']), 300, false))
    allPassed = false;
}

console.log(`\n=== ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
