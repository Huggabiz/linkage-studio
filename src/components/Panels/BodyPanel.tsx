import { useState } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { BODY_COLORS } from '../../utils/constants';

export function BodyPanel() {
  const bodies = useMechanismStore((s) => s.bodies);
  const joints = useMechanismStore((s) => s.joints);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const removeBody = useMechanismStore((s) => s.removeBody);
  const renameBody = useMechanismStore((s) => s.renameBody);
  const setBodyColor = useMechanismStore((s) => s.setBodyColor);
  const addJointToBody = useMechanismStore((s) => s.addJointToBody);
  const removeJointFromBody = useMechanismStore((s) => s.removeJointFromBody);
  const addBody = useMechanismStore((s) => s.addBody);
  const toggleOutlineCOM = useMechanismStore((s) => s.toggleOutlineCOM);
  const updateImage = useMechanismStore((s) => s.updateImage);
  const removeImage = useMechanismStore((s) => s.removeImage);
  const activeBodyIds = useEditorStore((s) => s.activeBodyIds);
  const toggleActiveBody = useEditorStore((s) => s.toggleActiveBody);
  const setActiveBody = useEditorStore((s) => s.setActiveBody);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const createTool = useEditorStore((s) => s.createTool);

  const [editingId, setEditingId] = useState<string | null>(null);

  const usedColors = new Set(Object.values(bodies).map((b) => b.color));
  const isOutlineMode = createTool === 'outline';

  // Find selected joint (if any)
  const selectedJointId = [...selectedIds].find((id) => joints[id]);

  const bodyList = Object.values(bodies);
  bodyList.sort((a, b) => {
    if (a.id === baseBodyId) return -1;
    if (b.id === baseBodyId) return 1;
    return 0;
  });

  // Count outlines per body
  const outlineCount = new Map<string, number>();
  for (const o of Object.values(outlines)) {
    outlineCount.set(o.bodyId, (outlineCount.get(o.bodyId) || 0) + 1);
  }

  return (
    <div className="panel-content">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0 }}>Bodies</div>
        <button
          className="tool-btn"
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => addBody('Body')}
        >
          + Add Body
        </button>
      </div>
      {bodyList.map((body) => {
        const isActive = activeBodyIds.has(body.id);
        const isBase = body.id === baseBodyId;
        const isEditing = editingId === body.id;
        const jointInBody = selectedJointId ? body.jointIds.includes(selectedJointId) : false;
        const oCount = outlineCount.get(body.id) || 0;
        const bodyImages = Object.values(images).filter((img) => img.bodyId === body.id);

        return (
          <div key={body.id}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 6px', marginBottom: 2, borderRadius: 4,
                backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => isOutlineMode ? setActiveBody(body.id) : toggleActiveBody(body.id)}
            >
              {/* Selection control: radio in outline mode, checkbox in joints mode */}
              {isOutlineMode ? (
                <input
                  type="radio"
                  name="activeBody"
                  checked={isActive}
                  onChange={() => setActiveBody(body.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flexShrink: 0, cursor: 'pointer' }}
                />
              ) : (
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
              )}

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

              {/* Name */}
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

              {/* Counts + COM toggle */}
              <span style={{ fontSize: 10, opacity: 0.6 }}>
                {body.jointIds.length}j{oCount > 0 ? ` ${oCount}o` : ''}
              </span>
              {oCount > 0 && (
                <span
                  title={body.useOutlineCOM ? 'Using outline center of area for gravity' : 'Using joint centroid for gravity'}
                  style={{
                    fontSize: 9, padding: '0 3px', borderRadius: 2, cursor: 'pointer',
                    backgroundColor: body.useOutlineCOM ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.05)',
                    color: body.useOutlineCOM ? '#4CAF50' : 'inherit',
                  }}
                  onClick={(e) => { e.stopPropagation(); toggleOutlineCOM(body.id); }}
                >
                  CoA
                </span>
              )}

              {/* Edit + Delete */}
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

            {/* Images belonging to this body */}
            {bodyImages.map((img) => (
              <div
                key={img.id}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 3,
                  marginLeft: 20, padding: '3px 6px', marginBottom: 2,
                  borderRadius: 4, fontSize: 11,
                  backgroundColor: selectedIds.has(img.id) ? 'rgba(74,158,255,0.15)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* Eye toggle */}
                  <button
                    onClick={() => updateImage(img.id, { visible: !img.visible })}
                    title={img.visible ? 'Hide image' : 'Show image'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 2px', fontSize: 14, color: img.visible ? '#aaa' : '#555',
                      lineHeight: 1,
                    }}
                  >
                    {img.visible ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    )}
                  </button>

                  <span style={{ flex: 1, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Image
                  </span>

                  {/* Delete image */}
                  <button
                    className="tool-btn"
                    style={{ fontSize: 10, padding: '1px 4px' }}
                    onClick={() => removeImage(img.id)}
                    title="Remove image"
                  >
                    x
                  </button>
                </div>

                {/* Opacity slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 2 }}>
                  <span style={{ fontSize: 10, color: '#777', width: 42 }}>Opacity</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(img.opacity * 100)}
                    onChange={(e) => updateImage(img.id, { opacity: Number(e.target.value) / 100 })}
                    style={{ flex: 1, height: 12, accentColor: '#2196F3' }}
                  />
                  <span style={{ fontSize: 10, color: '#777', width: 24, textAlign: 'right' }}>
                    {Math.round(img.opacity * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      })}

    </div>
  );
}
