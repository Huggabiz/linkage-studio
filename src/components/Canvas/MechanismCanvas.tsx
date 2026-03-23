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

// Track active touches for pinch-to-zoom
let activeTouches: Map<number, { x: number; y: number }> = new Map();
let lastPinchDist: number | null = null;
let lastPinchCenter: Vec2 | null = null;


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

    render(ctx, canvas, {
      joints: mechanism.joints,
      links: mechanism.links,
      bodies: mechanism.bodies,
      outlines: mechanism.outlines,
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
    });

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

  const mode = useEditorStore((s) => s.mode);
  const simDrag = useEditorStore((s) => s.simDrag);
  const hoveredId = useEditorStore((s) => s.hoveredId);

  const cursor = mode === 'simulate'
    ? (simDrag?.active ? 'grabbing' : 'grab')
    : (hoveredId ? 'pointer' : 'crosshair');

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', cursor, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        const canvas = canvasRef.current!;
        canvas.setPointerCapture(e.pointerId);
        handleMouseDown(e.nativeEvent as PointerEvent, canvas);
      }}
      onDoubleClick={(e) => handleDoubleClick(e.nativeEvent, canvasRef.current!)}
      onPointerMove={(e) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
        handleMouseMove(e.nativeEvent as PointerEvent, canvas);
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current!;
        canvas.releasePointerCapture(e.pointerId);
        handleMouseUp(e.nativeEvent as PointerEvent);
      }}
      onPointerLeave={() => {
        cursorWorldRef.current = null;
      }}
      onPointerCancel={(e) => {
        const canvas = canvasRef.current!;
        canvas.releasePointerCapture(e.pointerId);
        handleMouseUp(e.nativeEvent as PointerEvent);
      }}
      onTouchStart={(e) => {
        // Track touches for pinch-to-zoom (2+ fingers)
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (activeTouches.size >= 2) {
          lastPinchDist = null;
          lastPinchCenter = null;
        }
      }}
      onTouchMove={(e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        if (activeTouches.size >= 2) {
          const pts = Array.from(activeTouches.values());
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
            // Zoom
            const factor = dist / lastPinchDist;
            useEditorStore.getState().zoomCamera(factor, screenCenter);
            // Pan
            const panDx = center.x - lastPinchCenter.x;
            const panDy = center.y - lastPinchCenter.y;
            useEditorStore.getState().panCamera({ x: panDx, y: panDy });
          }
          lastPinchDist = dist;
          lastPinchCenter = center;
        }
      }}
      onTouchEnd={(e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          activeTouches.delete(e.changedTouches[i].identifier);
        }
        if (activeTouches.size < 2) {
          lastPinchDist = null;
          lastPinchCenter = null;
        }
      }}
      onWheel={(e) => handleWheel(e.nativeEvent, canvasRef.current!)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
