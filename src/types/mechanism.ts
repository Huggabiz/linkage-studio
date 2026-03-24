import type { Vec2 } from './geometry';

export type JointType = 'revolute' | 'fixed';

export interface Joint {
  readonly id: string;
  type: JointType;
  position: Vec2;
  connectedLinkIds: string[];
  mass?: number;
  externalForce?: Vec2;
}

export interface Link {
  readonly id: string;
  jointIds: [string, string];
  restLength: number;
  mass: number;
}

export interface Body {
  readonly id: string;
  name: string;
  color: string;
  jointIds: string[];
  useOutlineCOM: boolean;
  showLinks: boolean;
}

export interface Outline {
  readonly id: string;
  bodyId: string;
  name: string;
  visible: boolean;
  points: Vec2[];  // local coordinates relative to body reference frame
}

export interface CanvasImage {
  readonly id: string;
  bodyId: string;           // which body this image is attached to (initially Base)
  src: string;              // data URL of the image
  position: Vec2;           // world-space center position
  scale: number;            // uniform scale factor (1 = original size)
  rotation: number;         // rotation in radians
  opacity: number;          // 0-1 transparency
  visible: boolean;         // eye toggle
  naturalWidth: number;     // original pixel width
  naturalHeight: number;    // original pixel height
}

/** A slider constraint: 3 joints (A, B, C) where A-C are rigid and B slides along AC. */
export interface SliderConstraint {
  readonly id: string;
  jointIdA: string;
  jointIdB: string;  // the slider joint (slides between A and C)
  jointIdC: string;
  /** B's parametric position along AC (0 = at A, 1 = at C) */
  t: number;
}

export interface MechanismState {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images: Record<string, CanvasImage>;
  sliders: Record<string, SliderConstraint>;
}
