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
      style={{ width: '100%', height: '100%', cursor, userSelect: 'none' }}
      onMouseDown={(e) => handleMouseDown(e.nativeEvent, canvasRef.current!)}
      onDoubleClick={(e) => handleDoubleClick(e.nativeEvent, canvasRef.current!)}
      onMouseMove={(e) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        cursorWorldRef.current = screenToWorld(screen, useEditorStore.getState().camera);
        handleMouseMove(e.nativeEvent, canvas);
      }}
      onMouseUp={(e) => handleMouseUp(e.nativeEvent)}
      onMouseLeave={() => {
        cursorWorldRef.current = null;
        handleMouseUp(new MouseEvent('mouseup'));
      }}
      onWheel={(e) => handleWheel(e.nativeEvent, canvasRef.current!)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
