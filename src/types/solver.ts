import type { Vec2 } from './geometry';

export interface SolverConfig {
  maxIterations: number;
  tolerance: number;
  damping: number;
}

export interface ForceVector {
  origin: Vec2;
  force: Vec2;
  color: string;
}

export interface SolverResult {
  converged: boolean;
  iterations: number;
  residual: number;
  positions: Map<string, Vec2>;
  forceVectors: ForceVector[];
}

export interface SimulationState {
  isPlaying: boolean;
  speed: number;
  time: number;
  driverJointId: string | null;
  driverLinkId: string | null;
  driverType: 'motor' | 'slider';
  driverAngle: number;
  dof: number;
  solverResult: SolverResult | null;
  pathTraces: Map<string, Vec2[]>;
  tracingEnabled: boolean;
  trackedJointIds: Set<string>;
}
