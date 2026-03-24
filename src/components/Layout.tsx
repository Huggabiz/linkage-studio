import { MechanismCanvas } from './Canvas/MechanismCanvas';
import { TopBar } from './TopBar/TopBar';
import { Toolbar } from './Toolbar/Toolbar';
import { BodyPanel } from './Panels/BodyPanel';
import { PropertyPanel } from './Panels/PropertyPanel';
import { SimulationPanel } from './Panels/SimulationPanel';
import './Layout.css';

export function Layout() {
  return (
    <div className="app-layout">
      <TopBar />
      <div className="app-main">
        <Toolbar />
        <div className="canvas-container">
          <MechanismCanvas />
        </div>
        <div className="right-panel">
          <BodyPanel />
          <PropertyPanel />
          <SimulationPanel />
        </div>
      </div>
    </div>
  );
}
