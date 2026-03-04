export const GRAVITY = { x: 0, y: 0.175 };
export const TIMESTEP = 25; // ms per physics frame (40fps)
export const ITERATIONS = 6; // constraint+collision iterations per frame
export const GRID_CELL_SIZE = 14;
export const MIN_LINE_LENGTH = 5; // minimum segment length for pencil tool
export const ERASER_RADIUS = 10;
export const LINE_WIDTH = 2;
export const INITIAL_RIDER_VELOCITY = { x: 0.4, y: 0 };
export const MAX_LINE_COLLIDE_DIST = 10; // perpendicular distance threshold
export const ACC_LINE_BOOST = 0.1;

// Colors
export const COLOR_SOLID = '#2266cc';
export const COLOR_ACC = '#cc2222';
export const COLOR_SCENERY = '#00aa00';
export const COLOR_BACKGROUND = '#f5f5f5';
export const COLOR_RIDER = '#000000';
export const COLOR_SLED = '#884400';
export const COLOR_SCARF = '#cc0000';
export const COLOR_FLAG = '#ff0000';
