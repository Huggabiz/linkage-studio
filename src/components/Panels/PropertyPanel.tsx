import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import type { Joint, Link, JointType } from '../../types';

export function PropertyPanel() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const updateJointType = useMechanismStore((s) => s.updateJointType);
  const moveJoint = useMechanismStore((s) => s.moveJoint);

  if (selectedIds.size === 0) {
    return <div className="panel-empty">Select a joint or link to see properties</div>;
  }

  const id = [...selectedIds][0];
  const joint = joints[id] as Joint | undefined;
  const link = links[id] as Link | undefined;

  if (joint) {
    return (
      <div className="panel-content">
        <div className="panel-title">Joint</div>
        <label>
          Type
          <select
            value={joint.type}
            onChange={(e) => updateJointType(joint.id, e.target.value as JointType)}
          >
            <option value="revolute">Revolute</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
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
        <div className="panel-info">
          Links: {joint.connectedLinkIds.length}
        </div>
      </div>
    );
  }

  if (link) {
    const jA = joints[link.jointIds[0]];
    const jB = joints[link.jointIds[1]];
    return (
      <div className="panel-content">
        <div className="panel-title">Link</div>
        <div className="panel-info">Length: {link.restLength.toFixed(1)}</div>
        <div className="panel-info">Mass: {link.mass}</div>
        {jA && <div className="panel-info">Joint A: ({jA.position.x.toFixed(0)}, {jA.position.y.toFixed(0)})</div>}
        {jB && <div className="panel-info">Joint B: ({jB.position.x.toFixed(0)}, {jB.position.y.toFixed(0)})</div>}
      </div>
    );
  }

  return null;
}
