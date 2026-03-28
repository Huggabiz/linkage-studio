import { create } from 'zustand';
import type { AppMode, ToolType, JointSubType, CreateTool, JointMode, CameraState, SimDragState, GridLevel } from '../types';
import type { Vec2 } from '../types';
import { DEFAULT_GRID_SIZE } from '../utils/constants';

const GRID_DIVISOR: Record<GridLevel, number> = {
  normal: 1,
  fine: 4,
  ultrafine: 16,
  off: 1,
};

function gridLevelToSize(level: GridLevel): number {
  return DEFAULT_GRID_SIZE / GRID_DIVISOR[level];
}

const GRID_CYCLE: GridLevel[] = ['normal', 'fine', 'ultrafine', 'off'];

interface EditorStore {
  mode: AppMode;
  activeTool: ToolType;
  jointSubType: JointSubType;
  selectedIds: Set<string>;
  hoveredId: string | null;
  camera: CameraState;
  gridEnabled: boolean;
  gridSize: number;
  gridLevel: GridLevel;
  linkStartJointId: string | null;
  simDrag: SimDragState | null;
  savedPositions: Record<string, Vec2> | null;
  activeBodyIds: Set<string>;
  showLinks: boolean;
  showVectors: boolean;
  showRulers: boolean;
  showForceUnits: boolean;
  projectName: string;
  createTool: CreateTool;
  jointMode: JointMode;
  autoChainLastBodyId: string | null;
  outlinePoints: Vec2[];
  lockOutlines: boolean;
  frozenOutlineWorldPoints: Map<string, Vec2[]>;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  imageDragMode: 'move' | 'rotate' | 'scale' | null;
  sliderPointA: { position: Vec2; jointId: string } | null;
  colliderPointA: { position: Vec2; jointId: string } | null;

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
  cycleGrid(): void;
  setGridLevel(level: GridLevel): void;
  setSimDrag(drag: SimDragState | null): void;
  setSavedPositions(positions: Record<string, Vec2> | null): void;
  toggleActiveBody(id: string): void;
  setActiveBody(id: string): void;
  toggleShowLinks(): void;
  toggleShowVectors(): void;
  toggleShowRulers(): void;
  toggleShowForceUnits(): void;
  setProjectName(name: string): void;
  setCreateTool(tool: CreateTool): void;
  setJointMode(mode: JointMode): void;
  setAutoChainLastBodyId(id: string | null): void;
  addOutlinePoint(pt: Vec2): void;
  clearOutlinePoints(): void;
  setLockOutlines(locked: boolean, frozenPoints?: Map<string, Vec2[]>): void;
  toggleLeftCollapsed(): void;
  toggleRightCollapsed(): void;
  setImageDragMode(mode: 'move' | 'rotate' | 'scale' | null): void;
  setSliderPointA(point: { position: Vec2; jointId: string } | null): void;
  setColliderPointA(point: { position: Vec2; jointId: string } | null): void;
  editingOutlineId: string | null;
  editingVertexIndex: number | null;

  /** Long-press arc body selector state */
  arcSelector: {
    /** Joint ID when assigning joint body membership */
    jointId: string | null;
    /** Collider ID when assigning collider barrier bodies */
    colliderId: string | null;
    /** Tracer ID when reassigning tracer body (single-select mode) */
    tracerId: string | null;
    position: Vec2;
    showTime: number;
    collapseTime: number | null;
    readyToToggle: Set<string>;
    createdBodyId: string | null;
    /** Timestamp of the last toggle (for grace period revert on release) */
    lastToggleTime: number;
    /** Info to revert the last toggle if within grace period */
    lastToggle: { bodyId: string; wasAdded: boolean } | null;
  } | null;
  setEditingOutline(outlineId: string | null): void;
  setEditingVertexIndex(index: number | null): void;
  setArcSelector(arc: EditorStore['arcSelector']): void;
  updateFrozenOutline(outlineId: string, worldPoints: Vec2[]): void;
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
  gridLevel: 'normal' as GridLevel,
  linkStartJointId: null,
  simDrag: null,
  savedPositions: null,
  activeBodyIds: new Set<string>(),
  showLinks: true,
  showVectors: true,
  showRulers: true,
  showForceUnits: true,
  projectName: 'Untitled',
  createTool: 'joints' as CreateTool,
  jointMode: 'manual' as JointMode,
  autoChainLastBodyId: null as string | null,
  outlinePoints: [] as Vec2[],
  lockOutlines: true,
  frozenOutlineWorldPoints: new Map(),
  leftCollapsed: false,
  rightCollapsed: false,
  imageDragMode: null,
  sliderPointA: null,
  colliderPointA: null,
  editingOutlineId: null,
  editingVertexIndex: null,
  arcSelector: null,

  setMode(mode) {
    set({ mode, simDrag: null, linkStartJointId: null, selectedIds: new Set(), outlinePoints: [], createTool: 'joints' as CreateTool, jointMode: 'manual' as JointMode, autoChainLastBodyId: null, lockOutlines: true, frozenOutlineWorldPoints: new Map(), sliderPointA: null, colliderPointA: null, editingOutlineId: null, editingVertexIndex: null });
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

  cycleGrid() {
    set((s) => {
      const idx = GRID_CYCLE.indexOf(s.gridLevel);
      const next = GRID_CYCLE[(idx + 1) % GRID_CYCLE.length];
      return { gridLevel: next, gridEnabled: next !== 'off', gridSize: gridLevelToSize(next) };
    });
  },

  setGridLevel(level) {
    set({ gridLevel: level, gridEnabled: level !== 'off', gridSize: gridLevelToSize(level) });
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

  toggleShowRulers() {
    set((s) => ({ showRulers: !s.showRulers }));
  },

  toggleShowForceUnits() {
    set((s) => ({ showForceUnits: !s.showForceUnits }));
  },

  setProjectName(name) {
    set({ projectName: name });
  },

  setCreateTool(tool) {
    set({ createTool: tool, outlinePoints: [], jointMode: 'manual' as JointMode, autoChainLastBodyId: null, sliderPointA: null, colliderPointA: null, editingOutlineId: null, editingVertexIndex: null });
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

  setLockOutlines(locked, frozenPoints) {
    if (locked) {
      set({ lockOutlines: true, frozenOutlineWorldPoints: frozenPoints || new Map() });
    } else {
      set({ lockOutlines: false, frozenOutlineWorldPoints: new Map() });
    }
  },

  toggleLeftCollapsed() {
    set((s) => ({ leftCollapsed: !s.leftCollapsed }));
  },

  toggleRightCollapsed() {
    set((s) => ({ rightCollapsed: !s.rightCollapsed }));
  },

  setImageDragMode(mode) {
    set({ imageDragMode: mode });
  },

  setSliderPointA(point) {
    set({ sliderPointA: point });
  },

  setColliderPointA(point) {
    set({ colliderPointA: point });
  },

  setEditingOutline(outlineId) {
    if (outlineId) {
      set({ editingOutlineId: outlineId, editingVertexIndex: null, selectedIds: new Set([outlineId]), createTool: 'outline' as CreateTool, outlinePoints: [] });
    } else {
      set({ editingOutlineId: null, editingVertexIndex: null, selectedIds: new Set() });
    }
  },

  setEditingVertexIndex(index) {
    set({ editingVertexIndex: index });
  },

  setArcSelector(arc) {
    set({ arcSelector: arc });
  },

  updateFrozenOutline(outlineId, worldPoints) {
    set((s) => {
      const frozen = new Map(s.frozenOutlineWorldPoints);
      frozen.set(outlineId, worldPoints);
      return { frozenOutlineWorldPoints: frozen };
    });
  },
}));
