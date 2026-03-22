import type { Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { hitTest, hitTestJoint } from './hit-test';
import { screenToWorld } from '../renderer/camera';
import { snapToGrid, distance, sub, dot, lengthSq } from '../core/math/vec2';

let isDragging = false;
let dragJointId: string | null = null;
let isPanning = false;
let lastMouse: Vec2 = { x: 0, y: 0 };

export function handleMouseDown(e: MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);
  lastMouse = screenPos;

  // Middle mouse → pan (always)
  if (e.button === 1) {
    isPanning = true;
    e.preventDefault();
    return;
  }

  // --- SIMULATE MODE ---
  if (editor.mode === 'simulate') {
    if (e.button !== 0) return;

    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
    if (hit) {
      if (hit.type === 'joint') {
        const joint = hit.item;
        if (joint.type === 'fixed') return;
        // Find a link connected to this joint
        const linkId = joint.connectedLinkIds[0] || null;
        let grabT = 0;
        if (linkId) {
          const link = mechanism.links[linkId];
          if (link) grabT = link.jointIds[0] === joint.id ? 0 : 1;
        }
        editor.setSimDrag({
          active: true,
          grabPoint: joint.position,
          cursorPoint: worldPos,
          jointId: joint.id,
          linkId,
          grabT,
        });
      } else {
        // Link hit: compute parametric t along the link
        const link = hit.item;
        const jA = mechanism.joints[link.jointIds[0]];
        const jB = mechanism.joints[link.jointIds[1]];
        if (!jA || !jB) return;
        // Both endpoints fixed = can't drag
        if (jA.type === 'fixed' && jB.type === 'fixed') return;

        // Compute parametric t: project worldPos onto segment AB
        const ab = sub(jB.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        const t = abLenSq > 1e-8 ? Math.max(0, Math.min(1, dot(ap, ab) / abLenSq)) : 0.5;

        // Pick the closer non-fixed joint for the jointId reference
        let jointId: string;
        if (jA.type === 'fixed') jointId = jB.id;
        else if (jB.type === 'fixed') jointId = jA.id;
        else jointId = t <= 0.5 ? jA.id : jB.id;

        editor.setSimDrag({
          active: true,
          grabPoint: worldPos,
          cursorPoint: worldPos,
          jointId,
          linkId: link.id,
          grabT: t,
        });
      }
    }
    return;
  }

  // --- CREATE MODE ---
  const { activeTool } = editor;

  if (activeTool === 'pan') {
    isPanning = true;
    return;
  }

  if (activeTool === 'select') {
    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
    if (hit) {
      if (e.shiftKey) {
        editor.toggleSelect(hit.item.id);
      } else {
        editor.select(hit.item.id);
      }
      if (hit.type === 'joint') {
        isDragging = true;
        dragJointId = hit.item.id;
        mechanism.pushHistory();
      }
    } else {
      editor.clearSelection();
    }
  }

  if (activeTool === 'joint') {
    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const id = mechanism.addJoint(editor.jointSubType, pos);
    editor.select(id);
  }

  if (activeTool === 'link') {
    const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    if (editor.linkStartJointId === null) {
      // First click: use existing joint or create one
      if (joint) {
        editor.setLinkStart(joint.id);
      } else {
        const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
        const id = mechanism.addJoint('revolute', pos);
        editor.setLinkStart(id);
      }
    } else {
      // Second click: use existing joint or create one, then link
      let endId: string;
      if (joint) {
        endId = joint.id;
      } else {
        const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
        endId = mechanism.addJoint('revolute', pos);
      }
      const linkId = mechanism.addLink(editor.linkStartJointId, endId);
      if (linkId) editor.select(linkId);
      editor.setLinkStart(null);
    }
  }

}

export function handleDoubleClick(e: MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  if (editor.mode !== 'create') return;

  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);

  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  if (joint) {
    const newType = joint.type === 'revolute' ? 'fixed' : 'revolute';
    mechanism.updateJointType(joint.id, newType);
  }
}

export function handleMouseMove(e: MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);

  if (isPanning) {
    const dx = screenPos.x - lastMouse.x;
    const dy = screenPos.y - lastMouse.y;
    editor.panCamera({ x: dx, y: dy });
    lastMouse = screenPos;
    return;
  }

  // --- SIMULATE MODE ---
  if (editor.mode === 'simulate') {
    const simDrag = editor.simDrag;
    if (simDrag && simDrag.active) {
      editor.setSimDrag({ ...simDrag, cursorPoint: worldPos });
      return;
    }
    // Hover detection still works in simulate mode
    const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
    editor.setHovered(hit ? hit.item.id : null);
    lastMouse = screenPos;
    return;
  }

  // --- CREATE MODE ---
  if (isDragging && dragJointId) {
    const pos = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    mechanism.moveJoint(dragJointId, pos);
    return;
  }

  const hit = hitTest(worldPos, mechanism.joints, mechanism.links, editor.camera.zoom);
  editor.setHovered(hit ? hit.item.id : null);
  lastMouse = screenPos;
}

export function handleMouseUp(_e: MouseEvent) {
  const editor = useEditorStore.getState();

  // Clear simulate drag
  if (editor.simDrag) {
    editor.setSimDrag(null);
  }

  isDragging = false;
  dragJointId = null;
  isPanning = false;
}

export function handleWheel(e: WheelEvent, canvas: HTMLCanvasElement) {
  e.preventDefault();
  const editor = useEditorStore.getState();
  const rect = canvas.getBoundingClientRect();
  const center: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  editor.zoomCamera(factor, center);
}

export function handleKeyDown(e: KeyboardEvent) {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();

  // In simulate mode, disable creation shortcuts
  if (editor.mode === 'simulate') {
    // Only allow grid toggle and undo/redo
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
      editor.toggleGrid();
      return;
    }
    if (e.key === 'Escape') {
      editor.setSimDrag(null);
      return;
    }
    return;
  }

  // --- CREATE MODE shortcuts ---
  if (!e.ctrlKey && !e.metaKey) {
    switch (e.key) {
      case 's': editor.setTool('select'); return;
      case 'j': editor.setTool('joint'); return;
      case 'l': editor.setTool('link'); return;
      case 'g': editor.toggleGrid(); return;
      case 'Escape':
        editor.clearSelection();
        editor.setLinkStart(null);
        return;
    }
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    for (const id of editor.selectedIds) {
      if (mechanism.joints[id]) mechanism.removeJoint(id);
      else if (mechanism.links[id]) mechanism.removeLink(id);
    }
    editor.clearSelection();
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    if (e.shiftKey) mechanism.redo();
    else mechanism.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    mechanism.redo();
  }
}
