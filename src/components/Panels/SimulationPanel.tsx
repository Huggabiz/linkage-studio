import { useSimulationStore } from '../../store/simulation-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';

export function SimulationPanel() {
  const mode = useEditorStore((s) => s.mode);
  const isPlaying = useSimulationStore((s) => s.isPlaying);
  const speed = useSimulationStore((s) => s.speed);
  const dof = useSimulationStore((s) => s.dof);
  const time = useSimulationStore((s) => s.time);
  const driverJointId = useSimulationStore((s) => s.driverJointId);
  const gravityEnabled = useSimulationStore((s) => s.gravityEnabled);
  const gravityStrength = useSimulationStore((s) => s.gravityStrength);
  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const reset = useSimulationStore((s) => s.reset);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const setDriver = useSimulationStore((s) => s.setDriver);
  const clearDriver = useSimulationStore((s) => s.clearDriver);
  const clearTraces = useSimulationStore((s) => s.clearTraces);
  const toggleGravity = useSimulationStore((s) => s.toggleGravity);
  const setGravityStrength = useSimulationStore((s) => s.setGravityStrength);
  const dampingVal = useSimulationStore((s) => s.damping);
  const setDamping = useSimulationStore((s) => s.setDamping);
  const dragMult = useSimulationStore((s) => s.dragMultiplier);
  const setDragMultiplier = useSimulationStore((s) => s.setDragMultiplier);
  const dragDamp = useSimulationStore((s) => s.dragDamping);
  const setDragDamping = useSimulationStore((s) => s.setDragDamping);

  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  // Physics controls - visible in both modes
  const physicsSection = (
    <>
      <div className="panel-title" style={{ marginTop: 8 }}>Physics</div>
      <label>
        <input
          type="checkbox"
          checked={gravityEnabled}
          onChange={toggleGravity}
        />
        {' '}Gravity
      </label>
      {gravityEnabled && (
        <label>
          Strength
          <input
            type="range"
            min={100}
            max={3000}
            step={50}
            value={gravityStrength}
            onChange={(e) => setGravityStrength(+e.target.value)}
          />
          <span>{gravityStrength}</span>
        </label>
      )}
      <label>
        Damping
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((1 - dampingVal) * 100)}
          onChange={(e) => setDamping(1 - (+e.target.value) / 100)}
        />
        <span>{Math.round((1 - dampingVal) * 100)}</span>
      </label>
      <label>
        Drag Force
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={dragMult}
          onChange={(e) => setDragMultiplier(+e.target.value)}
        />
        <span>{dragMult}x</span>
      </label>
      <label>
        Drag Damping
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(dragDamp * 100)}
          onChange={(e) => setDragDamping(+e.target.value / 100)}
        />
        <span>{Math.round(dragDamp * 100)}</span>
      </label>
    </>
  );

  const viewSection = (
    <>
      <div className="panel-title" style={{ marginTop: 8 }}>View</div>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={useEditorStore((s) => s.showLinks)}
          onChange={() => useEditorStore.getState().toggleShowLinks()}
        />
        Show links
      </label>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={useEditorStore((s) => s.showVectors)}
          onChange={() => useEditorStore.getState().toggleShowVectors()}
        />
        Show vectors
      </label>
      {mode === 'create' && (
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={useEditorStore((s) => s.lockOutlines)}
            onChange={() => useEditorStore.getState().toggleLockOutlines()}
          />
          Lock outlines
        </label>
      )}
    </>
  );

  if (mode === 'simulate') {
    return (
      <div className="panel-content">
        <div className="panel-title">Simulation</div>
        <div className="panel-info">DOF: {dof}</div>
        <div className="panel-info">Time: {time.toFixed(2)}s</div>

        <div className="sim-controls">
          <button className="tool-btn" onClick={reset}>Reset</button>
          <button className="tool-btn" onClick={clearTraces}>Clear Traces</button>
        </div>

        {physicsSection}

        <label style={{ marginTop: 4 }}>
          Speed
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
          />
          <span>{speed.toFixed(1)}x</span>
        </label>

        {viewSection}
      </div>
    );
  }

  // --- CREATE MODE ---
  const selectedJointId = [...selectedIds].find((id) => joints[id]);
  const selectedJoint = selectedJointId ? joints[selectedJointId] : null;

  const canSetDriver = selectedJoint && selectedJoint.type !== 'fixed' &&
    selectedJoint.connectedLinkIds.some((linkId) => {
      const link = links[linkId];
      if (!link) return false;
      const otherJointId = link.jointIds[0] === selectedJointId ? link.jointIds[1] : link.jointIds[0];
      return joints[otherJointId]?.type === 'fixed';
    });

  return (
    <div className="panel-content">
      <div className="panel-title">Simulation</div>
      <div className="panel-info">DOF: {dof}</div>

      <div className="sim-controls">
        <button className="tool-btn" onClick={isPlaying ? pause : play}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button className="tool-btn" onClick={reset}>Reset</button>
        <button className="tool-btn" onClick={clearTraces}>Clear Traces</button>
      </div>

      <label>
        Speed
        <input
          type="range"
          min={0.1}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        />
        <span>{speed.toFixed(1)}x</span>
      </label>

      {physicsSection}

      <div className="panel-title" style={{ marginTop: 8 }}>Driver</div>
      {driverJointId ? (
        <div>
          <div className="panel-info">Joint: {driverJointId.slice(0, 6)}...</div>
          <button className="tool-btn" onClick={clearDriver}>Remove Driver</button>
        </div>
      ) : canSetDriver && selectedJointId ? (
        <button
          className="tool-btn"
          onClick={() => {
            const link = Object.values(links).find((l) =>
              l.jointIds.includes(selectedJointId) &&
              l.jointIds.some((jid) => jid !== selectedJointId && joints[jid]?.type === 'fixed')
            );
            if (link) setDriver(selectedJointId, link.id, 'motor');
          }}
        >
          Set Selected as Motor
        </button>
      ) : (
        <div className="panel-info">Select a joint connected to ground to set a driver</div>
      )}

      {viewSection}
    </div>
  );
}
