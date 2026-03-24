import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode, CreateTool, JointMode } from '../../types';
import type { Vec2 } from '../../types';
import { serializeMechanism, deserializeMechanism, downloadFile, openFilePicker } from '../../utils/file-io';
import './Toolbar.css';

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const jointMode = useEditorStore((s) => s.jointMode);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const setJointMode = useEditorStore((s) => s.setJointMode);
  const setMode = useEditorStore((s) => s.setMode);
  const setSavedPositions = useEditorStore((s) => s.setSavedPositions);
  const savedPositions = useEditorStore((s) => s.savedPositions);
  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const clearAll = useMechanismStore((s) => s.clearAll);
  const loadState = useMechanismStore((s) => s.loadState);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const joints = useMechanismStore((s) => s.joints);
  const bodies = useMechanismStore((s) => s.bodies);
  const links = useMechanismStore((s) => s.links);
  const outlines = useMechanismStore((s) => s.outlines);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const regenerateLinks = useMechanismStore((s) => s.regenerateLinks);

  const handleSave = () => {
    const json = serializeMechanism(joints, links, bodies, baseBodyId, outlines);
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
    downloadFile(json, `linkage_${timestamp}.slinker`);
  };

  const handleOpen = async () => {
    const json = await openFilePicker();
    if (!json) return;
    const state = deserializeMechanism(json);
    if (!state) { alert('Invalid file format'); return; }
    loadState(state);
    useEditorStore.getState().clearSelection();
  };

  const hasSelection = selectedIds.size > 0;
  const handleDeleteSelected = () => {
    for (const id of selectedIds) {
      if (joints[id]) removeJoint(id);
      else if (outlines[id]) removeOutline(id);
    }
    clearSelection();
  };

  const removeTempJoint = useMechanismStore((s) => s.removeTempJoint);

  const handleModeSwitch = (newMode: AppMode) => {
    if (newMode === mode) return;

    // Clean up any temp joints from shape dragging
    const editorState = useEditorStore.getState();
    if (editorState.simDrag?.tempJointId) {
      removeTempJoint(editorState.simDrag.tempJointId);
      editorState.setSimDrag(null);
    }

    if (newMode === 'simulate') {
      const positions: Record<string, Vec2> = {};
      for (const [id, joint] of Object.entries(joints)) {
        if (id.startsWith('__temp_')) continue; // skip temp joints
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
      <div className="toolbar-section">
        <div className="toolbar-label">File</div>
        <button className="tool-btn" onClick={handleSave}>Save</button>
        <button className="tool-btn" onClick={handleOpen}>Open</button>
      </div>

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
            {createTool === 'joints' && (
              <div className="sub-tools">
                <button
                  className={`tool-btn sub ${jointMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setJointMode('manual')}
                >
                  Manual
                </button>
                <button
                  className={`tool-btn sub ${jointMode === 'autochain' ? 'active' : ''}`}
                  onClick={() => setJointMode('autochain')}
                >
                  Auto Chain
                </button>
              </div>
            )}
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
            {hasSelection && (
              <button
                className="tool-btn"
                onClick={handleDeleteSelected}
                title="Delete selected (Backspace)"
                style={{ color: '#E53935' }}
              >
                Delete
              </button>
            )}
            <button
              className="tool-btn"
              onClick={() => { if (confirm('Clear everything?')) { clearAll(); clearSelection(); } }}
              title="Clear all joints, bodies, and outlines"
              style={{ color: '#f66', marginTop: 4 }}
            >
              Clear All
            </button>
          </div>

          <div className="toolbar-section">
            {createTool === 'joints' && jointMode === 'manual' ? (
              <>
                <div className="sim-hint">Click to add joint</div>
                <div className="sim-hint">Click joint to select</div>
                <div className="sim-hint">Double-click to toggle fixed</div>
              </>
            ) : createTool === 'joints' && jointMode === 'autochain' ? (
              <>
                <div className="sim-hint">Click to place chain joints</div>
                <div className="sim-hint">Click existing joint to end chain</div>
                <div className="sim-hint">Escape to stop</div>
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
          <div className="sim-hint">Click & drag joints, links, or shapes to apply force</div>
          <div className="sim-hint">Middle-click to pan</div>
          <div className="sim-hint">Scroll to zoom</div>
        </div>
      )}

      <div style={{ marginTop: 'auto', padding: '8px', borderTop: '1px solid #333' }}>
        <div style={{ fontSize: 9, color: '#666', lineHeight: 1.4 }}>
          Slinker v0.2.0
        </div>
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4 }}>
          VibeCoded by Hugo Wilson
        </div>
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4 }}>
          Claude Opus 4.6
        </div>
      </div>
    </div>
  );
}
