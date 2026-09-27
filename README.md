# Dressing room model

A 3D model of the dressing room, with dimensions in cm, built with three.js.

Live at https://room.dej.app (GitHub Pages, served from `main`). No build step: the pages load
three.js from a CDN.

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

- `src/spec.js`: survey dimensions (MEASURED vs ASSUMED), derived values and datum checks
- `src/room.js`: room geometry, dimension overlays and fit checks
- `src/fitouts.js`: fit-out options (joinery runs, sections, drawers/hanging/shelves)
- `src/joinery.js`: renders fit-outs and measures them (drawers, litres, rail, shelves, narrowest walkway)
- `src/schemes.js`: colour schemes
- `src/main.js`: viewer (views, cutaway, hover readout, .glb export)
- `shelf-fixing.html` + `src/fixing.js`: detail of how the back-wall shelves and rail are fixed

Datum: X from the left wall, Y from the back wall, Z from the floor. The origin is the back-left floor corner.
