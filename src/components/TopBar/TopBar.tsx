import { useEditorStore } from '../../store/editor-store';
import { useMechanismStore } from '../../store/mechanism-store';
import { serializeMechanism, deserializeMechanism, saveFileAs, openFilePicker } from '../../utils/file-io';
import './TopBar.css';

declare const __APP_VERSION__: string;

export function TopBar() {
  const undo = useMechanismStore((s) => s.undo);
  const redo = useMechanismStore((s) => s.redo);
  const clearAll = useMechanismStore((s) => s.clearAll);
  const loadState = useMechanismStore((s) => s.loadState);
  const joints = useMechanismStore((s) => s.joints);
  const links = useMechanismStore((s) => s.links);
  const bodies = useMechanismStore((s) => s.bodies);
  const outlines = useMechanismStore((s) => s.outlines);
  const images = useMechanismStore((s) => s.images);
  const sliders = useMechanismStore((s) => s.sliders);
  const baseBodyId = useMechanismStore((s) => s.baseBodyId);
  const clearSelection = useEditorStore((s) => s.clearSelection);

  const handleSave = async () => {
    const json = serializeMechanism(joints, links, bodies, baseBodyId, outlines, images, sliders);
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
    await saveFileAs(json, `linkage_${timestamp}.slinker`);
  };

  const handleOpen = async () => {
    const json = await openFilePicker();
    if (!json) return;
    const state = deserializeMechanism(json);
    if (!state) { alert('Invalid file format'); return; }
    loadState(state);
    clearSelection();
  };

  return (
    <div className="top-bar">
      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={handleSave} title="Save file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          Save
        </button>
        <button className="top-bar-btn" onClick={handleOpen} title="Open file">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button className="top-bar-btn" onClick={undo} title="Undo (Ctrl+Z)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Undo
        </button>
        <button className="top-bar-btn" onClick={redo} title="Redo (Ctrl+Y)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
          </svg>
          Redo
        </button>
      </div>

      <div className="top-bar-separator" />

      <div className="top-bar-group">
        <button
          className="top-bar-btn danger"
          onClick={() => { if (confirm('Clear everything?')) { clearAll(); clearSelection(); } }}
          title="Clear all"
        >
          Clear All
        </button>
      </div>

      <div className="top-bar-spacer" />

      <div className="top-bar-brand">
        <span>Slinker v{__APP_VERSION__}</span>
      </div>
    </div>
  );
}
