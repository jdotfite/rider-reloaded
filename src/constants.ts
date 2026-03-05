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
export const SNAP_RADIUS = 8; // world units for endpoint snapping
export const SELECT_RADIUS = 6; // world units for line selection
export const HANDLE_SIZE = 6; // pixels for edit tool handles
export const HANDLE_HIT_SIZE = 8; // pixels for handle hit detection

// Colors — monochrome palette
export const COLOR_SOLID = '#111111';
export const COLOR_ACC = '#666666';
export const COLOR_SCENERY = '#bbbbbb';
export const COLOR_BACKGROUND = '#f0f0f0';
export const COLOR_RIDER = '#111111';
export const COLOR_SLED = '#222222';
export const COLOR_SCARF = '#111111';
export const COLOR_FLAG = '#111111';
