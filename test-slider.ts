/**
 * Slider constraint validation suite.
 * Run: npx tsx test-slider.ts
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
  return (bx - ax) * (-acy / acLen) + (by - ay) * (acx / acLen);
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function angle(ax: number, ay: number, cx: number, cy: number): number {
  return Math.atan2(cy - ay, cx - ax) * 180 / Math.PI;
}

interface TestOpts {
  name: string;
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  sliders: Record<string, SliderConstraint>;
  fixedIds: Set<string>;
  steps: number;
  checks: (joints: Record<string, Joint>, step: number) => string | null; // null = ok, string = fail reason
  logInterval?: number;
}

function runTest(opts: TestOpts): boolean {
  resetVelocities();
  const { name, joints, links, sliders, fixedIds, steps, checks, logInterval = 50 } = opts;
  console.log(`\n--- ${name} ---`);

  let failed = false;
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
    const ang = angle(a.x, a.y, c.x, c.y);

    if (i % logInterval === 0 || i === steps - 1) {
      let line = `  Step ${String(i).padStart(3)}: A=(${a.x.toFixed(1)}, ${a.y.toFixed(1)}) ` +
        `B=(${b.x.toFixed(1)}, ${b.y.toFixed(1)}) C=(${c.x.toFixed(1)}, ${c.y.toFixed(1)}) ` +
        `t=${t.toFixed(3)} perp=${pd.toFixed(3)} ang=${ang.toFixed(1)}°`;
      if (joints.D) line += ` D=(${joints.D.position.x.toFixed(1)}, ${joints.D.position.y.toFixed(1)})`;
      console.log(line);
    }

    // Always check slider validity
    if (t < -0.05 || t > 1.05) {
      console.log(`  *** FAIL step ${i}: t=${t.toFixed(4)} — B outside segment AC ***`);
      failed = true; break;
    }
    if (Math.abs(pd) > 3) {
      console.log(`  *** FAIL step ${i}: perp=${pd.toFixed(4)} — B off line AC ***`);
      failed = true; break;
    }

    // Custom checks
    const err = checks(joints, i);
    if (err) {
      console.log(`  *** FAIL step ${i}: ${err} ***`);
      failed = true; break;
    }
  }
  console.log(failed ? `  RESULT: FAIL` : `  RESULT: PASS`);
  return !failed;
}

console.log('=== Slider Constraint Validation Suite ===');
let allPassed = true;

// Test 1: Horizontal rail, gravity down — should stay horizontal (no torque)
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 200, y: 100 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 300, y: 100 }, connectedLinkIds: ['lac'] },
  };
  const links: Record<string, Link> = { lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 } };
  const sliders: Record<string, SliderConstraint> = { s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 } };
  if (!runTest({
    name: 'Test 1: Symmetric horizontal rail (no rotation expected)',
    joints, links, sliders, fixedIds: new Set(['B']), steps: 200,
    checks: () => null,
  })) allPassed = false;
}

// Test 2: Pendulum off A — mass hangs from A side, should rotate around B
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
  const sliders: Record<string, SliderConstraint> = { s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 } };
  let rotated = false;
  if (!runTest({
    name: 'Test 2: Pendulum off A — should rotate (A drops, C rises)',
    joints, links, sliders, fixedIds: new Set(['B']), steps: 300, logInterval: 30,
    checks: (j, step) => {
      const ang = angle(j.A.position.x, j.A.position.y, j.C.position.x, j.C.position.y);
      // AC should tilt — A should drop below B, C should rise above
      if (Math.abs(ang) > 10) rotated = true;
      if (step === 299 && !rotated) return 'AC rail never rotated — expected pendulum behavior';
      return null;
    },
  })) allPassed = false;
}

// Test 3: Vertical rail — gravity along rail axis, should slide freely
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 250, y: 50 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 250, y: 150 }, connectedLinkIds: ['lac'] },
  };
  const links: Record<string, Link> = { lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 } };
  const sliders: Record<string, SliderConstraint> = { s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.5 } };
  if (!runTest({
    name: 'Test 3: Vertical rail — should slide down under gravity',
    joints, links, sliders, fixedIds: new Set(['B']), steps: 200,
    checks: (j, step) => {
      if (step === 199) {
        // A should have slid up to B (t→0), C below
        if (j.A.position.y > 105) return `A didn't slide up to B (A.y=${j.A.position.y.toFixed(1)})`;
      }
      return null;
    },
  })) allPassed = false;
}

// Test 4: B bottomed out at A → becomes pendulum around A(=B)
{
  // Start with B at A's position (t=0), pendulum D hanging from C
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 250, y: 100 }, connectedLinkIds: ['lac'] },
    B: { id: 'B', type: 'fixed',    position: { x: 250, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 350, y: 100 }, connectedLinkIds: ['lac', 'lcd'] },
    D: { id: 'D', type: 'revolute', position: { x: 350, y: 200 }, connectedLinkIds: ['lcd'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
    lcd: { id: 'lcd', jointIds: ['C', 'D'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = { s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0 } };
  let swung = false;
  if (!runTest({
    name: 'Test 4: B at A endpoint — should pendulum around B',
    joints, links, sliders, fixedIds: new Set(['B']), steps: 300, logInterval: 30,
    checks: (j, step) => {
      // C should swing down and to the side (pendulum around A=B)
      if (j.C.position.y > 150) swung = true;
      if (step === 299 && !swung) return 'C never swung down — expected pendulum around B at endpoint';
      return null;
    },
  })) allPassed = false;
}

// Test 5: Asymmetric mass — B off-center, heavier side should drop
{
  // B at 1/4 from A. Two pendulums: light one from A, heavy (2 links) from C
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'revolute', position: { x: 200, y: 100 }, connectedLinkIds: ['lac', 'lae'] },
    B: { id: 'B', type: 'fixed',    position: { x: 225, y: 100 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 300, y: 100 }, connectedLinkIds: ['lac', 'lcf', 'lcg'] },
    E: { id: 'E', type: 'revolute', position: { x: 200, y: 150 }, connectedLinkIds: ['lae'] },
    F: { id: 'F', type: 'revolute', position: { x: 300, y: 150 }, connectedLinkIds: ['lcf'] },
    G: { id: 'G', type: 'revolute', position: { x: 300, y: 200 }, connectedLinkIds: ['lcg'] },
  };
  const links: Record<string, Link> = {
    lac: { id: 'lac', jointIds: ['A', 'C'], restLength: 100, mass: 1 },
    lae: { id: 'lae', jointIds: ['A', 'E'], restLength: 50, mass: 1 },
    lcf: { id: 'lcf', jointIds: ['C', 'F'], restLength: 50, mass: 1 },
    lcg: { id: 'lcg', jointIds: ['C', 'G'], restLength: 100, mass: 1 },
  };
  const sliders: Record<string, SliderConstraint> = { s1: { id: 's1', jointIdA: 'A', jointIdB: 'B', jointIdC: 'C', t: 0.25 } };
  let cDropped = false;
  if (!runTest({
    name: 'Test 5: Heavier C-side should drop (asymmetric mass)',
    joints, links, sliders, fixedIds: new Set(['B']), steps: 300, logInterval: 30,
    checks: (j, step) => {
      // C side is heavier, should drop below B
      if (j.C.position.y > j.B.position.y + 20) cDropped = true;
      if (step === 299 && !cDropped) return 'C-side never dropped below B — expected asymmetric rotation';
      return null;
    },
  })) allPassed = false;
}

console.log(`\n=== ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
process.exit(allPassed ? 0 : 1);
