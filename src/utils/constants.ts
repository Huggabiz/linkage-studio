// Rendering
export const JOINT_RADIUS = 8;
export const JOINT_RADIUS_FIXED = 10;
export const LINK_WIDTH = 4;
export const GRID_COLOR = '#ddd';
export const GRID_MAJOR_COLOR = '#aaa';
export const BACKGROUND_COLOR = '#f8f8f8';
export const SELECTION_COLOR = '#2196F3';
export const HOVER_COLOR = '#64B5F6';

// Joint type colors
export const REVOLUTE_COLOR = '#333333';
export const FIXED_COLOR = '#E53935';
export const LINK_COLOR = '#555555';

// Interaction
export const HIT_RADIUS = 12;
export const LINK_HIT_THRESHOLD = 8;
export const SNAP_DISTANCE = 10;
export const DEFAULT_GRID_SIZE = 25;

// Solver
export const SOLVER_MAX_ITERATIONS = 100;
export const SOLVER_TOLERANCE = 1e-10;
export const SOLVER_DAMPING = 1.0;

// Simulation
export const SIM_DT = 1 / 60;
export const DEFAULT_MOTOR_SPEED = 1.0;

// Body colors — distinct palette (20 colors, blue excluded for selection highlight)
export const BASE_BODY_COLOR = '#E53935';
export const BODY_COLORS = [
  '#4CAF50', // green
  '#FF9800', // orange
  '#9C27B0', // purple
  '#00BCD4', // cyan
  '#795548', // brown
  '#E91E63', // pink
  '#607D8B', // blue-grey
  '#CDDC39', // lime
  '#FF5722', // deep orange
  '#3F51B5', // indigo
  '#009688', // teal
  '#FFC107', // amber
  '#8BC34A', // light green
  '#673AB7', // deep purple
  '#F44336', // red
  '#00ACC1', // dark cyan
  '#FF6F00', // dark amber
  '#7B1FA2', // purple dark
  '#26A69A', // medium teal
  '#D81B60', // dark pink
];
