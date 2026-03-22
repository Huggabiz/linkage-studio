import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint } from '../../types';

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const joints = useMechanismStore((s) => s.joints);
  const moveJoint = useMechanismStore((s) => s.moveJoint);
  const removeJoint = useMechanismStore((s) => s.removeJoint);

  if (selectedIds.size === 0) {
    return null;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;

  if (!joint) return null;

  return (
    <div className="panel-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0 }}>Joint</div>
        <button
          className="tool-btn"
          style={{ fontSize: 10, padding: '2px 6px', color: '#E53935' }}
          onClick={() => { removeJoint(joint.id); clearSelection(); }}
          title="Delete joint (Backspace)"
        >
          Delete
        </button>
      </div>
      <div className="panel-info" style={{ fontStyle: 'italic', opacity: 0.7 }}>
        {joint.type === 'fixed' ? 'Fixed (Base)' : 'Revolute'}
      </div>
      <label>
        X
        <input
          type="number"
          value={joint.position.x.toFixed(1)}
          onChange={(e) => moveJoint(joint.id, { x: +e.target.value, y: joint.position.y })}
        />
      </label>
      <label>
        Y
        <input
          type="number"
          value={joint.position.y.toFixed(1)}
          onChange={(e) => moveJoint(joint.id, { x: joint.position.x, y: +e.target.value })}
        />
      </label>
    </div>
  );
}
