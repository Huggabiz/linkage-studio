import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode, CreateTool } from '../../types';
import type { Vec2 } from '../../types';
import './Toolbar.css';

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const setMode = useEditorStore((s) => s.setMode);
  const setSavedPositions = useEditorStore((s) => s.setSavedPositions);
  const savedPositions = useEditorStore((s) => s.savedPositions);
  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const joints = useMechanismStore((s) => s.joints);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const regenerateLinks = useMechanismStore((s) => s.regenerateLinks);

  const handleModeSwitch = (newMode: AppMode) => {
    if (newMode === mode) return;

    if (newMode === 'simulate') {
      const positions: Record<string, Vec2> = {};
      for (const [id, joint] of Object.entries(joints)) {
        positions[id] = { ...joint.position };
      }
      setSavedPositions(positions);
      regenerateLinks();
    } else {
      if (savedPositions) {
        for (const [id, pos] of Object.entries(savedPositions)) {
          if (joints[id]) {
            moveJoint(id, pos);
          }
        }
        setSavedPositions(null);
        regenerateLinks();
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
            <button
              className={`tool-btn ${createTool === 'joints' ? 'active' : ''}`}
              onClick={() => setCreateTool('joints')}
            >
              Joints
            </button>
            <button
              className={`tool-btn ${createTool === 'outline' ? 'active' : ''}`}
              onClick={() => setCreateTool('outline')}
            >
              Outline
            </button>
          </div>

          <div className="toolbar-section">
            <div className="toolbar-label">Edit</div>
            <button className="tool-btn" onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
            <button className="tool-btn" onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
          </div>

          <div className="toolbar-section">
            {createTool === 'joints' ? (
              <>
                <div className="sim-hint">Click to add joint</div>
                <div className="sim-hint">Click joint to select</div>
                <div className="sim-hint">Double-click to toggle fixed</div>
              </>
            ) : (
              <>
                <div className="sim-hint">Click to place outline points</div>
                <div className="sim-hint">Click first point to close</div>
                <div className="sim-hint">Escape to cancel</div>
              </>
            )}
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
