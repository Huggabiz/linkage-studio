/**
 * Validation test scenarios for the physics simulation.
 * Run in browser console: import('/src/core/solver/test-scenarios.ts').then(m => m.runAll())
 */
import type { Joint, Link } from '../../types';
import { solveWithForce, resetVelocities } from './newton-raphson';
import { createId } from '../../utils/id';

interface TestResult { name: string; passed: boolean; detail: string; }

function makeJoint(type: Joint['type'], x: number, y: number, linkIds: string[]): Joint {
  return { id: createId(), type, position: { x, y }, connectedLinkIds: linkIds };
}

function makeLink(id: string, jA: string, jB: string, len: number): Link {
  return { id, jointIds: [jA, jB], restLength: len, mass: 1 };
}

function run(
  joints: Record<string, Joint>, links: Record<string, Link>,
  steps: number, damping = 0.3, grav = 800,
) {
  const fixedIds = new Set(Object.values(joints).filter(j => j.type === 'fixed').map(j => j.id));
  for (let i = 0; i < steps; i++) {
    const r = solveWithForce(joints, links, { enabled: true, strength: grav }, null, damping, 1, 0, 1 / 60, fixedIds);
    for (const [id, pos] of r.positions) {
      if (joints[id] && !fixedIds.has(id)) joints[id] = { ...joints[id], position: pos };
    }
  }
}

function test1_Pendulum(): TestResult {
  resetVelocities();
  const f = makeJoint('fixed', 200, 100, ['l']);
  const r = makeJoint('revolute', 350, 100, ['l']);
  const j: Record<string, Joint> = { [f.id]: f, [r.id]: r };
  const k: Record<string, Link> = { l: makeLink('l', f.id, r.id, 150) };
  run(j, k, 300);
  const p = j[r.id].position;
  const dx = p.x - 200, dy = p.y - 100, len = Math.sqrt(dx * dx + dy * dy);
  const ok = p.y > 200 && Math.abs(len - 150) < 2;
  return { name: 'Pendulum falls to vertical', passed: ok, detail: `(${p.x.toFixed(0)}, ${p.y.toFixed(0)}) len=${len.toFixed(1)}` };
}

function test2_Chain(): TestResult {
  resetVelocities();
  const f = makeJoint('fixed', 200, 100, ['l1']);
  const m = makeJoint('revolute', 300, 100, ['l1', 'l2']);
  const e = makeJoint('revolute', 400, 100, ['l2']);
  const j: Record<string, Joint> = { [f.id]: f, [m.id]: m, [e.id]: e };
  const k: Record<string, Link> = {
    l1: makeLink('l1', f.id, m.id, 100),
    l2: makeLink('l2', m.id, e.id, 100),
  };
  run(j, k, 300);
  const my = j[m.id].position.y, ey = j[e.id].position.y;
  const ok = my > 150 && ey > my - 50 && isFinite(ey);
  return { name: 'Two-link chain falls correctly', passed: ok, detail: `mid_y=${my.toFixed(0)} end_y=${ey.toFixed(0)}` };
}

function test3_FreeFloat(): TestResult {
  resetVelocities();
  const a = makeJoint('revolute', 200, 100, ['l']);
  const b = makeJoint('revolute', 300, 100, ['l']);
  const j: Record<string, Joint> = { [a.id]: a, [b.id]: b };
  const k: Record<string, Link> = { l: makeLink('l', a.id, b.id, 100) };
  run(j, k, 120);
  const ay = j[a.id].position.y, by = j[b.id].position.y;
  const ok = ay > 200 && by > 200;
  return { name: 'Free-floating link falls', passed: ok, detail: `a_y=${ay.toFixed(0)} b_y=${by.toFixed(0)}` };
}

function test4_NoGravity(): TestResult {
  resetVelocities();
  const f = makeJoint('fixed', 200, 100, ['l']);
  const r = makeJoint('revolute', 350, 100, ['l']);
  const j: Record<string, Joint> = { [f.id]: f, [r.id]: r };
  const k: Record<string, Link> = { l: makeLink('l', f.id, r.id, 150) };
  const fixedIds = new Set([f.id]);
  for (let i = 0; i < 60; i++) {
    const res = solveWithForce(j, k, { enabled: false, strength: 0 }, null, 0.99, 1, 0, 1 / 60, fixedIds);
    for (const [id, pos] of res.positions) if (j[id] && !fixedIds.has(id)) j[id] = { ...j[id], position: pos };
  }
  const p = j[r.id].position;
  const ok = Math.abs(p.x - 350) < 1 && Math.abs(p.y - 100) < 1;
  return { name: 'No gravity stays static', passed: ok, detail: `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})` };
}

function test5_LinkLength(): TestResult {
  resetVelocities();
  const f = makeJoint('fixed', 200, 100, ['l']);
  const r = makeJoint('revolute', 350, 100, ['l']);
  const j: Record<string, Joint> = { [f.id]: f, [r.id]: r };
  const k: Record<string, Link> = { l: makeLink('l', f.id, r.id, 150) };
  run(j, k, 300);
  const dx = j[r.id].position.x - 200, dy = j[r.id].position.y - 100;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ok = Math.abs(len - 150) < 2;
  return { name: 'Link length preserved', passed: ok, detail: `len=${len.toFixed(2)} expected=150` };
}

function test6_Drag(): TestResult {
  resetVelocities();
  const f = makeJoint('fixed', 200, 200, ['l']);
  const r = makeJoint('revolute', 200, 350, ['l']);
  const j: Record<string, Joint> = { [f.id]: f, [r.id]: r };
  const k: Record<string, Link> = { l: makeLink('l', f.id, r.id, 150) };
  const pull = { linkId: 'l', grabT: 1.0, target: { x: 400, y: 200 } };
  const fixedIds = new Set([f.id]);
  for (let i = 0; i < 120; i++) {
    const res = solveWithForce(j, k, { enabled: true, strength: 800 }, pull, 0.3, 25, 0.15, 1 / 60, fixedIds);
    for (const [id, pos] of res.positions) if (j[id] && !fixedIds.has(id)) j[id] = { ...j[id], position: pos };
  }
  const ok = j[r.id].position.x > 250;
  return { name: 'Drag pulls joint toward target', passed: ok, detail: `x=${j[r.id].position.x.toFixed(0)}` };
}

export function runAll(): TestResult[] {
  const results = [test1_Pendulum(), test2_Chain(), test3_FreeFloat(), test4_NoGravity(), test5_LinkLength(), test6_Drag()];
  console.log('\n=== Physics Validation ===');
  for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
  console.log(`${results.filter(r => r.passed).length}/${results.length} passed\n`);
  return results;
}
