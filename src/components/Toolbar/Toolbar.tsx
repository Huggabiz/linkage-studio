import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode } from '../../types';
import type { Vec2 } from '../../types';
import { screenToWorld } from '../../renderer/camera';
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
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const regenerateLinks = useMechanismStore((s) => s.regenerateLinks);
  const removeTempJoint = useMechanismStore((s) => s.removeTempJoint);
  const addImage = useMechanismStore((s) => s.addImage);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);

  const hasSelection = selectedIds.size > 0;
  const handleDeleteSelected = () => {
    for (const id of selectedIds) {
      if (joints[id]) removeJoint(id);
      else if (outlines[id]) removeOutline(id);
      else if (images[id]) removeImage(id);
    }
    clearSelection();
  };

  const handleModeSwitch = (newMode: AppMode) => {
    if (newMode === mode) return;

    const editorState = useEditorStore.getState();
    if (editorState.simDrag?.tempJointId) {
      removeTempJoint(editorState.simDrag.tempJointId);
      editorState.setSimDrag(null);
    }

    if (newMode === 'simulate') {
      if (editorState.lockOutlines && editorState.frozenOutlineWorldPoints.size > 0) {
        useMechanismStore.getState().reprojectOutlinesFromWorld(editorState.frozenOutlineWorldPoints);
        editorState.setLockOutlines(false);
      }

      const currentJoints = useMechanismStore.getState().joints;
      const positions: Record<string, Vec2> = {};
      for (const [id, joint] of Object.entries(currentJoints)) {
        if (id.startsWith('__temp_')) continue;
        positions[id] = { ...joint.position };
      }
      setSavedPositions(positions);
      regenerateLinks();
    } else {
      if (savedPositions) {
        const currentJoints = useMechanismStore.getState().joints;
        for (const [id, pos] of Object.entries(savedPositions)) {
          if (currentJoints[id]) {
            moveJoint(id, pos);
          }
        }
        setSavedPositions(null);
        regenerateLinks();
      }
    }

    setMode(newMode);
  };

  const handleImportImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/bmp,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          // Place image at current camera center
          const camera = useEditorStore.getState().camera;
          const canvas = document.querySelector('canvas');
          let center: Vec2 = { x: 0, y: 0 };
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            center = screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, camera);
          }
          const id = addImage(baseBodyId, dataUrl, img.naturalWidth, img.naturalHeight, center);
          useEditorStore.getState().select(id);
          setCreateTool('image');
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    };
    input.click();
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
            <button
              className={`tool-btn ${createTool === 'image' ? 'active' : ''}`}
              onClick={() => {
                if (createTool === 'image') {
                  // Already in image mode - open file picker to add another
                  handleImportImage();
                } else {
                  setCreateTool('image');
                  // If no images exist yet, auto-open the file picker
                  const hasImages = Object.keys(useMechanismStore.getState().images).length > 0;
                  if (!hasImages) handleImportImage();
                }
              }}
            >
              Image
            </button>
          </div>

          {hasSelection && (
            <div className="toolbar-section">
              <button
                className="tool-btn"
                onClick={handleDeleteSelected}
                title="Delete selected (Backspace)"
                style={{ color: '#E53935' }}
              >
                Delete
              </button>
            </div>
          )}

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
            ) : createTool === 'outline' ? (
              <>
                <div className="sim-hint">Click to place outline points</div>
                <div className="sim-hint">Click first point to close</div>
                <div className="sim-hint">Escape to cancel</div>
              </>
            ) : (
              <>
                <div className="sim-hint">Click image to select</div>
                <div className="sim-hint">Drag to move</div>
                <div className="sim-hint">Drag corners to scale</div>
                <div className="sim-hint">Drag top handle to rotate</div>
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
