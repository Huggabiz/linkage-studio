import type { AppMode, Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { computeBodyTransform, localToWorld } from '../core/body-transform';

/**
 * Shared mode switch logic used by both the expanded Toolbar and the
 * collapsed toolbar icon buttons. Handles position save/restore,
 * outline freeze/unfreeze, and temp joint cleanup.
 */
export function switchMode(newMode: AppMode): void {
  const editor = useEditorStore.getState();
  const mech = useMechanismStore.getState();
  if (newMode === editor.mode) return;

  // Clean up any temp joint from sim drag
  if (editor.simDrag?.tempJointId) {
    mech.removeTempJoint(editor.simDrag.tempJointId);
    editor.setSimDrag(null);
  }

  if (newMode === 'simulate') {
    // Reproject outlines if locked
    if (editor.lockOutlines && editor.frozenOutlineWorldPoints.size > 0) {
      mech.reprojectOutlinesFromWorld(editor.frozenOutlineWorldPoints);
      editor.setLockOutlines(false);
    }

    // Save current positions for restore on mode switch back
    const positions: Record<string, Vec2> = {};
    for (const [id, joint] of Object.entries(mech.joints)) {
      if (id.startsWith('__temp_')) continue;
      positions[id] = { ...joint.position };
    }
    editor.setSavedPositions(positions);
    mech.regenerateLinks();
  } else {
    // Restore saved positions
    if (editor.savedPositions) {
      const currentJoints = useMechanismStore.getState().joints;
      for (const [id, pos] of Object.entries(editor.savedPositions)) {
        if (currentJoints[id]) {
          mech.moveJoint(id, pos);
        }
      }
      editor.setSavedPositions(null);
      mech.regenerateLinks();
    }
  }

  editor.setMode(newMode);

  // After switching back to create mode, capture fresh frozen outline points
  if (newMode === 'create') {
    const mechState = useMechanismStore.getState();
    const frozen = new Map<string, Vec2[]>();
    for (const outline of Object.values(mechState.outlines)) {
      const body = mechState.bodies[outline.bodyId];
      if (!body || outline.points.length < 2) continue;
      const transform = computeBodyTransform(body, mechState.joints);
      frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
    }
    useEditorStore.getState().setLockOutlines(true, frozen);
  }
}
