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

function App() {
  const initialAngleRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const sim = useSimulationStore.getState();
      const mech = useMechanismStore.getState();
      const editor = useEditorStore.getState();

      // Always compute DOF
      const dof = computeDOF(mech.joints, mech.links, !!sim.driverJointId);
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

        const result = solveWithForce(
          mech.joints,
          mech.links,
          { enabled: sim.gravityEnabled, strength: sim.gravityStrength },
          pullForce,
          sim.damping,
          sim.dragMultiplier,
          sim.dragDamping,
          SIM_DT * sim.speed,
        );

        sim.setSolverResult(result);

        if (result.converged || result.residual < 1) {
          for (const [jointId, pos] of result.positions) {
            if (mech.joints[jointId] && mech.joints[jointId].type !== 'fixed') {
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

      const fixedJointId = link.jointIds.find((jid) => mech.joints[jid]?.type === 'fixed');
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
      });

      sim.setSolverResult(result);

      if (result.converged) {
        for (const [jointId, pos] of result.positions) {
          if (mech.joints[jointId] && mech.joints[jointId].type !== 'fixed') {
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
