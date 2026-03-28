import type { Vec2 } from '../types';
import { useEditorStore } from '../store/editor-store';
import { useMechanismStore } from '../store/mechanism-store';
import { hitTest, hitTestJoint, hitTestOutline, hitTestOutlineFilled } from './hit-test';
import { hitTestImage, hitTestRotateHandle, hitTestScaleHandle } from '../renderer/draw-images';
import { screenToWorld } from '../renderer/camera';
import { snapToGrid, distance, sub, dot, lengthSq } from '../core/math/vec2';
import { computeBodyTransform, worldToLocal, localToWorld } from '../core/body-transform';
import { HIT_RADIUS } from '../utils/constants';

/** Compute the screen positions of arc selector body circles. */
export function getArcCirclePositions(
  jointWorldPos: Vec2,
  bodyCount: number,
  camera: { pan: Vec2; zoom: number },
): { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number; angle: number }[] {
  const RADIUS = 52; // screen px from joint center
  const PER_CIRCLE_DEG = 38; // angular spacing between circles
  const MAX_SPAN_DEG = 200;
  // Arc is centered at 345° (11 o'clock), expanding symmetrically clockwise
  const centerAngleDeg = 345;
  const spanDeg = Math.min(MAX_SPAN_DEG, Math.max(PER_CIRCLE_DEG, (bodyCount - 1) * PER_CIRCLE_DEG));
  // First circle at the counter-clockwise edge, last at the clockwise edge
  const startAngleDeg = centerAngleDeg - spanDeg / 2;
  const centerScreenX = jointWorldPos.x * camera.zoom + camera.pan.x;
  const centerScreenY = jointWorldPos.y * camera.zoom + camera.pan.y;

  const positions: { screenX: number; screenY: number; centerScreenX: number; centerScreenY: number; angle: number }[] = [];
  for (let i = 0; i < bodyCount; i++) {
    const t = bodyCount > 1 ? i / (bodyCount - 1) : 0;
    // Fan clockwise: increasing angle (0° = up, clockwise positive in screen space)
    const angleDeg = startAngleDeg + spanDeg * t;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    positions.push({
      screenX: centerScreenX + Math.cos(angleRad) * RADIUS,
      screenY: centerScreenY + Math.sin(angleRad) * RADIUS,
      centerScreenX,
      centerScreenY,
      angle: angleDeg,
    });
  }
  return positions;
}

/** Handle cursor movement over arc body circles — toggle body membership on enter. */
function handleArcHover(worldPos: Vec2, editor: ReturnType<typeof useEditorStore.getState>) {
  const arc = editor.arcSelector;
  if (!arc) return;
  const mechanism = useMechanismStore.getState();
  const bodies = Object.values(mechanism.bodies);
  bodies.sort((a, b) => {
    if (a.id === mechanism.baseBodyId) return -1;
    if (b.id === mechanism.baseBodyId) return 1;
    return 0;
  });

  const positions = getArcCirclePositions(arc.position, bodies.length, editor.camera);
  const CIRCLE_RADIUS = 12; // screen px hit radius

  // Convert world cursor to screen
  const cursorScreenX = worldPos.x * editor.camera.zoom + editor.camera.pan.x;
  const cursorScreenY = worldPos.y * editor.camera.zoom + editor.camera.pan.y;

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const pos = positions[i];
    const dx = cursorScreenX - pos.screenX;
    const dy = cursorScreenY - pos.screenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < CIRCLE_RADIUS) {
      // Cursor is inside this circle — toggle if ready
      if (arc.readyToToggle.has(body.id)) {
        const joint = mechanism.joints[arc.jointId];
        if (joint) {
          if (body.jointIds.includes(arc.jointId)) {
            mechanism.removeJointFromBody(arc.jointId, body.id);
          } else {
            mechanism.addJointToBody(arc.jointId, body.id);
          }
        }
        // Mark as not ready until cursor leaves
        const newReady = new Set(arc.readyToToggle);
        newReady.delete(body.id);
        editor.setArcSelector({ ...arc, readyToToggle: newReady });
      }
    } else {
      // Cursor is outside — mark as ready to toggle again
      if (!arc.readyToToggle.has(body.id)) {
        const newReady = new Set(arc.readyToToggle);
        newReady.add(body.id);
        editor.setArcSelector({ ...arc, readyToToggle: newReady });
      }
    }
  }
}

/** Exit outline editing mode and update frozen world points. */
function exitOutlineEditMode() {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const outlineId = editor.editingOutlineId;
  if (outlineId) {
    const outline = mechanism.outlines[outlineId];
    if (outline) {
      const body = mechanism.bodies[outline.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mechanism.joints);
        const worldPts = outline.points.map((p) => localToWorld(p, transform));
        editor.updateFrozenOutline(outlineId, worldPts);
      }
    }
  }
  editor.setEditingOutline(null);
}

function isFixed(jointId: string): boolean {
  const { bodies, baseBodyId } = useMechanismStore.getState();
  return bodies[baseBodyId]?.jointIds.includes(jointId) ?? false;
}

let isDragging = false;
let dragJointId: string | null = null;
let isPanning = false;
let lastMouse: Vec2 = { x: 0, y: 0 };

// Slider line drag state
let sliderLineDragId: string | null = null;
let sliderLineDragStart: Vec2 = { x: 0, y: 0 };
let sliderLineDragStartPositions: { a: Vec2; b: Vec2; c: Vec2 } | null = null;

// Outline vertex drag state
let outlineVertexDragIndex: number | null = null;
let outlineVertexDragOutlineId: string | null = null;

// Image drag state
let imageDragId: string | null = null;
let imageDragType: 'move' | 'rotate' | 'scale' | null = null;
let imageDragStart: Vec2 = { x: 0, y: 0 };
let imageStartRotation = 0;
let imageStartScale = 1;

// Long-press arc selector state
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressJointId: string | null = null;
let longPressStartScreen: Vec2 | null = null;
const LONG_PRESS_MS = 300;
const LONG_PRESS_MOVE_THRESHOLD = 5; // px screen movement to cancel
let imageStartPos: Vec2 = { x: 0, y: 0 };

export function handleMouseDown(e: PointerEvent, canvas: HTMLCanvasElement) {
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
        if (isFixed(joint.id)) return;
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
        if (isFixed(jA.id) && isFixed(jB.id)) return;

        // Compute parametric t: project worldPos onto segment AB
        const ab = sub(jB.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        const t = abLenSq > 1e-8 ? Math.max(0, Math.min(1, dot(ap, ab) / abLenSq)) : 0.5;

        // Pick the closer non-fixed joint for the jointId reference
        let jointId: string;
        if (isFixed(jA.id)) jointId = jB.id;
        else if (isFixed(jB.id)) jointId = jA.id;
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
      return;
    }

    // Outline (shape) hit: create a temp joint for force transfer
    const outlineHit = hitTestOutlineFilled(
      worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, mechanism.baseBodyId,
    );
    if (outlineHit) {
      const body = mechanism.bodies[outlineHit.bodyId];
      if (body) {
        const hasFreeJoint = body.jointIds.some((jid) => !isFixed(jid));
        if (!hasFreeJoint) return;

        // Create a temp joint linked to 2 nearest body joints (doesn't change body structure)
        const tempId = mechanism.addTempJoint(worldPos, body.id);

        const mech2 = useMechanismStore.getState();
        const tempJoint = mech2.joints[tempId];
        if (!tempJoint) return;

        // Find a temp link connected to the temp joint
        const linkId = tempJoint.connectedLinkIds[0] || null;
        let grabT = 0;
        if (linkId) {
          const link = mech2.links[linkId];
          if (link) grabT = link.jointIds[0] === tempId ? 0 : 1;
        }

        editor.setSimDrag({
          active: true,
          grabPoint: worldPos,
          cursorPoint: worldPos,
          jointId: tempId,
          linkId,
          grabT,
          tempJointId: tempId,
        });
      }
    }
    return;
  }

  // --- CREATE MODE ---
  if (e.button !== 0) return;

  if (editor.activeTool === 'pan') {
    isPanning = true;
    return;
  }

  // --- IMAGE TOOL ---
  if (editor.createTool === 'image') {
    // Check if clicking on already-selected image handles
    const selectedImageId = [...editor.selectedIds].find((id) => mechanism.images[id]);
    if (selectedImageId) {
      const img = mechanism.images[selectedImageId];
      if (img) {
        // Check rotate handle first
        if (hitTestRotateHandle(worldPos, img, editor.camera.zoom)) {
          imageDragId = selectedImageId;
          imageDragType = 'rotate';
          imageDragStart = worldPos;
          imageStartRotation = img.rotation;
          mechanism.pushHistory();
          return;
        }
        // Check scale handles (corners)
        if (hitTestScaleHandle(worldPos, img, editor.camera.zoom)) {
          imageDragId = selectedImageId;
          imageDragType = 'scale';
          imageDragStart = worldPos;
          imageStartScale = img.scale;
          imageStartPos = img.position;
          mechanism.pushHistory();
          return;
        }
      }
    }
    // Check if clicking on any image
    const allImages = Object.values(mechanism.images);
    // Reverse so topmost (last drawn) is checked first
    for (let i = allImages.length - 1; i >= 0; i--) {
      const img = allImages[i];
      if (hitTestImage(worldPos, img)) {
        editor.select(img.id);
        imageDragId = img.id;
        imageDragType = 'move';
        imageDragStart = worldPos;
        imageStartPos = img.position;
        mechanism.pushHistory();
        return;
      }
    }
    // Clicked empty space - deselect
    if (editor.selectedIds.size > 0) {
      editor.clearSelection();
    }
    return;
  }

  // --- SLIDER TOOL ---
  if (editor.createTool === 'slider') {
    // Check for existing joint hit first (select it)
    const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    if (existingJoint && !editor.sliderPointA) {
      editor.select(existingJoint.id);
      isDragging = true;
      dragJointId = existingJoint.id;
      mechanism.pushHistory();
      return;
    }

    // Check for slider rail line hit (select the slider)
    if (!editor.sliderPointA) {
      for (const slider of Object.values(mechanism.sliders)) {
        const jA = mechanism.joints[slider.jointIdA];
        const jC = mechanism.joints[slider.jointIdC];
        if (!jA || !jC) continue;
        const ab = sub(jC.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        if (abLenSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
        const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
        const dist = distance(worldPos, closest);
        if (dist < HIT_RADIUS / editor.camera.zoom) {
          editor.select(slider.id);
          // Also allow dragging the rail
          sliderLineDragId = slider.id;
          sliderLineDragStart = worldPos;
          const jB = mechanism.joints[slider.jointIdB];
          sliderLineDragStartPositions = {
            a: { ...jA.position },
            b: jB ? { ...jB.position } : { x: 0, y: 0 },
            c: { ...jC.position },
          };
          mechanism.pushHistory();
          return;
        }
      }

      // Clicked empty space with something selected — deselect
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        return;
      }
    }

    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    if (!editor.sliderPointA) {
      // First click on empty space: place joint A
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointId = mechanism.addJoint('revolute', pos, activeBodyIds);
      editor.setSliderPointA({ position: pos, jointId });
    } else {
      // Second click: place joint C, auto-create B at midpoint, create slider constraint
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointIdC = mechanism.addJoint('revolute', pos, activeBodyIds);
      // B at midpoint, no body membership
      const midPos = {
        x: (editor.sliderPointA.position.x + pos.x) / 2,
        y: (editor.sliderPointA.position.y + pos.y) / 2,
      };
      const jointIdB = mechanism.addJoint('revolute', midPos);
      mechanism.addSlider(editor.sliderPointA.jointId, jointIdC, jointIdB);
      editor.setSliderPointA(null);
      // Revert to pivot tool after completing slider
      editor.setCreateTool('joints');
    }
    return;
  }

  // --- COLLIDER TOOL ---
  if (editor.createTool === 'collider') {
    // Check for existing joint hit first (select it)
    const existingJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    if (existingJoint && !editor.colliderPointA) {
      editor.select(existingJoint.id);
      isDragging = true;
      dragJointId = existingJoint.id;
      mechanism.pushHistory();
      return;
    }

    // Check for collider line hit (select the collider)
    if (!editor.colliderPointA) {
      for (const collider of Object.values(mechanism.colliders)) {
        const jA = mechanism.joints[collider.jointIdA];
        const jC = mechanism.joints[collider.jointIdC];
        if (!jA || !jC) continue;
        const ab = sub(jC.position, jA.position);
        const ap = sub(worldPos, jA.position);
        const abLenSq = lengthSq(ab);
        if (abLenSq < 1e-8) continue;
        const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
        const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
        const dist = distance(worldPos, closest);
        if (dist < HIT_RADIUS / editor.camera.zoom) {
          editor.select(collider.id);
          return;
        }
      }

      // Clicked empty space with collider selected — deselect and revert to pivot
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        editor.setCreateTool('joints');
        return;
      }
    }

    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    if (!editor.colliderPointA) {
      // First click: place endpoint A
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointId = mechanism.addJoint('revolute', pos, activeBodyIds);
      editor.setColliderPointA({ position: pos, jointId });
    } else {
      // Second click: place endpoint C, create collider constraint + rigid link
      const activeBodyIds = Array.from(editor.activeBodyIds);
      const jointIdC = mechanism.addJoint('revolute', pos, activeBodyIds);
      const colliderId = mechanism.addCollider(editor.colliderPointA.jointId, jointIdC);
      // Add a rigid link between A and C
      mechanism.addLink(editor.colliderPointA.jointId, jointIdC);
      editor.setColliderPointA(null);
      // Auto-select the barrier line so user can immediately assign bodies
      editor.select(colliderId);
    }
    return;
  }

  // --- OUTLINE TOOL ---
  if (editor.createTool === 'outline') {
    // --- OUTLINE EDIT MODE ---
    if (editor.editingOutlineId) {
      const outline = mechanism.outlines[editor.editingOutlineId];
      if (outline) {
        const body = mechanism.bodies[outline.bodyId];
        if (body) {
          const transform = computeBodyTransform(body, mechanism.joints);
          const worldPts = outline.points.map((p) => localToWorld(p, transform));
          const hitRadius = HIT_RADIUS / editor.camera.zoom;

          // Check vertex hit
          for (let i = 0; i < worldPts.length; i++) {
            if (distance(worldPos, worldPts[i]) < hitRadius) {
              editor.setEditingVertexIndex(i);
              outlineVertexDragIndex = i;
              outlineVertexDragOutlineId = editor.editingOutlineId;
              mechanism.pushHistory();
              return;
            }
          }

          // Check edge hit (insert vertex)
          for (let i = 0; i < worldPts.length; i++) {
            const j = (i + 1) % worldPts.length;
            const a = worldPts[i];
            const b = worldPts[j];
            const ab = sub(b, a);
            const ap = sub(worldPos, a);
            const abLenSq = lengthSq(ab);
            if (abLenSq < 1e-8) continue;
            const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq));
            const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
            if (distance(worldPos, closest) < hitRadius) {
              // Insert new vertex at the clicked position (grid-snapped)
              const snappedWorld = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
              const localPt = worldToLocal(snappedWorld, transform);
              mechanism.insertOutlineVertex(editor.editingOutlineId, i, localPt);
              editor.setEditingVertexIndex(i + 1);
              outlineVertexDragIndex = i + 1;
              outlineVertexDragOutlineId = editor.editingOutlineId;
              return;
            }
          }

          // Clicked away from shape — exit edit mode
          exitOutlineEditMode();
          return;
        }
      }
      exitOutlineEditMode();
      return;
    }

    // --- OUTLINE DRAWING MODE ---
    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const points = editor.outlinePoints;

    // If not currently drawing, check if clicking on an existing outline to select it
    if (points.length === 0) {
      const hitOutline = hitTestOutline(worldPos, mechanism.outlines, mechanism.bodies, mechanism.joints, editor.camera.zoom);
      if (hitOutline) {
        editor.select(hitOutline.id);
        return;
      }
      // Clicked empty space — deselect any selected outline
      if (editor.selectedIds.size > 0) {
        editor.clearSelection();
        return;
      }
    }

    // If clicking near the first point and we have 3+ points, close the outline
    if (points.length >= 3) {
      const distToFirst = distance(pos, points[0]);
      const closeThreshold = HIT_RADIUS / editor.camera.zoom;
      if (distToFirst < closeThreshold) {
        const activeBodyId = [...editor.activeBodyIds][0];
        const body = mechanism.bodies[activeBodyId];
        if (body) {
          const transform = computeBodyTransform(body, mechanism.joints);
          const localPoints = points.map((p) => worldToLocal(p, transform));
          mechanism.addOutline(activeBodyId, localPoints);
        }
        editor.clearOutlinePoints();
        return;
      }
    }

    // Add point
    editor.addOutlinePoint(pos);
    return;
  }

  // --- JOINTS TOOL ---
  if (editor.jointMode === 'autochain') {
    const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
    if (joint) {
      // Clicking existing joint: attach last chain body to it and end chain
      const lastBodyId = editor.autoChainLastBodyId;
      if (lastBodyId) {
        mechanism.addJointToBody(joint.id, lastBodyId);
      }
      editor.setJointMode('manual');
      editor.select(joint.id);
    } else {
      // Place a new chain joint in free space
      const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
      const lastBodyId = editor.autoChainLastBodyId;

      // Create a new body for the forward connection
      const newBodyId = mechanism.addBody('Body');

      // Determine which bodies this joint belongs to
      let bodyIds: string[];
      if (lastBodyId === null) {
        // First joint in chain: Base + new body
        bodyIds = [mechanism.baseBodyId, newBodyId];
      } else {
        // Subsequent joints: previous body + new body
        bodyIds = [lastBodyId, newBodyId];
      }

      mechanism.addJoint('revolute', pos, bodyIds);
      editor.setAutoChainLastBodyId(newBodyId);
    }
    return;
  }

  // --- MANUAL JOINTS ---
  // Check slider rail line hit first (before joint hit, so joints take priority via the joint check below)
  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  if (!joint) {
    // Check if clicking on a slider rail line
    for (const slider of Object.values(mechanism.sliders)) {
      const jA = mechanism.joints[slider.jointIdA];
      const jC = mechanism.joints[slider.jointIdC];
      if (!jA || !jC) continue;
      // Point-to-segment distance
      const ab = sub(jC.position, jA.position);
      const ap = sub(worldPos, jA.position);
      const abLen = Math.sqrt(lengthSq(ab));
      if (abLen < 1e-8) continue;
      const t = Math.max(0, Math.min(1, dot(ap, ab) / lengthSq(ab)));
      const closest = { x: jA.position.x + ab.x * t, y: jA.position.y + ab.y * t };
      const dist = distance(worldPos, closest);
      if (dist < HIT_RADIUS / editor.camera.zoom) {
        // Start dragging the slider rail
        sliderLineDragId = slider.id;
        sliderLineDragStart = worldPos;
        const jB = mechanism.joints[slider.jointIdB];
        sliderLineDragStartPositions = {
          a: { ...jA.position },
          b: jB ? { ...jB.position } : { x: 0, y: 0 },
          c: { ...jC.position },
        };
        mechanism.pushHistory();
        return;
      }
    }
  }

  if (joint) {
    if (e.shiftKey) {
      editor.toggleSelect(joint.id);
    } else {
      editor.select(joint.id);
    }
    isDragging = true;
    dragJointId = joint.id;
    mechanism.pushHistory();

    // Start long-press timer for arc body selector
    const screenPos2: Vec2 = { x: e.clientX, y: e.clientY };
    longPressStartScreen = screenPos2;
    longPressJointId = joint.id;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (longPressJointId) {
        const j = useMechanismStore.getState().joints[longPressJointId];
        if (j && !j.hidden) {
          useEditorStore.getState().setArcSelector({
            jointId: longPressJointId,
            position: { ...j.position },
            showTime: Date.now(),
            collapseTime: null,
            readyToToggle: new Set(Object.keys(useMechanismStore.getState().bodies)),
          });
          isDragging = false; // prevent joint dragging while arc is shown
          dragJointId = null;
        }
      }
      longPressTimer = null;
    }, LONG_PRESS_MS);
  } else if (editor.selectedIds.size > 0) {
    editor.clearSelection();
  } else {
    const pos = editor.gridEnabled ? snapToGrid(worldPos, editor.gridSize) : worldPos;
    const activeBodyIds = Array.from(editor.activeBodyIds);
    const newJointId = mechanism.addJoint('revolute', pos, activeBodyIds);

    // Start long-press timer on newly placed joint (pen tap-and-hold)
    const screenPos3: Vec2 = { x: e.clientX, y: e.clientY };
    longPressStartScreen = screenPos3;
    longPressJointId = newJointId;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (longPressJointId) {
        const j = useMechanismStore.getState().joints[longPressJointId];
        if (j && !j.hidden) {
          useEditorStore.getState().setArcSelector({
            jointId: longPressJointId,
            position: { ...j.position },
            showTime: Date.now(),
            collapseTime: null,
            readyToToggle: new Set(Object.keys(useMechanismStore.getState().bodies)),
          });
        }
      }
      longPressTimer = null;
    }, LONG_PRESS_MS);
  }
}

export function handleDoubleClick(e: PointerEvent | MouseEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  if (editor.mode !== 'create') return;

  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);

  const joint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  if (joint) {
    const baseBodyId = mechanism.baseBodyId;
    if (isFixed(joint.id)) {
      mechanism.removeJointFromBody(joint.id, baseBodyId);
    } else {
      mechanism.addJointToBody(joint.id, baseBodyId);
    }
  }
}

export function handleMouseMove(e: PointerEvent, canvas: HTMLCanvasElement) {
  const editor = useEditorStore.getState();
  const mechanism = useMechanismStore.getState();
  const rect = canvas.getBoundingClientRect();
  const screenPos: Vec2 = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  const worldPos = screenToWorld(screenPos, editor.camera);

  // Cancel long-press if cursor moved too far
  if (longPressTimer && longPressStartScreen) {
    const dx = e.clientX - longPressStartScreen.x;
    const dy = e.clientY - longPressStartScreen.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      longPressJointId = null;
    }
  }

  // Arc selector hover toggle logic
  if (editor.arcSelector) {
    handleArcHover(worldPos, editor);
    return; // block all other interactions while arc is shown
  }

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

  // Slider line dragging (translate all 3 joints)
  if (sliderLineDragId && sliderLineDragStartPositions) {
    const dx = worldPos.x - sliderLineDragStart.x;
    const dy = worldPos.y - sliderLineDragStart.y;
    const slider = mechanism.sliders[sliderLineDragId];
    if (slider) {
      let newA = { x: sliderLineDragStartPositions.a.x + dx, y: sliderLineDragStartPositions.a.y + dy };
      let newB = { x: sliderLineDragStartPositions.b.x + dx, y: sliderLineDragStartPositions.b.y + dy };
      let newC = { x: sliderLineDragStartPositions.c.x + dx, y: sliderLineDragStartPositions.c.y + dy };
      if (editor.gridEnabled && !e.altKey) {
        // Snap A to grid, translate B and C by same delta
        const snappedA = snapToGrid(newA, editor.gridSize);
        const snapDx = snappedA.x - newA.x;
        const snapDy = snappedA.y - newA.y;
        newA = snappedA;
        newB = { x: newB.x + snapDx, y: newB.y + snapDy };
        newC = { x: newC.x + snapDx, y: newC.y + snapDy };
      }
      mechanism.moveJoint(slider.jointIdA, newA);
      mechanism.moveJoint(slider.jointIdB, newB);
      mechanism.moveJoint(slider.jointIdC, newC);
    }
    return;
  }

  // Outline vertex dragging
  if (outlineVertexDragIndex !== null && outlineVertexDragOutlineId) {
    const outline = mechanism.outlines[outlineVertexDragOutlineId];
    if (outline) {
      const body = mechanism.bodies[outline.bodyId];
      if (body) {
        const transform = computeBodyTransform(body, mechanism.joints);
        const snappedWorld = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;
        const localPt = worldToLocal(snappedWorld, transform);
        const newPoints = [...outline.points];
        newPoints[outlineVertexDragIndex] = localPt;
        mechanism.updateOutlinePoints(outlineVertexDragOutlineId, newPoints);
      }
    }
    return;
  }

  // Image dragging
  if (imageDragId && imageDragType) {
    const img = mechanism.images[imageDragId];
    if (img) {
      if (imageDragType === 'move') {
        const dx = worldPos.x - imageDragStart.x;
        const dy = worldPos.y - imageDragStart.y;
        mechanism.updateImage(imageDragId, {
          position: { x: imageStartPos.x + dx, y: imageStartPos.y + dy },
        });
      } else if (imageDragType === 'rotate') {
        // Angle from image center to current cursor vs start
        const startAngle = Math.atan2(imageDragStart.y - img.position.y, imageDragStart.x - img.position.x);
        const curAngle = Math.atan2(worldPos.y - img.position.y, worldPos.x - img.position.x);
        mechanism.updateImage(imageDragId, {
          rotation: imageStartRotation + (curAngle - startAngle),
        });
      } else if (imageDragType === 'scale') {
        const startDist = Math.sqrt(
          (imageDragStart.x - imageStartPos.x) ** 2 + (imageDragStart.y - imageStartPos.y) ** 2,
        );
        const curDist = Math.sqrt(
          (worldPos.x - imageStartPos.x) ** 2 + (worldPos.y - imageStartPos.y) ** 2,
        );
        const ratio = startDist > 1 ? curDist / startDist : 1;
        mechanism.updateImage(imageDragId, {
          scale: Math.max(0.01, imageStartScale * ratio),
        });
      }
    }
    return;
  }

  if (isDragging && dragJointId) {
    const pos = editor.gridEnabled && !e.altKey ? snapToGrid(worldPos, editor.gridSize) : worldPos;

    // Check if this joint is part of a slider
    const slider = mechanism.getSliderForJoint(dragJointId);
    if (slider) {
      if (dragJointId === slider.jointIdB) {
        // B: constrain to line AC (use unsnapped worldPos so B slides freely)
        const jA = mechanism.joints[slider.jointIdA];
        const jC = mechanism.joints[slider.jointIdC];
        if (jA && jC) {
          const ac = sub(jC.position, jA.position);
          const ap = sub(worldPos, jA.position);
          const acLenSq = lengthSq(ac);
          const t = acLenSq > 1e-8 ? Math.max(0, Math.min(1, dot(ap, ac) / acLenSq)) : 0.5;
          const constrained = { x: jA.position.x + ac.x * t, y: jA.position.y + ac.y * t };
          mechanism.moveJoint(dragJointId, constrained);
          mechanism.updateSliderT(slider.id, t);
        }
      } else {
        // A or C: move freely, but maintain B's parametric t
        mechanism.moveJoint(dragJointId, pos);
        const jA = mechanism.joints[dragJointId === slider.jointIdA ? dragJointId : slider.jointIdA];
        const jC = mechanism.joints[dragJointId === slider.jointIdC ? dragJointId : slider.jointIdC];
        const posA = dragJointId === slider.jointIdA ? pos : jA.position;
        const posC = dragJointId === slider.jointIdC ? pos : jC.position;
        const t = slider.t;
        const newB = { x: posA.x + (posC.x - posA.x) * t, y: posA.y + (posC.y - posA.y) * t };
        mechanism.moveJoint(slider.jointIdB, newB);
      }
    } else {
      mechanism.moveJoint(dragJointId, pos);
    }
    return;
  }

  const hoverJoint = hitTestJoint(worldPos, mechanism.joints, editor.camera.zoom);
  editor.setHovered(hoverJoint ? hoverJoint.id : null);
  lastMouse = screenPos;
}

export function handleMouseUp(_e: PointerEvent | MouseEvent) {
  const editor = useEditorStore.getState();

  // Cancel long-press timer
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressJointId = null;
  longPressStartScreen = null;

  // Start arc collapse animation on mouse release (don't clear immediately)
  if (editor.arcSelector && !editor.arcSelector.collapseTime) {
    editor.setArcSelector({ ...editor.arcSelector, collapseTime: Date.now() });
    // Clear after animation completes (stagger + duration)
    const bodyCount = Object.keys(useMechanismStore.getState().bodies).length;
    const totalDuration = bodyCount * 50 + 200;
    setTimeout(() => {
      useEditorStore.getState().setArcSelector(null);
    }, totalDuration);
  }

  // Clean up temporary joint from shape dragging
  if (editor.simDrag?.tempJointId) {
    const mechanism = useMechanismStore.getState();
    mechanism.removeTempJoint(editor.simDrag.tempJointId);
  }

  // Clear simulate drag
  if (editor.simDrag) {
    editor.setSimDrag(null);
  }

  isDragging = false;
  dragJointId = null;
  isPanning = false;
  imageDragId = null;
  imageDragType = null;
  sliderLineDragId = null;
  sliderLineDragStartPositions = null;
  outlineVertexDragIndex = null;
  outlineVertexDragOutlineId = null;
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
      editor.cycleGrid();
      return;
    }
    if (e.key === 'Escape') {
      if (editor.simDrag?.tempJointId) {
        const mechanism = useMechanismStore.getState();
        mechanism.removeTempJoint(editor.simDrag.tempJointId);
      }
      editor.setSimDrag(null);
      return;
    }
    return;
  }

  // --- CREATE MODE shortcuts ---
  if (!e.ctrlKey && !e.metaKey) {
    switch (e.key) {
      case 'g': editor.cycleGrid(); return;
      case 'Escape':
        if (editor.editingOutlineId) {
          exitOutlineEditMode();
        } else if (editor.sliderPointA) {
          // Cancel slider placement — remove the already-placed A joint
          mechanism.undo();
          editor.setSliderPointA(null);
        } else if (editor.colliderPointA) {
          // Cancel collider placement — remove the already-placed A joint
          mechanism.undo();
          editor.setColliderPointA(null);
        } else if (editor.jointMode === 'autochain') {
          editor.setJointMode('manual');
        } else if (editor.outlinePoints.length > 0) {
          editor.clearOutlinePoints();
        } else {
          editor.clearSelection();
        }
        return;
    }
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    // If editing outline and a vertex is selected, delete the vertex
    if (editor.editingOutlineId && editor.editingVertexIndex !== null) {
      const outline = mechanism.outlines[editor.editingOutlineId];
      if (outline && outline.points.length > 3) {
        mechanism.removeOutlineVertex(editor.editingOutlineId, editor.editingVertexIndex);
        editor.setEditingVertexIndex(null);
      }
      return;
    }
    for (const id of editor.selectedIds) {
      if (mechanism.joints[id]) mechanism.removeJoint(id);
      else if (mechanism.outlines[id]) mechanism.removeOutline(id);
      else if (mechanism.images[id]) mechanism.removeImage(id);
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
