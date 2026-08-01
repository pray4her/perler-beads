# Use a tool operation as the canvas commit and history boundary

Pointer movement remains in mutable gesture state and updates only the affected canvas cells. React state, color statistics, and undo history are committed once when the pointer is released, because committing every moved cell made large grids stutter and produced unusable histories. This trades a small working-grid copy per gesture for stable interaction latency and one meaningful undo or redo step per user action.
