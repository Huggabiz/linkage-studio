import { MechanismCanvas } from './Canvas/MechanismCanvas';
import { TopBar } from './TopBar/TopBar';
import { Toolbar } from './Toolbar/Toolbar';
import { BodyPanel } from './Panels/BodyPanel';
import { PropertyPanel } from './Panels/PropertyPanel';
import { SimulationPanel } from './Panels/SimulationPanel';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { switchMode } from '../utils/mode-switch';
import { screenToWorld } from '../renderer/camera';
import './Layout.css';

/* ---- Shared chevron icon ---- */
const ChevronIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    {direction === 'left' ? (
      <path d="M8 1L3 6L8 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M4 1L9 6L4 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

/* ---- Mode icons ---- */

/* Create: pencil */
const IconCreateMode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.5 2.5L15.5 5.5L6 15H3V12L12.5 2.5Z" />
    <line x1="10.5" y1="4.5" x2="13.5" y2="7.5" />
  </svg>
);

/* Simulate: figure with motion lines */
const IconSimulateMode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="4" r="2" />
    <path d="M9 7L11 10L13 8" />
    <line x1="11" y1="10" x2="10" y2="15" />
    <line x1="11" y1="10" x2="13" y2="15" />
    <line x1="3" y1="6" x2="7" y2="6" />
    <line x1="2" y1="9" x2="6" y2="9" />
    <line x1="3" y1="12" x2="7" y2="12" />
  </svg>
);

/* ---- Tool icons for collapsed toolbar ---- */
const IconPivotSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="8" cy="8" r="1.8" fill="currentColor" />
  </svg>
);

const IconSliderSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="3" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1" />
    <circle cx="13" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1" />
    <rect x="6.5" y="5.5" width="3" height="5" rx="0.8" fill="currentColor" opacity="0.5" />
  </svg>
);

const IconOutlineSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <polygon points="8,1.5 13.5,5 11.5,12.5 4.5,12.5 2.5,5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const IconColliderSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <line x1="2" y1="13" x2="14" y2="3" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 2" />
    <line x1="1" y1="11" x2="3" y2="15" stroke="currentColor" strokeWidth="1" />
    <line x1="13" y1="1" x2="15" y2="5" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const IconTracerSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1" />
    <line x1="8" y1="2" x2="8" y2="5" stroke="currentColor" strokeWidth="1" />
    <line x1="8" y1="11" x2="8" y2="14" stroke="currentColor" strokeWidth="1" />
    <line x1="2" y1="8" x2="5" y2="8" stroke="currentColor" strokeWidth="1" />
    <line x1="11" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
  </svg>
);

const IconImageSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <rect x="2" y="3" width="12" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.5" cy="6.5" r="1.3" fill="currentColor" />
    <polyline points="2,11 5,8.5 7.5,10 10.5,6.5 14,9.5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

/* ---- Delete button for collapsed toolbar ---- */
function CollapsedDeleteButton() {
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const removeJoint = useMechanismStore((s) => s.removeJoint);
  const removeOutline = useMechanismStore((s) => s.removeOutline);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const removeTracer = useMechanismStore((s) => s.removeTracer);
  const removeOutlineVertex = useMechanismStore((s) => s.removeOutlineVertex);
  const tracers = useMechanismStore((s) => s.tracers);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);
  const setEditingVertexIndex = useEditorStore((s) => s.setEditingVertexIndex);

  const hasVertexSelection = editingOutlineId !== null && editingVertexIndex !== null;
  const canDeleteVertex = hasVertexSelection && (() => {
    const outline = outlines[editingOutlineId!];
    return outline && outline.points.length > 3;
  })();

  const handleDelete = () => {
    if (hasVertexSelection && canDeleteVertex) {
      removeOutlineVertex(editingOutlineId!, editingVertexIndex!);
      setEditingVertexIndex(null);
      return;
    }
    for (const id of selectedIds) {
      if (joints[id]) removeJoint(id);
      else if (outlines[id]) removeOutline(id);
      else if (images[id]) removeImage(id);
      else if (tracers[id]) removeTracer(id);
    }
    clearSelection();
  };

  const isDisabled = hasVertexSelection && !canDeleteVertex;
  const title = hasVertexSelection ? 'Delete vertex' : 'Delete selected';

  return (
    <button
      className="collapsed-tool-btn delete"
      onClick={handleDelete}
      disabled={isDisabled}
      title={title}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 5H15" />
        <path d="M5 5V15C5 15.6 5.4 16 6 16H12C12.6 16 13 15.6 13 15V5" />
        <path d="M7 3V2H11V3" />
        <line x1="8" y1="8" x2="8" y2="13" />
        <line x1="10" y1="8" x2="10" y2="13" />
      </svg>
    </button>
  );
}

/* ---- Mini body list for collapsed right panel ---- */
function CollapsedBodyList() {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const colliders = useMechanismStore((s) => s.colliders);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const addBody = useMechanismStore((s) => s.addBody);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBodyToCollider = useMechanismStore((s) => s.addBodyToCollider);
  const removeBodyFromCollider = useMechanismStore((s) => s.removeBodyFromCollider);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
  const setActiveBody = useEditorStore((s) => s.setActiveBody);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const createTool = useEditorStore((s) => s.createTool);

  const isOutlineMode = createTool === 'outline' || createTool === 'tracer';
  const selectedJointId = [...selectedIds].find((id) => joints[id]);
  const selectedColliderId = [...selectedIds].find((id) => colliders[id]);
  const selectedCollider = selectedColliderId ? colliders[selectedColliderId] : null;

  const bodyList = Object.values(bodies);
  bodyList.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  const handleBodyClick = (bodyId: string) => {
    if (isOutlineMode) {
      setActiveBody(bodyId);
    } else if (selectedColliderId && selectedCollider) {
      if (selectedCollider.bodyIds.includes(bodyId)) removeBodyFromCollider(selectedColliderId, bodyId);
      else addBodyToCollider(selectedColliderId, bodyId);
    } else if (selectedJointId) {
      const body = bodies[bodyId];
      if (body.jointIds.includes(selectedJointId)) removeJointFromBody(selectedJointId, bodyId);
      else addJointToBody(selectedJointId, bodyId);
    } else {
      toggleActiveBody(bodyId);
    }
  };

  const isChecked = (bodyId: string): boolean => {
    if (isOutlineMode) return activeBodyIds.has(bodyId);
    if (selectedColliderId && selectedCollider) return selectedCollider.bodyIds.includes(bodyId);
    if (selectedJointId) return bodies[bodyId]?.jointIds.includes(selectedJointId) ?? false;
    return activeBodyIds.has(bodyId);
  };

  return (
    <>
      <button
        className="collapsed-add-body"
        onClick={() => addBody('Body')}
        title="Add body"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" />
          <line x1="2" y1="7" x2="12" y2="7" />
        </svg>
      </button>
      <div className="collapsed-divider-h" />
      {bodyList.map((body) => {
        const checked = isChecked(body.id);
        return (
          <button
            key={body.id}
            className={`collapsed-body-dot ${checked ? 'active' : ''}`}
            onClick={() => handleBodyClick(body.id)}
            title={body.name}
          >
            <span className="body-dot" style={{ background: body.color }} />
            {checked && (
              <svg width="8" height="8" viewBox="0 0 10 10" className="body-check">
                {isOutlineMode ? (
                  <circle cx="5" cy="5" r="3" fill="#fff" />
                ) : (
                  <polyline points="2,5 4.5,8 8,2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            )}
          </button>
        );
      })}
    </>
  );
}

export function Layout() {
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightCollapsed);
  const toggleLeft = useEditorStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useEditorStore((s) => s.toggleRightCollapsed);
  const mode = useEditorStore((s) => s.mode);
  const createTool = useEditorStore((s) => s.createTool);
  const setCreateTool = useEditorStore((s) => s.setCreateTool);
  const addImage = useMechanismStore((s) => s.addImage);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const editingOutlineId = useEditorStore((s) => s.editingOutlineId);
  const editingVertexIndex = useEditorStore((s) => s.editingVertexIndex);

  const handleImportImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/bmp,image/webp';
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { cleanup(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const camera = useEditorStore.getState().camera;
          const canvas = document.querySelector('canvas');
          let center = { x: 0, y: 0 };
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            center = screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, camera);
          }
          const id = addImage(baseBodyId, dataUrl, img.naturalWidth, img.naturalHeight, center);
          useEditorStore.getState().select(id);
          setCreateTool('image');
          cleanup();
        };
        img.onerror = cleanup;
        img.src = dataUrl;
      };
      reader.onerror = cleanup;
      reader.readAsDataURL(file);
    });
    input.click();
  };

  return (
    <div className="app-layout">
      <TopBar />
      <div className="app-main">

        {/* ---- LEFT TOOLBAR ---- */}
        {leftCollapsed ? (
          <div className="toolbar-collapsed">
            <button className="collapse-btn" onClick={toggleLeft} title="Expand toolbar">
              <ChevronIcon direction="right" />
            </button>

            <div className="collapsed-mode-group">
              <button
                className={`collapsed-mode-btn top ${mode === 'create' ? 'active' : ''}`}
                onClick={() => switchMode('create')}
                title="Create mode"
              >
                <IconCreateMode />
              </button>
              <button
                className={`collapsed-mode-btn bottom simulate ${mode === 'simulate' ? 'active' : ''}`}
                onClick={() => switchMode('simulate')}
                title="Simulate mode"
              >
                <IconSimulateMode />
              </button>
            </div>

            {mode === 'create' && (
              <>
                <div className="collapsed-divider" />
                <div className="collapsed-group-label">Joints</div>
                <button
                  className={`collapsed-tool-btn ${createTool === 'joints' ? 'active' : ''}`}
                  onClick={() => setCreateTool('joints')}
                  title="Pivot joint"
                >
                  <IconPivotSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'slider' ? 'active' : ''}`}
                  onClick={() => setCreateTool('slider')}
                  title="Slider joint"
                >
                  <IconSliderSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'collider' ? 'active' : ''}`}
                  onClick={() => setCreateTool('collider')}
                  title="Collider barrier"
                >
                  <IconColliderSmall />
                </button>

                <div className="collapsed-divider" />
                <div className="collapsed-group-label">Shapes</div>
                <button
                  className={`collapsed-tool-btn ${createTool === 'outline' ? 'active' : ''}`}
                  onClick={() => setCreateTool('outline')}
                  title="Outline"
                >
                  <IconOutlineSmall />
                </button>
                <button
                  className={`collapsed-tool-btn ${createTool === 'image' ? 'active' : ''}`}
                  onClick={() => {
                    if (createTool === 'image') {
                      handleImportImage();
                    } else {
                      setCreateTool('image');
                      const hasImages = Object.keys(useMechanismStore.getState().images).length > 0;
                      if (!hasImages) handleImportImage();
                    }
                  }}
                  title="Image"
                >
                  <IconImageSmall />
                </button>

                <div className="collapsed-divider" />
                <div className="collapsed-group-label">Sensors</div>
                <button
                  className={`collapsed-tool-btn ${createTool === 'tracer' ? 'active' : ''}`}
                  onClick={() => setCreateTool('tracer')}
                  title="Path Plotter"
                >
                  <IconTracerSmall />
                </button>

                {/* Delete button — shown when a joint/outline/image or vertex is selected */}
                {(selectedIds.size > 0 || (editingOutlineId !== null && editingVertexIndex !== null)) && (
                  <>
                    <div className="collapsed-divider" />
                    <CollapsedDeleteButton />
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="toolbar-wrapper">
            <div className="collapse-header">
              <button className="collapse-btn" onClick={toggleLeft} title="Collapse toolbar">
                <ChevronIcon direction="left" />
              </button>
            </div>
            <Toolbar />
          </div>
        )}

        {/* ---- CANVAS ---- */}
        <div className="canvas-container">
          <MechanismCanvas />
        </div>

        {/* ---- RIGHT PANEL ---- */}
        {rightCollapsed ? (
          <div className="panel-collapsed">
            <button className="collapse-btn" onClick={toggleRight} title="Expand panel">
              <ChevronIcon direction="left" />
            </button>
            {mode === 'create' && <CollapsedBodyList />}
          </div>
        ) : (
          <div className="right-panel">
            <div className="collapse-header right">
              <button className="collapse-btn" onClick={toggleRight} title="Collapse panel">
                <ChevronIcon direction="right" />
              </button>
            </div>
            <BodyPanel />
            <PropertyPanel />
            <SimulationPanel />
          </div>
        )}
      </div>
    </div>
  );
}
