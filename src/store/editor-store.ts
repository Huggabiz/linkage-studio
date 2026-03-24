import { create } from 'zustand';
import type { AppMode, ToolType, JointSubType, CreateTool, JointMode, CameraState, SimDragState } from '../types';
import type { Vec2 } from '../types';
import { DEFAULT_GRID_SIZE } from '../utils/constants';
import { computeBodyTransform, localToWorld } from '../core/body-transform';
import { useMechanismStore } from './mechanism-store';

interface EditorStore {
  mode: AppMode;
  activeTool: ToolType;
  jointSubType: JointSubType;
  selectedIds: Set<string>;
  hoveredId: string | null;
  camera: CameraState;
  gridEnabled: boolean;
  gridSize: number;
  linkStartJointId: string | null;
  simDrag: SimDragState | null;
  savedPositions: Record<string, Vec2> | null;
  activeBodyIds: Set<string>;
  showLinks: boolean;
  showVectors: boolean;
  createTool: CreateTool;
  jointMode: JointMode;
  autoChainLastBodyId: string | null;
  outlinePoints: Vec2[];
  lockOutlines: boolean;
  frozenOutlineWorldPoints: Map<string, Vec2[]>;

  setMode(mode: AppMode): void;
  setTool(tool: ToolType): void;
  setJointSubType(type: JointSubType): void;
  select(id: string): void;
  toggleSelect(id: string): void;
  clearSelection(): void;
  setHovered(id: string | null): void;
  panCamera(delta: Vec2): void;
  zoomCamera(factor: number, center: Vec2): void;
  setLinkStart(id: string | null): void;
  toggleGrid(): void;
  setSimDrag(drag: SimDragState | null): void;
  setSavedPositions(positions: Record<string, Vec2> | null): void;
  toggleActiveBody(id: string): void;
  setActiveBody(id: string): void;
  toggleShowLinks(): void;
  toggleShowVectors(): void;
  setCreateTool(tool: CreateTool): void;
  setJointMode(mode: JointMode): void;
  setAutoChainLastBodyId(id: string | null): void;
  addOutlinePoint(pt: Vec2): void;
  clearOutlinePoints(): void;
  toggleLockOutlines(): void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  mode: 'create',
  activeTool: 'select',
  jointSubType: 'revolute',
  selectedIds: new Set(),
  hoveredId: null,
  camera: { pan: { x: 0, y: 0 }, zoom: 1 },
  gridEnabled: true,
  gridSize: DEFAULT_GRID_SIZE,
  linkStartJointId: null,
  simDrag: null,
  savedPositions: null,
  activeBodyIds: new Set(['base']),
  showLinks: true,
  showVectors: true,
  createTool: 'joints' as CreateTool,
  jointMode: 'manual' as JointMode,
  autoChainLastBodyId: null as string | null,
  outlinePoints: [] as Vec2[],
  lockOutlines: false,
  frozenOutlineWorldPoints: new Map(),

  setMode(mode) {
    set({ mode, simDrag: null, linkStartJointId: null, selectedIds: new Set(), outlinePoints: [], createTool: 'joints' as CreateTool, jointMode: 'manual' as JointMode, autoChainLastBodyId: null });
  },

  setTool(tool) {
    set({ activeTool: tool, linkStartJointId: null });
  },

  setJointSubType(type) {
    set({ jointSubType: type });
  },

  select(id) {
    set({ selectedIds: new Set([id]) });
  },

  toggleSelect(id) {
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    });
  },

  clearSelection() {
    set({ selectedIds: new Set() });
  },

  setHovered(id) {
    set({ hoveredId: id });
  },

  panCamera(delta) {
    set((s) => ({
      camera: {
        ...s.camera,
        pan: { x: s.camera.pan.x + delta.x, y: s.camera.pan.y + delta.y },
      },
    }));
  },

  zoomCamera(factor, center) {
    set((s) => {
      const newZoom = Math.max(0.1, Math.min(10, s.camera.zoom * factor));
      const zoomRatio = newZoom / s.camera.zoom;
      return {
        camera: {
          zoom: newZoom,
          pan: {
            x: center.x - (center.x - s.camera.pan.x) * zoomRatio,
            y: center.y - (center.y - s.camera.pan.y) * zoomRatio,
          },
        },
      };
    });
  },

  setLinkStart(id) {
    set({ linkStartJointId: id });
  },

  toggleGrid() {
    set((s) => ({ gridEnabled: !s.gridEnabled }));
  },

  setSimDrag(drag) {
    set({ simDrag: drag });
  },

  setSavedPositions(positions) {
    set({ savedPositions: positions });
  },

  toggleActiveBody(id) {
    set((s) => {
      const next = new Set(s.activeBodyIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { activeBodyIds: next };
    });
  },

  setActiveBody(id) {
    set({ activeBodyIds: new Set([id]) });
  },

  toggleShowLinks() {
    set((s) => ({ showLinks: !s.showLinks }));
  },

  toggleShowVectors() {
    set((s) => ({ showVectors: !s.showVectors }));
  },

  setCreateTool(tool) {
    set({ createTool: tool, outlinePoints: [], jointMode: 'manual' as JointMode, autoChainLastBodyId: null });
  },

  setJointMode(mode) {
    set({ jointMode: mode, autoChainLastBodyId: null });
  },

  setAutoChainLastBodyId(id) {
    set({ autoChainLastBodyId: id });
  },

  addOutlinePoint(pt) {
    set((s) => ({ outlinePoints: [...s.outlinePoints, pt] }));
  },

  clearOutlinePoints() {
    set({ outlinePoints: [] });
  },

  toggleLockOutlines() {
    const { lockOutlines } = get();
    if (!lockOutlines) {
      // Locking: snapshot current world-space outline positions
      const mech = useMechanismStore.getState();
      const frozen = new Map<string, Vec2[]>();
      for (const outline of Object.values(mech.outlines)) {
        const body = mech.bodies[outline.bodyId];
        if (!body || outline.points.length < 2) continue;
        const transform = computeBodyTransform(body, mech.joints);
        frozen.set(outline.id, outline.points.map((p) => localToWorld(p, transform)));
      }
      set({ lockOutlines: true, frozenOutlineWorldPoints: frozen });
    } else {
      // Unlocking: reproject outlines so they stay at their frozen positions
      const { frozenOutlineWorldPoints } = get();
      if (frozenOutlineWorldPoints.size > 0) {
        useMechanismStore.getState().reprojectOutlinesFromWorld(frozenOutlineWorldPoints);
      }
      set({ lockOutlines: false, frozenOutlineWorldPoints: new Map() });
    }
  },
}));
