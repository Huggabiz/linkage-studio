import { MechanismCanvas } from './Canvas/MechanismCanvas';
import { TopBar } from './TopBar/TopBar';
import { Toolbar } from './Toolbar/Toolbar';
import { BodyPanel } from './Panels/BodyPanel';
import { PropertyPanel } from './Panels/PropertyPanel';
import { SimulationPanel } from './Panels/SimulationPanel';
import { useEditorStore } from '../store/editor-store';
import './Layout.css';

const CollapseIcon = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
    {direction === 'left' ? (
      <path d="M8 1L3 6L8 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M4 1L9 6L4 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

/* Compact mode icons for Create/Simulate */
const IconCreate = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="9" r="6" />
    <line x1="9" y1="5" x2="9" y2="13" />
    <line x1="5" y1="9" x2="13" y2="9" />
  </svg>
);

const IconSimulate = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="5,3 15,9 5,15" fill="currentColor" stroke="none" />
  </svg>
);

export function Layout() {
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightCollapsed);
  const toggleLeft = useEditorStore((s) => s.toggleLeftCollapsed);
  const toggleRight = useEditorStore((s) => s.toggleRightCollapsed);
  const mode = useEditorStore((s) => s.mode);
  const setMode = useEditorStore((s) => s.setMode);

  return (
    <div className="app-layout">
      <TopBar />
      <div className="app-main">
        {leftCollapsed ? (
          <div className="toolbar-collapsed">
            <button
              className={`collapsed-mode-btn ${mode === 'create' ? 'active' : ''}`}
              onClick={() => { toggleLeft(); }}
              title="Create mode — expand toolbar"
            >
              <IconCreate />
            </button>
            <button
              className={`collapsed-mode-btn simulate ${mode === 'simulate' ? 'active' : ''}`}
              onClick={() => { toggleLeft(); }}
              title="Simulate mode — expand toolbar"
            >
              <IconSimulate />
            </button>
            <div style={{ flex: 1 }} />
            <button className="collapse-btn" onClick={toggleLeft} title="Expand toolbar">
              <CollapseIcon direction="right" />
            </button>
          </div>
        ) : (
          <div className="toolbar-wrapper">
            <Toolbar />
            <button className="collapse-btn toolbar-collapse" onClick={toggleLeft} title="Collapse toolbar">
              <CollapseIcon direction="left" />
            </button>
          </div>
        )}
        <div className="canvas-container">
          <MechanismCanvas />
        </div>
        {rightCollapsed ? (
          <div className="panel-collapsed">
            <button className="collapse-btn" onClick={toggleRight} title="Expand panel">
              <CollapseIcon direction="left" />
            </button>
          </div>
        ) : (
          <div className="right-panel">
            <button className="collapse-btn panel-collapse" onClick={toggleRight} title="Collapse panel">
              <CollapseIcon direction="right" />
            </button>
            <BodyPanel />
            <PropertyPanel />
            <SimulationPanel />
          </div>
        )}
      </div>
    </div>
  );
}
