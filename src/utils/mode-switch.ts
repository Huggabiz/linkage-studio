import type { AppMode, Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { useSimulationStore } from '../store/simulation-store';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
import { exitOutlineEditMode } from '../interaction/tool-manager';

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

  // Exit outline edit mode gracefully FIRST (saves vertex changes to frozen points)
  if (editor.editingOutlineId) {
    exitOutlineEditMode();
  }
  // Re-read editor state since exitOutlineEditMode may have modified frozen points
  const editorFresh = useEditorStore.getState();

  if (newMode === 'simulate') {
    // If lockOutlines is on but frozen points are empty, populate them now
    if (editorFresh.lockOutlines && editorFresh.frozenOutlineWorldPoints.size === 0) {
      const mechNow = useMechanismStore.getState();
      const frozen = new Map<string, Vec2[]>();
      for (const outline of Object.values(mechNow.outlines)) {
        const body = mechNow.bodies[outline.bodyId];
        if (!body || outline.points.length < 2) continue;
        const transform = computeBodyTransform(body, mechNow.joints);
        frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
      }
      if (frozen.size > 0) {
        editorFresh.setLockOutlines(true, frozen);
      }
    }

    // Reproject outlines if locked — re-read state since setLockOutlines may have updated it
    const editorForReproject = useEditorStore.getState();
    if (editorForReproject.lockOutlines && editorForReproject.frozenOutlineWorldPoints.size > 0) {
      mech.reprojectOutlinesFromWorld(editorForReproject.frozenOutlineWorldPoints);
      editorForReproject.setLockOutlines(false);
    }

    // Save current positions for restore on mode switch back
    const positions: Record<string, Vec2> = {};
    for (const [id, joint] of Object.entries(mech.joints)) {
      if (id.startsWith('__temp_')) continue;
      positions[id] = { ...joint.position };
    }
    editorFresh.setSavedPositions(positions);
    mech.regenerateLinks();
  } else {
    // Clear all traces when leaving simulate mode
    useSimulationStore.getState().clearTraces();

    // Restore saved positions
    if (editorFresh.savedPositions) {
      const currentJoints = useMechanismStore.getState().joints;
      for (const [id, pos] of Object.entries(editor.savedPositions)) {
        if (currentJoints[id]) {
          mech.moveJoint(id, pos);
        }
      }
      editorFresh.setSavedPositions(null);
      mech.regenerateLinks();
    }
  }

  editorFresh.setMode(newMode);

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
