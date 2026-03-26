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

/* ---- Mode icons for collapsed toolbar ---- */

/* Create: set-square / drafting tool */
const IconCreateMode = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16L3 4L13 16Z" />
    <line x1="3" y1="10" x2="8.5" y2="10" />
    <line x1="14" y1="3" x2="16" y2="5" />
    <line x1="15" y1="4" x2="10" y2="9" />
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

/* ---- Tool icons (reused from Toolbar but smaller for collapsed state) ---- */
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

const IconImageSmall = () => (
  <svg width="18" height="18" viewBox="0 0 16 16">
    <rect x="2" y="3" width="12" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="5.5" cy="6.5" r="1.3" fill="currentColor" />
    <polyline points="2,11 5,8.5 7.5,10 10.5,6.5 14,9.5" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

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
          let center = { x: 0, y: 0 };
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
    <div className="app-layout">
      <TopBar />
      <div className="app-main">

        {/* ---- LEFT TOOLBAR ---- */}
        {leftCollapsed ? (
          <div className="toolbar-collapsed">
            {/* Expand arrow */}
            <button className="collapse-btn" onClick={toggleLeft} title="Expand toolbar">
              <ChevronIcon direction="right" />
            </button>

            {/* Mode toggle (joined pair) */}
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

            {/* Tools (create mode only) */}
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
