# Linkage Studio

A 2D mechanical linkage simulator for designing and simulating mechanisms (2.5D rigs). Built with React 19, TypeScript, Zustand, Canvas 2D, and Vite.

## Quick Start

```bash
npm install
npm run dev
```

## Architecture Overview

**Two modes:** Create (design mechanism) and Simulate (physics-based interaction)

**Core concept:** Users create **bodies** (rigid groups of joints). Joints can belong to multiple bodies — shared joints act as pivots/hinges between bodies. The **Base** body represents ground; its joints are fixed in space.

**Links are auto-generated** from body membership — users never create links directly. N joints in a body get 2N-3 links for 2D rigidity.

## Key Design Decisions

- **No direct link creation UI** — links are computed from body joint membership via `regenerateLinks()` in mechanism-store
- **Bodies define the mechanism** — joints are the user's primary creation tool
- **Outlines are visual only** — they follow body motion but don't affect physics (except optional COM override)
- **Fixed joints = joints in Base body** — removing a joint from Base makes it revolute
- **Double-click joint in create mode** toggles fixed/revolute (adds/removes from Base body)
- **Grid snapping in create mode only** — simulate mode has no snapping
- **No text selection on canvas** — CSS user-select: none on canvas elements
- **App is fixed to window** — no scrolling, overflow hidden

## File Structure

```
src/
├── App.tsx                     # Main simulation loop (60Hz)
├── types/
│   ├── mechanism.ts            # Joint, Link, Body, Outline, MechanismState
│   ├── editor.ts               # AppMode, ToolType, SimDragState, CameraState
│   └── solver.ts               # SolverResult, SimulationState, ForceVector
├── store/
│   ├── mechanism-store.ts      # Zustand: joints, links, bodies, outlines, undo/redo
│   ├── editor-store.ts         # Zustand: UI state, selection, camera, tools
│   └── simulation-store.ts     # Zustand: physics params, play/pause, traces
├── core/
│   ├── solver/
│   │   ├── newton-raphson.ts   # solve() for kinematics, solveWithForce() for physics
│   │   ├── constraints.ts      # Distance constraint (+ Jacobian)
│   │   ├── dof.ts              # Degrees of freedom calculation
│   │   └── driver.ts           # Motor angle computation
│   ├── body-links.ts           # Auto-generate rigid links from body joints
│   ├── body-transform.ts       # Body reference frames, local/world coordinate transforms
│   └── math/
│       ├── vec2.ts             # Vector operations
│       └── linalg.ts           # LU decomposition solver
├── renderer/
│   ├── canvas-renderer.ts      # Main render pipeline
│   ├── camera.ts               # Screen/world coordinate transforms
│   ├── draw-mechanism.ts       # Draw joints (concentric body rings), links, outlines
│   └── draw-overlays.ts        # Grid, force vectors, path traces, HUD
├── interaction/
│   ├── tool-manager.ts         # Mouse/keyboard event handlers for both modes
│   └── hit-test.ts             # Joint/link/outline collision detection
└── components/
    ├── Layout.tsx              # Main layout (toolbar + canvas + right panel)
    ├── Canvas/MechanismCanvas.tsx  # Canvas component, RAF loop, input handling
    ├── Toolbar/Toolbar.tsx     # Mode toggle, tools, undo/redo
    └── Panels/
        ├── BodyPanel.tsx       # Body list, joint membership checkboxes, colors
        ├── SimulationPanel.tsx  # Physics sliders, gravity, view options
        └── PropertyPanel.tsx   # Selected item properties
```

## Physics Engine

**Simulate mode** uses Position-Based Dynamics (PBD) with Verlet integration:
- 10 substeps per frame, 4 constraint passes per substep
- Gravity applies at each joint's weighted position (or outline COM if enabled)
- Drag interaction uses a **critically damped spring**: `F = k*(target - pos) - c*velocity`
- Angular damping reduces rotational velocity around fixed pivots
- Frame-rate independent damping: `dampingPerFrame = dampingFactor^(dt * 60)`

**Create mode** uses Newton-Raphson kinematic solver for motor-driven mechanisms.

**Force propagation:** Forces (gravity, drag) are recomputed each substep using current positions, not stale start-of-frame values.

### Physics Parameters (defaults)
- Gravity strength: 250 (off by default)
- Damping: 50 (slider 0-100, maps to velocity retention factor)
- Drag force multiplier: 25x
- Drag damping: 25 (additional linear damping during drag)

### Important Physics Notes
- PBD constraint projection is inherently slightly energy-dissipative — reduced to 4 passes to minimize this
- Damping=0 means maximum damping, damping=100 means zero damping (slider is "how much energy to retain")
- Free-floating bodies (no fixed joints) correctly fall under gravity
- Shared non-fixed pivots correctly propagate forces between bodies

## Interaction Patterns

**Create mode:**
- Click empty space (no joint selected) → create joint in active bodies
- Click joint → select it (shows body membership checkboxes)
- Click empty space (joint selected) → deselect joint (bodies stay selected)
- Double-click joint → toggle fixed/revolute
- Backspace with joint selected → delete joint
- New joints are NOT auto-selected after creation

**Simulate mode:**
- Click+drag joint or link → apply spring force toward cursor
- Force is a resolved vector of gravity + drag
- Drag point shown with highlight, force vector arrow displayed

**Outline tool:**
- Select single body, click to place vertices, click first point to close polygon
- Stored in body-local coordinates, transforms with body in simulation

## Body Colors

Blue is excluded from the palette (reserved for selection highlight). Colors cycle through: red, green, orange, purple, teal, pink, brown, grey.

## Deployment

**Dev server:** `npm run dev`
**GitHub Pages PWA:** `npx vite build && npx gh-pages -d dist`
**Standalone HTML:** `npx vite build --config vite.export.config.ts` then post-process dist/index.html

The app is a PWA — installable on iPad via Safari "Add to Home Screen" for offline use.
Live at: https://huggabiz.github.io/linkage-studio/

## Testing Approach

No automated test suite yet. Key manual validation scenarios:
1. **Single pendulum:** Fixed + free joint, enable gravity → free end swings with damping
2. **Two-link chain:** Three joints, one fixed → both links swing, forces propagate
3. **Free-floating body:** No fixed joints + gravity → falls off canvas
4. **Drag interaction:** Drag free end of pendulum → resolved force vector of gravity + drag
5. **Zero damping:** Pendulum should maintain energy (no artificial decay)
6. **Outline COM:** Draw asymmetric outline, toggle useOutlineCOM → gravity center shifts
