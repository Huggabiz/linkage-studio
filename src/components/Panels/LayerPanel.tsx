import { useMechanismStore } from '../../store/mechanism-store';

export function LayerPanel() {
  const layers = useMechanismStore((s) => s.layers);
  const activeLayerId = useMechanismStore((s) => s.activeLayerId);
  const setActiveLayer = useMechanismStore((s) => s.setActiveLayer);
  const addLayer = useMechanismStore((s) => s.addLayer);
  const toggleLayerVisibility = useMechanismStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useMechanismStore((s) => s.toggleLayerLock);
  const removeLayer = useMechanismStore((s) => s.removeLayer);

  const sortedLayers = Object.values(layers).sort((a, b) => a.depth - b.depth);

  return (
    <div className="panel-content">
      <div className="panel-title">
        Layers
        <button
          className="panel-action-btn"
          onClick={() => addLayer(`Layer ${sortedLayers.length + 1}`)}
          title="Add Layer"
        >
          +
        </button>
      </div>
      {sortedLayers.map((layer) => (
        <div
          key={layer.id}
          className={`layer-row ${layer.id === activeLayerId ? 'active' : ''}`}
          onClick={() => setActiveLayer(layer.id)}
        >
          <span
            className="layer-color"
            style={{ background: layer.color }}
          />
          <span className="layer-name">{layer.name}</span>
          <button
            className="layer-btn"
            onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
            title={layer.visible ? 'Hide' : 'Show'}
          >
            {layer.visible ? 'V' : '-'}
          </button>
          <button
            className="layer-btn"
            onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }}
            title={layer.locked ? 'Unlock' : 'Lock'}
          >
            {layer.locked ? 'L' : 'U'}
          </button>
          {sortedLayers.length > 1 && (
            <button
              className="layer-btn danger"
              onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
              title="Delete"
            >
              x
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
