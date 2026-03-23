import { useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { useMechanismStore } from './store/mechanism-store';
import { useSimulationStore } from './store/simulation-store';
import { useEditorStore } from './store/editor-store';
import { solve, solveWithForce, resetVelocities } from './core/solver/newton-raphson';
import { computeDOF } from './core/solver/dof';
import { computeDriverAngle } from './core/solver/driver';
import { angleBetween } from './core/math/vec2';
import { SIM_DT } from './utils/constants';
import { computeBodyTransform, localToWorld, polygonCentroid } from './core/body-transform';

function App() {
  const initialAngleRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const sim = useSimulationStore.getState();
      const mech = useMechanismStore.getState();
      const editor = useEditorStore.getState();

      // Compute fixed joint IDs from base body
      const baseBody = mech.bodies[mech.baseBodyId];
      const fixedJointIds = new Set<string>(baseBody?.jointIds ?? []);

      // Always compute DOF
      const dof = computeDOF(mech.joints, mech.links, !!sim.driverJointId, fixedJointIds);
      if (dof !== sim.dof) sim.setDof(dof);

      // --- SIMULATE MODE ---
      if (editor.mode === 'simulate') {
        sim.advanceTime(SIM_DT * sim.speed);

        // Build pull force from sim drag
        const pullForce = editor.simDrag?.active && editor.simDrag.linkId
          ? {
              linkId: editor.simDrag.linkId,
              grabT: editor.simDrag.grabT,
              target: editor.simDrag.cursorPoint,
            }
          : null;

        // Compute gravity weights from body outline COMs
        let jointGravityWeights: Map<string, number> | undefined;
        const bodiesWithCOM = Object.values(mech.bodies).filter((b) => b.useOutlineCOM);
        if (bodiesWithCOM.length > 0 && sim.gravityEnabled) {
          jointGravityWeights = new Map();
          for (const body of bodiesWithCOM) {
            // Get world-space outline centroid
            const bodyOutlines = Object.values(mech.outlines).filter((o) => o.bodyId === body.id);
            if (bodyOutlines.length === 0) continue;

            const transform = computeBodyTransform(body, mech.joints);
            // Use first outline's centroid (or merge all outline points)
            const allWorldPts = bodyOutlines.flatMap((o) => o.points.map((p) => localToWorld(p, transform)));
            const com = polygonCentroid(allWorldPts);

            // Find free joints in this body
            const freeIds = body.jointIds.filter((jid) => !fixedJointIds.has(jid) && mech.joints[jid]);
            if (freeIds.length < 2) {
              // 0 or 1 free joints — just use default weight
              for (const jid of freeIds) jointGravityWeights.set(jid, 1);
              continue;
            }

            // For 2 joints: project COM onto line to get parametric t, distribute as (1-t) and t
            if (freeIds.length === 2) {
              const pA = mech.joints[freeIds[0]].position;
              const pB = mech.joints[freeIds[1]].position;
              const dx = pB.x - pA.x, dy = pB.y - pA.y;
              const lenSq = dx * dx + dy * dy;
              let t = 0.5;
              if (lenSq > 1e-8) {
                t = Math.max(0, Math.min(1, ((com.x - pA.x) * dx + (com.y - pA.y) * dy) / lenSq));
              }
              // Scale so total weight = 2 (same as default where each gets 1)
              jointGravityWeights.set(freeIds[0], 2 * (1 - t));
              jointGravityWeights.set(freeIds[1], 2 * t);
            } else {
              // 3+ joints — equal distribution for now
              for (const jid of freeIds) jointGravityWeights.set(jid, 1);
            }
          }
        }

        const result = solveWithForce(
          mech.joints,
          mech.links,
          { enabled: sim.gravityEnabled, strength: sim.gravityStrength },
          pullForce,
          sim.damping,
          sim.dragMultiplier,
          sim.dragDamping,
          SIM_DT * sim.speed,
          fixedJointIds,
          jointGravityWeights,
        );

        sim.setSolverResult(result);

        if (result.converged || result.residual < 1) {
          for (const [jointId, pos] of result.positions) {
            if (mech.joints[jointId] && !fixedJointIds.has(jointId)) {
              mech.moveJoint(jointId, pos);
            }
          }
          // Record traces
          if (sim.tracingEnabled) {
            for (const jointId of sim.trackedJointIds) {
              const pos = result.positions.get(jointId);
              if (pos) sim.recordTrace(jointId, pos);
            }
          }
        }
        return;
      }

      // --- CREATE MODE (motor driver playback) ---
      if (!sim.isPlaying || !sim.driverJointId || !sim.driverLinkId) return;

      const link = mech.links[sim.driverLinkId];
      if (!link) return;

      const fixedJointId = link.jointIds.find((jid) => fixedJointIds.has(jid));
      const drivenJointId = link.jointIds.find((jid) => jid !== fixedJointId);
      if (!fixedJointId || !drivenJointId) return;

      if (initialAngleRef.current === null) {
        const fj = mech.joints[fixedJointId];
        const dj = mech.joints[drivenJointId];
        initialAngleRef.current = angleBetween(fj.position, dj.position);
      }

      sim.advanceTime(SIM_DT * sim.speed);
      const targetAngle = computeDriverAngle(sim.time, sim.speed, initialAngleRef.current);
      sim.setDriverAngle(targetAngle);

      const result = solve(mech.joints, mech.links, {
        fixedJointId,
        drivenJointId,
        targetAngle,
      }, fixedJointIds);

      sim.setSolverResult(result);

      if (result.converged) {
        for (const [jointId, pos] of result.positions) {
          if (mech.joints[jointId] && !fixedJointIds.has(jointId)) {
            mech.moveJoint(jointId, pos);
          }
        }
        if (sim.tracingEnabled) {
          for (const jointId of sim.trackedJointIds) {
            const pos = result.positions.get(jointId);
            if (pos) sim.recordTrace(jointId, pos);
          }
        }
      }
    };

    const intervalId = setInterval(tick, SIM_DT * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Reset initial angle when driver changes
  useEffect(() => {
    const unsub = useSimulationStore.subscribe((state, prevState) => {
      if (state.driverJointId !== prevState.driverJointId) {
        initialAngleRef.current = null;
      }
    });
    return unsub;
  }, []);

  // Reset velocities when entering simulate mode
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state, prevState) => {
      if (state.mode === 'simulate' && prevState.mode !== 'simulate') {
        resetVelocities();
      }
    });
    return unsub;
  }, []);

  return <Layout />;
}

export default App;
