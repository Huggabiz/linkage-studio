import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { AppMode } from '../../types';
import { screenToWorld } from '../../renderer/camera';
import type { Vec2 } from '../../types';
import { switchMode } from '../../utils/mode-switch';
import './Toolbar.css';

/* Inline SVG tool icons (16×16 viewBox) */
const IconPivot = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
);

const IconSlider = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="13" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="6" y="5" width="4" height="6" rx="1" fill="currentColor" opacity="0.6" />
  </svg>
);

const IconCollider = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <line x1="1" y1="11" x2="3" y2="15" stroke="currentColor" strokeWidth="1.2" />
    <line x1="13" y1="1" x2="15" y2="5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const IconTracer = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <line x1="8" y1="1" x2="8" y2="5" stroke="currentColor" strokeWidth="1.2" />
    <line x1="8" y1="11" x2="8" y2="15" stroke="currentColor" strokeWidth="1.2" />
    <line x1="1" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1.2" />
    <line x1="11" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </svg>
);

const IconOutline = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <polygon points="8,1 14,5 12,13 4,13 2,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const IconImage = () => (
  <svg className="tool-icon-svg" viewBox="0 0 16 16" width="16" height="16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5" cy="6" r="1.5" fill="currentColor" />
    <polyline points="1.5,11 5,8 8,10 11,6 14.5,9.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

export function Toolbar() {
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const setMode = useEditorStore((s) => s.setMode);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addImage = useMechanismStore((s) => s.addImage);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);

  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);
  const removeOutlineVertex = useMechanismStore((s) => s.removeOutlineVertex);
  const setEditingVertexIndex = useEditorStore((s) => s.setEditingVertexIndex);

  const hasSelection = selectedIds.size > 0;
  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  const canDeleteVertex = hasVertexSelection && (() => {
    const outline = outlines[editingOutlineId!];
    return outline && outline.points.length > 3;
  })();

  const handleDeleteSelected = () => {
    if (hasVertexSelection && canDeleteVertex) {
      removeOutlineVertex(editingOutlineId!, editingVertexIndex!);
      setEditingVertexIndex(null);
      return;
    }
    for (const id of selectedIds) {
      if (joints[id]) removeJoint(id);
      else if (outlines[id]) removeOutline(id);
      else if (images[id]) removeImage(id);
    }
    clearSelection();
  };

  const handleModeSwitch = (newMode: AppMode) => switchMode(newMode);

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

  const isPivotTool = createTool === 'joints';
  const isSliderTool = createTool === 'slider';
  const isColliderTool = createTool === 'collider';
  const isTracerTool = createTool === 'tracer';
  const isJointsTool = isPivotTool || isSliderTool || isColliderTool;

  const renderHints = () => {
    if (isPivotTool) {
      return (
        <>
          <div className="sim-hint">Click to add pivot joint</div>
          <div className="sim-hint">Hold to assign bodies</div>
          <div className="sim-hint">Double-click to toggle fixed</div>
        </>
      );
    }
    if (isSliderTool) {
      return (
        <>
          <div className="sim-hint">Click to place end A</div>
          <div className="sim-hint">Click again to place end C</div>
          <div className="sim-hint">Slider B auto-placed at midpoint</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    if (isTracerTool) {
      return (
        <>
          <div className="sim-hint">Select a body, then click to place</div>
          <div className="sim-hint">Traces path during simulation</div>
          <div className="sim-hint">Hold on tracer to change body</div>
        </>
      );
    }
    if (isColliderTool) {
      return (
        <>
          <div className="sim-hint">Click to place end A</div>
          <div className="sim-hint">Click again to place end C</div>
          <div className="sim-hint">Select barrier line to assign bodies</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    if (createTool === 'outline') {
      return (
        <>
          <div className="sim-hint">Click to place outline points</div>
          <div className="sim-hint">Click first point to close</div>
          <div className="sim-hint">Escape to cancel</div>
        </>
      );
    }
    // image
    return (
      <>
        <div className="sim-hint">Click image to select</div>
        <div className="sim-hint">Drag to move</div>
        <div className="sim-hint">Drag corners to scale</div>
        <div className="sim-hint">Drag top handle to rotate</div>
      </>
    );
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

            {/* Joints group */}
            <div className="toolbar-group-label">Joints</div>

            <button
              className={`tool-btn ${isPivotTool ? 'active' : ''}`}
              onClick={() => setCreateTool('joints')}
            >
              <IconPivot />
              <span className="tool-name">Pivot</span>
            </button>

            <button
              className={`tool-btn ${isSliderTool ? 'active' : ''}`}
              onClick={() => setCreateTool('slider')}
            >
              <IconSlider />
              <span className="tool-name">Slider</span>
            </button>

            <button
              className={`tool-btn ${isColliderTool ? 'active' : ''}`}
              onClick={() => setCreateTool('collider')}
            >
              <IconCollider />
              <span className="tool-name">Collider</span>
            </button>

            {/* Shapes group */}
            <div className="toolbar-group-label">Shapes</div>

            <button
              className={`tool-btn ${createTool === 'outline' ? 'active' : ''}`}
              onClick={() => setCreateTool('outline')}
            >
              <IconOutline />
              <span className="tool-name">Outline</span>
            </button>

            <button
              className={`tool-btn ${createTool === 'image' ? 'active' : ''}`}
              onClick={() => {
                if (createTool === 'image') {
                  handleImportImage();
                } else {
                  setCreateTool('image');
                  const hasImages = Object.keys(useMechanismStore.getState().images).length > 0;
                  if (!hasImages) handleImportImage();
                }
              }}
            >
              <IconImage />
              <span className="tool-name">Image</span>
            </button>

            {/* Sensors group */}
            <div className="toolbar-group-label">Sensors</div>

            <button
              className={`tool-btn ${isTracerTool ? 'active' : ''}`}
              onClick={() => setCreateTool('tracer')}
            >
              <IconTracer />
              <span className="tool-name">Path Plotter</span>
            </button>
          </div>

          {(hasSelection || hasVertexSelection) && (
            <div className="toolbar-section">
              <button
                className="tool-btn"
                onClick={handleDeleteSelected}
                title={hasVertexSelection ? 'Delete vertex (Backspace)' : 'Delete selected (Backspace)'}
                style={{ color: '#E53935' }}
                disabled={hasVertexSelection && !canDeleteVertex}
              >
                {hasVertexSelection ? 'Delete Vertex' : 'Delete'}
              </button>
            </div>
          )}

          <div className="toolbar-section">
            {renderHints()}
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
