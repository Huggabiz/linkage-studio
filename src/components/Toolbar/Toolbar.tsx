import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { ToolType, JointSubType, AppMode } from '../../types';
import type { Vec2 } from '../../types';
import './Toolbar.css';

const TOOLS: { type: ToolType; label: string; shortcut: string; icon: string }[] = [
  { type: 'select', label: 'Select', shortcut: 'S', icon: '+' },
  { type: 'joint', label: 'Joint', shortcut: 'J', icon: 'o' },
  { type: 'link', label: 'Link', shortcut: 'L', icon: '/' },
];

const JOINT_TYPES: { type: JointSubType; label: string }[] = [
  { type: 'revolute', label: 'Revolute (Pin)' },
  { type: 'fixed', label: 'Fixed (Ground)' },
];

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const activeTool = useEditorStore((s) => s.activeTool);
  const jointSubType = useEditorStore((s) => s.jointSubType);
  const setTool = useEditorStore((s) => s.setTool);
  const setJointSubType = useEditorStore((s) => s.setJointSubType);
  const setMode = useEditorStore((s) => s.setMode);
  const setSavedPositions = useEditorStore((s) => s.setSavedPositions);
  const savedPositions = useEditorStore((s) => s.savedPositions);
  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const joints = useMechanismStore((s) => s.joints);
  const moveJoint = useMechanismStore((s) => s.moveJoint);

  const handleModeSwitch = (newMode: AppMode) => {
    if (newMode === mode) return;

    if (newMode === 'simulate') {
      // Save current positions for restoring on exit
      const positions: Record<string, Vec2> = {};
      for (const [id, joint] of Object.entries(joints)) {
        positions[id] = { ...joint.position };
      }
      setSavedPositions(positions);
    } else {
      // Restore saved positions when switching back to create mode
      if (savedPositions) {
        for (const [id, pos] of Object.entries(savedPositions)) {
          if (joints[id]) {
            moveJoint(id, pos);
          }
        }
        setSavedPositions(null);
      }
    }

    setMode(newMode);
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section mode-toggle">
        <button
          className={`mode-btn ${mode === 'create' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('create')}
        >
          Create
        </button>
        <button
          className={`mode-btn simulate ${mode === 'simulate' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('simulate')}
        >
          Simulate
        </button>
      </div>

      {mode === 'create' ? (
        <>
          <div className="toolbar-section">
            <div className="toolbar-label">Tools</div>
            {TOOLS.map((t) => (
              <button
                key={t.type}
                className={`tool-btn ${activeTool === t.type ? 'active' : ''}`}
                onClick={() => setTool(t.type)}
                title={`${t.label} (${t.shortcut})`}
              >
                <span className="tool-icon">{t.icon}</span>
                <span className="tool-name">{t.label}</span>
              </button>
            ))}
          </div>

          {activeTool === 'joint' && (
            <div className="toolbar-section">
              <div className="toolbar-label">Joint Type</div>
              {JOINT_TYPES.map((jt) => (
                <button
                  key={jt.type}
                  className={`tool-btn sub ${jointSubType === jt.type ? 'active' : ''}`}
                  onClick={() => setJointSubType(jt.type)}
                >
                  {jt.label}
                </button>
              ))}
            </div>
          )}

          <div className="toolbar-section">
            <div className="toolbar-label">Edit</div>
            <button className="tool-btn" onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
            <button className="tool-btn" onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
          </div>
        </>
      ) : (
        <div className="toolbar-section">
          <div className="toolbar-label">Interact</div>
          <div className="sim-hint">Click & drag joints or links to apply force</div>
          <div className="sim-hint">Middle-click to pan</div>
          <div className="sim-hint">Scroll to zoom</div>
        </div>
      )}
    </div>
  );
}
