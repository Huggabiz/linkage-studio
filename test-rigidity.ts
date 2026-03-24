/**
 * Rigidity validation: test that bodies with various joint configurations
 * remain stable under gravity. Run: npx tsx test-rigidity.ts
 */
import type { Joint, Link, Body, AngleConstraint } from './src/types';
import { solveWithForce, resetVelocities } from './src/core/solver/newton-raphson';
import { generateBodyLinks } from './src/core/body-links';
import { distance } from './src/core/math/vec2';

function buildLinksRecord(links: Link[]): Record<string, Link> {
  const record: Record<string, Link> = {};
  for (const link of links) record[link.id] = link;
  return record;
}

interface TestOpts {
  name: string;
  joints: Record<string, Joint>;
  bodies: Record<string, Body>;
  fixedIds: Set<string>;
  steps: number;
  logInterval?: number;
}

function runTest(opts: TestOpts): boolean {
  resetVelocities();
  const { name, joints, bodies, fixedIds, steps, logInterval = 50 } = opts;
  console.log(`\n--- ${name} ---`);

  // Generate links + angle constraints from body structure
  const { links: linkArray, angleConstraints } = generateBodyLinks(bodies, joints);
  const links = buildLinksRecord(linkArray);

  console.log(`  Links: ${linkArray.length}, Angle constraints: ${angleConstraints.length}`);
  for (const ac of angleConstraints) {
    console.log(`    Angle: ${ac.jointIdA}-${ac.jointIdB}-${ac.jointIdC} rest=${(ac.restAngle * 180 / Math.PI).toFixed(1)}°`);
  }

  // Record initial distances between all joint pairs for rigidity checking
  const jointIds = Object.keys(joints).filter(id => !id.startsWith('__'));
  const initialDists: Record<string, number> = {};
  for (let i = 0; i < jointIds.length; i++) {
    for (let j = i + 1; j < jointIds.length; j++) {
      const key = `${jointIds[i]}-${jointIds[j]}`;
      initialDists[key] = distance(joints[jointIds[i]].position, joints[jointIds[j]].position);
    }
  }

  let failed = false;
  let maxDistError = 0;
  let maxSpeed = 0;

  for (let step = 0; step < steps; step++) {
    const result = solveWithForce(
      joints, links,
      { enabled: true, strength: 250 },
      null, 0.3, 25, 0.15, 1 / 60,
      fixedIds, undefined, undefined,
      angleConstraints,
    );

    for (const [jid, pos] of result.positions) {
      if (joints[jid] && !fixedIds.has(jid)) {
        joints[jid] = { ...joints[jid], position: pos };
      }
    }

    // Check distance preservation (rigidity)
    let stepMaxError = 0;
    for (let i = 0; i < jointIds.length; i++) {
      for (let j = i + 1; j < jointIds.length; j++) {
        const key = `${jointIds[i]}-${jointIds[j]}`;
        const currentDist = distance(joints[jointIds[i]].position, joints[jointIds[j]].position);
        const error = Math.abs(currentDist - initialDists[key]);
        if (error > stepMaxError) stepMaxError = error;
      }
    }
    if (stepMaxError > maxDistError) maxDistError = stepMaxError;

    // Check for runaway velocities (spinning)
    let stepMaxSpeed = 0;
    for (const jid of jointIds) {
      if (fixedIds.has(jid)) continue;
      const p = joints[jid].position;
      if (Math.abs(p.x) > 5000 || Math.abs(p.y) > 5000) {
        console.log(`  *** FAIL step ${step}: Joint ${jid} flew off to (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) ***`);
        failed = true;
        break;
      }
    }
    if (failed) break;

    if (step % logInterval === 0 || step === steps - 1) {
      const positions = jointIds.map(id =>
        `${id}=(${joints[id].position.x.toFixed(1)},${joints[id].position.y.toFixed(1)})`
      ).join(' ');
      console.log(`  Step ${String(step).padStart(3)}: distErr=${stepMaxError.toFixed(2)} ${positions}`);
    }

    // Rigidity check: distances shouldn't deviate by more than 5px
    if (stepMaxError > 5) {
      console.log(`  *** FAIL step ${step}: Distance error ${stepMaxError.toFixed(2)}px — body not rigid ***`);
      failed = true;
      break;
    }
  }

  console.log(`  Max distance error: ${maxDistError.toFixed(3)}px`);
  console.log(failed ? `  RESULT: FAIL` : `  RESULT: PASS`);
  return !failed;
}

console.log('=== Rigidity Validation Suite ===');
let allPassed = true;

// Test 1: Simple pendulum body — 1 fixed + 1 free joint
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 250, y: 200 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 1: Simple 2-joint pendulum', joints, bodies, fixedIds: new Set(['A']), steps: 300 })) allPassed = false;
}

// Test 2: Triangle body — 1 fixed + 2 free joints (well-spread)
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 200, y: 200 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 300, y: 200 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B', 'C'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 2: Triangle body (well-spread)', joints, bodies, fixedIds: new Set(['A']), steps: 300 })) allPassed = false;
}

// Test 3: PROBLEM CASE — 1 fixed + 3 free joints, clustered (not spread out)
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 255, y: 200 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 245, y: 210 }, connectedLinkIds: [] },
    D: { id: 'D', type: 'revolute', position: { x: 260, y: 205 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B', 'C', 'D'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 3: Clustered joints (the spinning problem)', joints, bodies, fixedIds: new Set(['A']), steps: 300, logInterval: 20 })) allPassed = false;
}

// Test 4: Near-collinear — 1 fixed + 2 free, almost in a line
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 251, y: 200 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 252, y: 300 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B', 'C'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 4: Near-collinear joints', joints, bodies, fixedIds: new Set(['A']), steps: 300 })) allPassed = false;
}

// Test 5: 5 joints, 1 fixed, tight cluster
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 240, y: 190 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 260, y: 195 }, connectedLinkIds: [] },
    D: { id: 'D', type: 'revolute', position: { x: 245, y: 205 }, connectedLinkIds: [] },
    E: { id: 'E', type: 'revolute', position: { x: 255, y: 200 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B', 'C', 'D', 'E'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 5: 5-joint tight cluster', joints, bodies, fixedIds: new Set(['A']), steps: 300, logInterval: 20 })) allPassed = false;
}

// Test 6: Exactly collinear — 3 joints in a perfect line
{
  const joints: Record<string, Joint> = {
    A: { id: 'A', type: 'fixed', position: { x: 250, y: 100 }, connectedLinkIds: [] },
    B: { id: 'B', type: 'revolute', position: { x: 250, y: 200 }, connectedLinkIds: [] },
    C: { id: 'C', type: 'revolute', position: { x: 250, y: 300 }, connectedLinkIds: [] },
  };
  const bodies: Record<string, Body> = {
    base: { id: 'base', name: 'Base', color: '#888', jointIds: ['A'], useOutlineCOM: false, showLinks: true },
    b1: { id: 'b1', name: 'Body1', color: '#f00', jointIds: ['A', 'B', 'C'], useOutlineCOM: false, showLinks: true },
  };
  if (!runTest({ name: 'Test 6: Exactly collinear (straight line)', joints, bodies, fixedIds: new Set(['A']), steps: 300 })) allPassed = false;
}

console.log(`\n=== ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
process.exit(allPassed ? 0 : 1);
