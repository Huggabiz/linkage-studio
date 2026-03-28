import { useSimulationStore } from '../../store/simulation-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { computeBodyTransform, localToWorld } from '../../core/body-transform';

export function SimulationPanel() {
  const mode = useEditorStore((s) => s.mode);
  const isPlaying = useSimulationStore((s) => s.isPlaying);
  const speed = useSimulationStore((s) => s.speed);
  const dof = useSimulationStore((s) => s.dof);
  const time = useSimulationStore((s) => s.time);
  const gravityEnabled = useSimulationStore((s) => s.gravityEnabled);
  const gravityStrength = useSimulationStore((s) => s.gravityStrength);
  const play = useSimulationStore((s) => s.play);
  const pause = useSimulationStore((s) => s.pause);
  const reset = useSimulationStore((s) => s.reset);
  const setSpeed = useSimulationStore((s) => s.setSpeed);
  const clearTraces = useSimulationStore((s) => s.clearTraces);
  const toggleGravity = useSimulationStore((s) => s.toggleGravity);
  const setGravityStrength = useSimulationStore((s) => s.setGravityStrength);
  const dampingVal = useSimulationStore((s) => s.damping);
  const setDamping = useSimulationStore((s) => s.setDamping);
  const dragMult = useSimulationStore((s) => s.dragMultiplier);
  const setDragMultiplier = useSimulationStore((s) => s.setDragMultiplier);
  const dragDamp = useSimulationStore((s) => s.dragDamping);
  const setDragDamping = useSimulationStore((s) => s.setDragDamping);

  const showLinks = useEditorStore((s) => s.showLinks);
  const showVectors = useEditorStore((s) => s.showVectors);
  const showRulers = useEditorStore((s) => s.showRulers);
  const showForceUnits = useEditorStore((s) => s.showForceUnits);
  const lockOutlines = useEditorStore((s) => s.lockOutlines);
  const gridLevel = useEditorStore((s) => s.gridLevel);

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
          checked={showLinks}
          onChange={() => useEditorStore.getState().toggleShowLinks()}
        />
        Show links
      </label>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={showVectors}
          onChange={() => useEditorStore.getState().toggleShowVectors()}
        />
        Show vectors
      </label>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={showRulers}
          onChange={() => useEditorStore.getState().toggleShowRulers()}
        />
        Show rulers
      </label>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={showForceUnits}
          onChange={() => useEditorStore.getState().toggleShowForceUnits()}
        />
        Show force units
      </label>
      {mode === 'create' && (
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={lockOutlines}
            onChange={() => {
              const editor = useEditorStore.getState();
              const mech = useMechanismStore.getState();
              if (!editor.lockOutlines) {
                // Locking: snapshot current world-space outline positions
                const frozen = new Map<string, import('../../types').Vec2[]>();
                for (const outline of Object.values(mech.outlines)) {
                  const body = mech.bodies[outline.bodyId];
                  if (!body || outline.points.length < 2) continue;
                  const transform = computeBodyTransform(body, mech.joints);
                  frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
                }
                editor.setLockOutlines(true, frozen);
              } else {
                // Unlocking: reproject outlines to stay at their frozen positions
                const frozen = editor.frozenOutlineWorldPoints;
                if (frozen.size > 0) {
                  mech.reprojectOutlinesFromWorld(frozen);
                }
                editor.setLockOutlines(false);
              }
            }}
          />
          Lock outlines
        </label>
      )}
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Grid (G)</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {(['normal', 'fine', 'ultrafine', 'off'] as const).map((level) => (
          <button
            key={level}
            onClick={() => useEditorStore.getState().setGridLevel(level)}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: 10,
              border: '1px solid #444',
              borderRadius: 3,
              cursor: 'pointer',
              background: gridLevel === level ? '#4a9eff' : '#2a2a2a',
              color: gridLevel === level ? '#fff' : '#aaa',
            }}
          >
            {level === 'ultrafine' ? 'Ultra' : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>
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
  return (
    <div className="panel-content">
      <div className="panel-title">Properties</div>
      <div className="panel-info">DOF: {dof}</div>

      {physicsSection}

      <div className="sim-controls" style={{ marginTop: 4 }}>
        <button className="tool-btn" onClick={clearTraces}>Clear Traces</button>
      </div>

      {viewSection}
    </div>
  );
}
