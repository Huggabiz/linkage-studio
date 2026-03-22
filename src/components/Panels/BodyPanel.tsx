import { useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { BODY_COLORS } from '../../utils/constants';

export function BodyPanel() {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const removeBody = useMechanismStore((s) => s.removeBody);
  const renameBody = useMechanismStore((s) => s.renameBody);
  const setBodyColor = useMechanismStore((s) => s.setBodyColor);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBody = useMechanismStore((s) => s.addBody);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  const [editingId, setEditingId] = useState<string | null>(null);

  const usedColors = new Set(Object.values(bodies).map((b) => b.color));

  // Find selected joint (if any)
  const selectedJointId = [...selectedIds].find((id) => joints[id]);

  const bodyList = Object.values(bodies);
  bodyList.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  return (
    <div className="panel-content">
      <div className="panel-title">Bodies</div>
      {bodyList.map((body) => {
        const isActive = activeBodyIds.has(body.id);
        const isBase = body.id === baseBodyId;
        const isEditing = editingId === body.id;
        const jointInBody = selectedJointId ? body.jointIds.includes(selectedJointId) : false;

        return (
          <div
            key={body.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 6px', marginBottom: 2, borderRadius: 4,
              backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              cursor: 'pointer',
            }}
            onClick={() => toggleActiveBody(body.id)}
          >
            {/* Checkbox: if joint selected → body membership; if no joint → active body for placement */}
            <input
              type="checkbox"
              checked={selectedJointId ? jointInBody : isActive}
              onChange={(e) => {
                e.stopPropagation();
                if (selectedJointId) {
                  if (jointInBody) {
                    removeJointFromBody(selectedJointId, body.id);
                  } else {
                    addJointToBody(selectedJointId, body.id);
                  }
                } else {
                  toggleActiveBody(body.id);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0, cursor: 'pointer' }}
            />

            {/* Color swatch */}
            <span
              style={{
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                backgroundColor: body.color, flexShrink: 0,
                border: isActive ? '2px solid #fff' : '2px solid transparent',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isBase) return;
                const available = BODY_COLORS.filter((c) => !usedColors.has(c) || c === body.color);
                const idx = available.indexOf(body.color);
                const next = available[(idx + 1) % available.length];
                if (next !== body.color) setBodyColor(body.id, next);
              }}
              title={isBase ? 'Base body color' : 'Click to change color'}
            />

            {/* Name — editable only when edit mode is active */}
            {isEditing ? (
              <input
                autoFocus
                value={body.name}
                onChange={(e) => renameBody(body.id, e.target.value)}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => { if (e.key === 'Enter') setEditingId(null); }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid #666',
                  color: 'inherit', outline: 'none', padding: '0 4px', borderRadius: 2,
                }}
              />
            ) : (
              <span style={{ flex: 1, fontSize: 12, fontWeight: isBase ? 600 : 400 }}>
                {body.name}
              </span>
            )}

            {/* Joint count */}
            <span style={{ fontSize: 10, opacity: 0.6 }}>{body.jointIds.length}j</span>

            {/* Edit + Delete buttons (not for base) */}
            {!isBase && !isEditing && (
              <button
                className="tool-btn"
                style={{ fontSize: 10, padding: '1px 4px' }}
                onClick={(e) => { e.stopPropagation(); setEditingId(body.id); }}
                title="Rename body"
              >
                e
              </button>
            )}
            {!isBase && (
              <button
                className="tool-btn"
                style={{ fontSize: 10, padding: '1px 4px' }}
                onClick={(e) => { e.stopPropagation(); removeBody(body.id); }}
                title="Delete body"
              >
                x
              </button>
            )}
          </div>
        );
      })}

      {/* Add body button at bottom */}
      <button
        className="tool-btn"
        style={{ marginTop: 4, width: '100%', textAlign: 'center' }}
        onClick={() => addBody('Body')}
      >
        + Add Body
      </button>

      <label style={{ marginTop: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={useEditorStore((s) => s.showLinks)}
          onChange={() => useEditorStore.getState().toggleShowLinks()}
        />
        Show links
      </label>
    </div>
  );
}
