import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint, Outline } from '../../types';

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const bodies = useMechanismStore((s) => s.bodies);
  const moveJoint = useMechanismStore((s) => s.moveJoint);

  if (selectedIds.size === 0) {
    return null;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;
  const outline = outlines[id] as Outline | undefined;

  if (joint) {
    return (
      <div className="panel-content">
        <div className="panel-title">Joint</div>
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

  if (outline) {
    const body = bodies[outline.bodyId];
    return (
      <div className="panel-content">
        <div className="panel-title">Outline</div>
        <div className="panel-info">Body: {body?.name ?? 'Unknown'}</div>
        <div className="panel-info">{outline.points.length} vertices</div>
      </div>
    );
  }

  return null;
}
