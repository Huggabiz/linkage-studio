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

export interface MechanismState {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
}
