import { useRef, useEffect, useCallback } from 'react';
import { useMechanismStore } from '../../store/mechanism-store';
import { useEditorStore } from '../../store/editor-store';
import { useSimulationStore } from '../../store/simulation-store';
import { render } from '../../renderer/canvas-renderer';
import { screenToWorld } from '../../renderer/camera';
import {
  handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick, handleWheel, handleKeyDown,
} from '../../interaction/tool-manager';
import type { Vec2 } from '../../types';

// Multi-pointer tracking for pinch-to-zoom (pointer-only, no touch events)
const activePointers: Map<number, Vec2> = new Map();
let isPinching = false;
let wasPinching = false; // cooldown: true until all pointers lift after a pinch
let lastPinchDist: number | null = null;
let lastPinchCenter: Vec2 | null = null;
let pendingDownEvent: { pointerId: number; event: PointerEvent; canvas: HTMLCanvasElement } | null = null;
let pendingDownTimer: ReturnType<typeof setTimeout> | null = null;
const PINCH_DETECT_DELAY = 80; // ms to wait for second finger before treating as single-tap


export function MechanismCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorWorldRef = useRef<Vec2 | null>(null);
  const rafRef = useRef<number>(0);

  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill container
    const rect = canvas.parentElement!.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const mechanism = useMechanismStore.getState();
    const editor = useEditorStore.getState();
    const sim = useSimulationStore.getState();

    try {
      render(ctx, canvas, {
        joints: mechanism.joints,
        links: mechanism.links,
        bodies: mechanism.bodies,
        outlines: mechanism.outlines,
        images: mechanism.images,
        sliders: mechanism.sliders,
        selectedIds: editor.selectedIds,
        hoveredId: editor.hoveredId,
        camera: editor.camera,
        gridEnabled: editor.gridEnabled,
        gridSize: editor.gridSize,
        dof: sim.dof,
        cursorWorld: cursorWorldRef.current,
        pathTraces: sim.pathTraces,
        simDrag: editor.simDrag,
        mode: editor.mode,
        forceVectors: sim.solverResult?.forceVectors || [],
        showLinks: editor.showLinks,
        showVectors: editor.showVectors,
        createTool: editor.createTool,
        outlinePoints: editor.outlinePoints,
        activeBodyColor: (() => {
          const activeId = [...editor.activeBodyIds][0];
          return activeId && mechanism.bodies[activeId] ? mechanism.bodies[activeId].color : '#888888';
        })(),
        gravityEnabled: sim.gravityEnabled,
        gravityStrength: sim.gravityStrength,
        baseBodyId: mechanism.baseBodyId,
        frozenOutlinePoints: editor.lockOutlines ? editor.frozenOutlineWorldPoints : undefined,
        sliderPointA: editor.sliderPointA?.position ?? null,
      });
    } catch (e) {
      console.error('Render error:', e);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderLoop]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Prevent Safari/iOS gesture zoom on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preventGesture = (e: Event) => e.preventDefault();
    canvas.addEventListener('gesturestart', preventGesture);
    canvas.addEventListener('gesturechange', preventGesture);
    canvas.addEventListener('gestureend', preventGesture);
    // Prevent touch-based scrolling/zooming that might bypass touchAction
    canvas.addEventListener('touchstart', preventGesture, { passive: false });
    canvas.addEventListener('touchmove', preventGesture, { passive: false });
    return () => {
      canvas.removeEventListener('gesturestart', preventGesture);
      canvas.removeEventListener('gesturechange', preventGesture);
      canvas.removeEventListener('gestureend', preventGesture);
      canvas.removeEventListener('touchstart', preventGesture);
      canvas.removeEventListener('touchmove', preventGesture);
    };
  }, []);

  const mode = useEditorStore((s) => s.mode);
  const simDrag = useEditorStore((s) => s.simDrag);
  const hoveredId = useEditorStore((s) => s.hoveredId);

  const cursor = mode === 'simulate'
    ? (simDrag?.active ? 'grabbing' : 'grab')
    : (hoveredId ? 'pointer' : 'crosshair');

  const handlePinchMove = useCallback(() => {
    if (activePointers.size < 2) return;
    const pts = Array.from(activePointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const center: Vec2 = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const screenCenter: Vec2 = { x: center.x - rect.left, y: center.y - rect.top };

    if (lastPinchDist !== null && lastPinchCenter !== null) {
      const factor = dist / lastPinchDist;
      useEditorStore.getState().zoomCamera(factor, screenCenter);
      const panDx = center.x - lastPinchCenter.x;
      const panDy = center.y - lastPinchCenter.y;
      useEditorStore.getState().panCamera({ x: panDx, y: panDy });
    }
    lastPinchDist = dist;
    lastPinchCenter = center;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', cursor, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        // Prevent default for touch/pen to stop browser gestures
        if (e.pointerType !== 'mouse') e.preventDefault();

        const canvas = canvasRef.current!;
        canvas.setPointerCapture(e.pointerId);
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // 2+ pointers = start pinch, cancel any pending single-tap and active interaction
        if (activePointers.size >= 2) {
          isPinching = true;
          wasPinching = true;
          lastPinchDist = null;
          lastPinchCenter = null;
          // Cancel any deferred single-pointer down
          if (pendingDownTimer) { clearTimeout(pendingDownTimer); pendingDownTimer = null; pendingDownEvent = null; }
          handleMouseUp(e.nativeEvent as PointerEvent);
          return;
        }

        // For mouse, fire immediately (no multi-touch possible)
        if (e.pointerType === 'mouse') {
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // For touch/pen: defer to allow second finger for pinch detection
        // Don't start interaction if we're still cooling down from a pinch
        if (isPinching || wasPinching) return;

        // In simulate mode, fire immediately for responsive dragging
        const currentMode = useEditorStore.getState().mode;
        if (currentMode === 'simulate') {
          handleMouseDown(e.nativeEvent as PointerEvent, canvas);
          return;
        }

        // In create mode, defer to distinguish tap from pinch
        pendingDownEvent = { pointerId: e.pointerId, event: e.nativeEvent as PointerEvent, canvas };
        pendingDownTimer = setTimeout(() => {
          if (pendingDownEvent && !isPinching && !wasPinching) {
            handleMouseDown(pendingDownEvent.event, pendingDownEvent.canvas);
          }
          pendingDownEvent = null;
          pendingDownTimer = null;
        }, PINCH_DETECT_DELAY);
      }}
      onDoubleClick={(e) => {
        if (!isPinching) {
          handleDoubleClick(e.nativeEvent, canvasRef.current!);
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') e.preventDefault();
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Pinch-to-zoom when 2+ pointers active
        if (isPinching && activePointers.size >= 2) {
          handlePinchMove();
          return;
        }

        if (isPinching || wasPinching) return;

        // If we have a pending deferred down and finger moved enough, fire it now
        if (pendingDownEvent && pendingDownEvent.pointerId === e.pointerId) {
          const dx = e.clientX - pendingDownEvent.event.clientX;
          const dy = e.clientY - pendingDownEvent.event.clientY;
          if (dx * dx + dy * dy > 9) { // 3px movement threshold
            clearTimeout(pendingDownTimer!);
            handleMouseDown(pendingDownEvent.event, pendingDownEvent.canvas);
            pendingDownEvent = null;
            pendingDownTimer = null;
          }
        }

        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
        handleMouseMove(e.nativeEvent as PointerEvent, canvas);
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current!;
        canvas.releasePointerCapture(e.pointerId);
        activePointers.delete(e.pointerId);

        // Cancel deferred down if this pointer is lifting before it fired
        if (pendingDownEvent && pendingDownEvent.pointerId === e.pointerId) {
          clearTimeout(pendingDownTimer!);
          // Fire as a tap if it wasn't a pinch
          if (!isPinching && !wasPinching) {
            handleMouseDown(pendingDownEvent.event, pendingDownEvent.canvas);
            handleMouseUp(e.nativeEvent as PointerEvent);
          }
          pendingDownEvent = null;
          pendingDownTimer = null;
          return;
        }

        if (activePointers.size < 2) {
          isPinching = false;
          lastPinchDist = null;
          lastPinchCenter = null;
        }

        // Clear pinch cooldown only when ALL pointers are gone
        if (activePointers.size === 0) {
          wasPinching = false;
        }

        if (!isPinching && !wasPinching) {
          handleMouseUp(e.nativeEvent as PointerEvent);
        }
      }}
      onPointerLeave={(e) => {
        // Only clear cursor for mouse (pen/touch use capture)
        if (e.pointerType === 'mouse') {
          cursorWorldRef.current = null;
        }
      }}
      onPointerCancel={(e) => {
        const canvas = canvasRef.current!;
        canvas.releasePointerCapture(e.pointerId);
        activePointers.delete(e.pointerId);

        // Cancel any deferred down
        if (pendingDownTimer) { clearTimeout(pendingDownTimer); pendingDownTimer = null; pendingDownEvent = null; }

        if (activePointers.size < 2) {
          isPinching = false;
          lastPinchDist = null;
          lastPinchCenter = null;
        }
        if (activePointers.size === 0) {
          wasPinching = false;
        }

        if (!isPinching && !wasPinching) {
          handleMouseUp(e.nativeEvent as PointerEvent);
        }
      }}
      onWheel={(e) => handleWheel(e.nativeEvent, canvasRef.current!)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
