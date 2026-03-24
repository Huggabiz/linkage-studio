import type { Vec2 } from './geometry';

export type AppMode = 'create' | 'simulate';
export type ToolType = 'select' | 'joint' | 'link' | 'pan';
export type JointSubType = 'revolute' | 'fixed';
export type CreateTool = 'joints' | 'slider' | 'outline' | 'image';
export type JointMode = 'manual' | 'autochain';

export interface SimDragState {
  active: boolean;
  grabPoint: Vec2;
  cursorPoint: Vec2;
  jointId: string;
  linkId: string | null;
  grabT: number;
  tempJointId?: string;  // temporary joint created for shape dragging
}

export interface CameraState {
  pan: Vec2;
  zoom: number;
}

export interface EditorState {
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
}
