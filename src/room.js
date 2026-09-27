import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SPEC, derive } from './spec.js';

// Room coordinates (X right, Y towards front, Z up) → three.js (x right, y up, z towards front).
export const P = (X, Y, Z) => new THREE.Vector3(X, Z, Y);
export const toRoom = (v) => ({ X: v.x, Y: v.z, Z: v.y });

const COLORS = {
  wall: 0xf3f2ee,
  ceiling: 0xf7f6f3,
  frame: 0xfbfbf9,
  carpet: 0xb9ae9c,
  socket: 0xfdfdfb,
  socketDetail: 0x3a3a38,
  edge: 0x8f8d86,
};

const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.edge, transparent: true, opacity: 0.55 });

function carpetTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = 228 + Math.random() * 27; // light noise so the chosen floor colour reads true
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = n;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Axis-aligned box from room-coordinate extents.
export function box(name, [x0, x1], [y0, y1], [z0, z1], material, { edges = true } = {}) {
  const geom = new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0);
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = name;
  mesh.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  mesh.receiveShadow = true;
  if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), edgeMat));
  return mesh;
}

export function buildRoom(spec = SPEC) {
  const d = derive(spec);
  const { width: W, depth: D, height: H } = spec.room;
  const T = spec.walls.thickness;
  const { width: fw, proud } = spec.doorways.frame;

  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.95 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: COLORS.ceiling, roughness: 0.95 });
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.5 });
  const carpetMat = new THREE.MeshStandardMaterial({ color: COLORS.carpet, roughness: 1, map: carpetTexture() });
  const dropMat = new THREE.MeshStandardMaterial({ color: COLORS.ceiling, roughness: 0.95, transparent: true, opacity: 1 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9 });
  // Cut surfaces (wall tops, slab edges) in dark 'poché', as on an architectural section,
  // so the room outline reads against any background.
  const cutMat = new THREE.MeshStandardMaterial({ color: 0x2c2d30, roughness: 1 });
  // BoxGeometry face order: +x, -x, +y (top), -y, +z, -z.
  const wallFaces = [wallMat, wallMat, cutMat, wallMat, wallMat, wallMat];

  const root = new THREE.Group();
  root.name = 'Room';

  // Cutaway groups: each hides itself when the camera is on its outside.
  // `normal` points into the room (three.js coords), `point` lies on the inside face.
  const cutaway = [];
  const shell = (name, normal, point) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    cutaway.push({ group: g, normal, point });
    return g;
  };

  // Floor slab + carpet (carpet top is Z = 0). Carpet runs into both door reveals.
  const floor = new THREE.Group();
  floor.name = 'Floor';
  floor.add(box('Floor slab', [-T, W + T], [-T, D + T], [-T - 1.5, -1.5], cutMat, { edges: false }));
  floor.add(box('Carpet', [0, W], [0, D], [-1.5, 0], carpetMat));
  floor.add(box('Carpet (left doorway)', [-T, 0], [d.leftOpening.y0, D], [-1.5, 0], carpetMat));
  floor.add(box('Carpet (right doorway)', [W, W + T], [d.rightOpening.y0, D], [-1.5, 0], carpetMat));
  root.add(floor);

  // Back wall (Y = 0) and front wall (Y = 239) run the full width including side-wall thickness.
  shell('Back wall', new THREE.Vector3(0, 0, 1), P(0, 0, 0))
    .add(box('Back wall', [-T, W + T], [-T, 0], [0, H], wallFaces));
  shell('Front wall', new THREE.Vector3(0, 0, -1), P(0, D, 0))
    .add(box('Front wall', [-T, W + T], [D, D + T], [0, H], wallFaces));

  // Side walls: solid section from the back wall, then a doorway running into the front corner.
  const left = shell('Left wall', new THREE.Vector3(1, 0, 0), P(0, 0, 0));
  left.add(box('Left wall (solid)', [-T, 0], [0, d.leftOpening.y0], [0, H], wallFaces));
  left.add(box('Left wall (over door)', [-T, 0], [d.leftOpening.y0, D], [d.leftOpening.top, H], wallFaces));

  const right = shell('Right wall', new THREE.Vector3(-1, 0, 0), P(W, 0, 0));
  right.add(box('Right wall (solid)', [W, W + T], [0, d.rightOpening.y0], [0, H], wallFaces));
  right.add(box('Right wall (over door)', [W, W + T], [d.rightOpening.y0, D], [d.rightOpening.top, H], wallFaces));

  // Simple door frames: two jambs + head, inside the structural opening, standing `proud` into the room.
  const frame = (side, { y0, y1, top: doorH }) => {
    const xr = side === 'left' ? [-T, proud] : [W - proud, W + T];
    const g = new THREE.Group();
    g.name = `${side} door frame`;
    g.add(box(`${side} frame jamb (rear)`, xr, [y0, y0 + fw], [0, doorH], frameMat));
    g.add(box(`${side} frame jamb (front)`, xr, [y1 - fw, y1], [0, doorH], frameMat));
    g.add(box(`${side} frame head`, xr, [y0 + fw, y1 - fw], [doorH - fw, doorH], frameMat));
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  };
  left.add(frame('left', d.leftOpening));
  right.add(frame('right', d.rightOpening));

  // Main ceiling at Z = 270.
  const ceiling = shell('Ceiling', new THREE.Vector3(0, -1, 0), P(0, 0, H));
  ceiling.add(box('Ceiling', [-T, W + T], [-T, D + T], [H, H + 5], ceilMat));

  // Boxed ceiling drop: full width, Y 0 → 53, underside at 267.
  const drop = box('Ceiling drop', [0, W], [0, spec.ceilingDrop.depth], [d.dropUnderside, H], dropMat);
  root.add(drop);

  // Pillar: floor to underside of the ceiling drop.
  const pillarGeom = new THREE.CylinderGeometry(d.pillar.radius, d.pillar.radius, d.pillar.top, 64);
  const pillar = new THREE.Mesh(pillarGeom, pillarMat);
  pillar.name = 'Pillar';
  pillar.position.copy(P(d.pillar.centreX, d.pillar.centreY, d.pillar.top / 2));
  pillar.castShadow = pillar.receiveShadow = true;
  pillar.add(new THREE.LineSegments(new THREE.EdgesGeometry(pillarGeom, 30), edgeMat));
  root.add(pillar);

  // Socket on the left wall face (X = 0), centred at Y = 34.
  const s = spec.socket;
  const socket = new THREE.Group();
  socket.name = 'Socket';
  const socketMat = new THREE.MeshStandardMaterial({ color: COLORS.socket, roughness: 0.35 });
  const detailMat = new THREE.MeshStandardMaterial({ color: COLORS.socketDetail, roughness: 0.6 });
  socket.add(box('Socket', [0, s.plateT], [s.y - s.plateW / 2, s.y + s.plateW / 2], [s.z - s.plateH / 2, s.z + s.plateH / 2], socketMat));
  for (const off of [-s.plateW / 4, s.plateW / 4]) {
    // Three pin slots per outlet, drawn as thin dark inlays.
    const cy = s.y + off;
    socket.add(box('Socket pin', [s.plateT, s.plateT + 0.05], [cy - 0.25, cy + 0.25], [s.z + 0.6, s.z + 1.6], detailMat, { edges: false }));
    socket.add(box('Socket pin', [s.plateT, s.plateT + 0.05], [cy - 1.3, cy - 0.5], [s.z - 1.2, s.z - 0.8], detailMat, { edges: false }));
    socket.add(box('Socket pin', [s.plateT, s.plateT + 0.05], [cy + 0.5, cy + 1.3], [s.z - 1.2, s.z - 0.8], detailMat, { edges: false }));
  }
  left.add(socket);

  // Radiator on the front wall: panel standing off the wall on two brackets.
  const rad = d.radiator;
  const radiator = new THREE.Group();
  radiator.name = 'Radiator';
  const radMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 0.4 });
  radiator.add(box('Radiator', [rad.x0, rad.x1], [rad.y0, rad.y1 - 4], [rad.z0, rad.z1], radMat));
  for (let x = rad.x0 + 5; x < rad.x1 - 2; x += 5) {
    radiator.add(box('Radiator', [x - 0.3, x + 0.3], [rad.y0 - 0.2, rad.y0], [rad.z0 + 3, rad.z1 - 3], detailMat, { edges: false }));
  }
  for (const x of [rad.x0 + 10, rad.x1 - 10]) {
    radiator.add(box('Radiator bracket', [x - 1.5, x + 1.5], [rad.y1 - 4, rad.y1], [rad.z1 - 12, rad.z1 - 4], radMat, { edges: false }));
  }
  root.getObjectByName('Front wall').add(radiator);

  // Double light switch on the right wall face (X = 180), centred at Y = 129, Z = 117.
  const sw = spec.lightSwitch;
  const lightSwitch = new THREE.Group();
  lightSwitch.name = 'Light switch';
  const face = W - sw.plateT;
  lightSwitch.add(box('Light switch', [face, W], [sw.y - sw.plateW / 2, sw.y + sw.plateW / 2], [sw.z - sw.plateH / 2, sw.z + sw.plateH / 2], socketMat));
  for (const off of [-sw.plateW / 5, sw.plateW / 5]) {
    // Two rockers, slightly raised, with a thin dark line marking the rocker edge.
    const cy = sw.y + off;
    lightSwitch.add(box('Light switch rocker', [face - 0.4, face], [cy - 1.2, cy + 1.2], [sw.z - 2.6, sw.z + 2.6], socketMat));
    lightSwitch.add(box('Light switch rocker', [face - 0.45, face - 0.4], [cy - 1.2, cy + 1.2], [sw.z - 0.05, sw.z + 0.05], detailMat, { edges: false }));
  }
  right.add(lightSwitch);

  // Recolourable finishes, keyed by element. Each maps to the materials that share that colour.
  const finishes = {
    walls: [wallMat],
    pillar: [pillarMat],
    floor: [carpetMat],
    frames: [frameMat],
    ceiling: [ceilMat, dropMat],
  };

  return { root, cutaway, drop, dropMat, ceiling, finishes, cutMat, derived: d };
}

// ---------- Dimension annotations ----------

function label(text, cls = '') {
  const el = document.createElement('div');
  el.className = `dim-label ${cls}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

// Linear dimension between two room points, with end ticks and a label at the midpoint.
function dim(a, b, text, { tick = [0, 0, 4], cls = '' } = {}) {
  const g = new THREE.Group();
  const A = P(...a), B = P(...b);
  const t = P(...tick);
  const pts = [A, B, A.clone().sub(t), A.clone().add(t), B.clone().sub(t), B.clone().add(t)];
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  g.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: cls.includes('assumed') ? 0xb7791f : 0x2b5fa8, depthTest: false })));
  const l = label(text, cls);
  l.position.copy(A.clone().add(B).multiplyScalar(0.5));
  g.add(l);
  g.renderOrder = 10;
  return g;
}

const fmt = (n) => (Math.round(n * 10) / 10).toString();

export function buildDimensions(spec = SPEC) {
  const d = derive(spec);
  const { width: W, depth: D, height: H } = spec.room;
  const g = new THREE.Group();
  g.name = 'Dimensions';

  // Dimensions drawn on a wall live in a subgroup named after it, so they hide with the cutaway.
  const onWall = {};
  for (const name of ['Left wall', 'Right wall', 'Front wall']) {
    onWall[name] = new THREE.Group();
    onWall[name].name = name;
    g.add(onWall[name]);
  }
  const front = onWall['Front wall'], left = onWall['Left wall'], right = onWall['Right wall'];

  front.add(dim([0, D - 2, 1], [W, D - 2, 1], `${W} width`, { tick: [0, 4, 0] }));
  g.add(dim([W / 2, 0, H - 0.5], [W / 2, D, H - 0.5], `${D} depth`, { tick: [4, 0, 0] }));
  front.add(dim([W - 30, D - 2, 0], [W - 30, D - 2, H], `${H} height`, { tick: [4, 0, 0] }));

  // Ceiling drop.
  right.add(dim([W - 2, 0, d.dropUnderside - 1], [W - 2, spec.ceilingDrop.depth, d.dropUnderside - 1],
    `${spec.ceilingDrop.depth} drop · u/s ${d.dropUnderside}`, { tick: [0, 0, 4] }));

  // Pillar clearances (modelled values; measured in brackets where they differ).
  const zp = 160;
  const lc = d.pillar.centreX - d.pillar.radius;
  const rc = W - (d.pillar.centreX + d.pillar.radius);
  g.add(dim([0, d.pillar.centreY, zp], [lc, d.pillar.centreY, zp],
    `${fmt(lc)} (meas. ${spec.pillar.leftClearance})`));
  g.add(dim([d.pillar.centreX + d.pillar.radius, d.pillar.centreY, zp], [W, d.pillar.centreY, zp],
    `${fmt(rc)} (meas. ${spec.pillar.rightClearance})`));
  g.add(dim([d.pillar.centreX, 0, 1], [d.pillar.centreX, d.pillar.centreY, 1],
    `${d.pillar.centreY} to ℄ pillar`, { tick: [4, 0, 0] }));
  const pl = label(`Ø${fmt(d.pillar.diameter)}`);
  pl.position.copy(P(d.pillar.centreX, d.pillar.centreY, 200));
  g.add(pl);

  // Socket.
  left.add(dim([1, 0, spec.socket.z + 8], [1, spec.socket.y, spec.socket.z + 8], `${spec.socket.y} to socket`));
  left.add(dim([1, spec.socket.y + 10, 0], [1, spec.socket.y + 10, spec.socket.z], `${spec.socket.z} (assumed)`,
    { tick: [0, 4, 0], cls: 'assumed' }));

  // Doorways.
  left.add(dim([2, 0, 1], [2, d.leftOpening.y0, 1], `${d.leftOpening.y0} solid`, { tick: [0, 0, 4] }));
  left.add(dim([2, d.leftOpening.y0, 1], [2, D, 1], `${d.leftOpening.width} opening`, { tick: [0, 0, 4] }));
  right.add(dim([W - 2, 0, 1], [W - 2, d.rightOpening.y0, 1], `${d.rightOpening.y0} solid`, { tick: [0, 0, 4] }));
  right.add(dim([W - 2, d.rightOpening.y0, 1], [W - 2, D, 1], `${d.rightOpening.width} opening`, { tick: [0, 0, 4] }));
  const midL = (d.leftOpening.y0 + D) / 2;
  left.add(dim([2, midL, 0], [2, midL, d.leftOpening.clearHeight], `${d.leftOpening.clearHeight} door height`,
    { tick: [0, 4, 0] }));
  const midR = (d.rightOpening.y0 + D) / 2;
  right.add(dim([W - 2, midR, 0], [W - 2, midR, d.rightOpening.clearHeight], `${d.rightOpening.clearHeight} door height`,
    { tick: [0, 4, 0] }));

  // Light switch.
  const sw = spec.lightSwitch;
  right.add(dim([W - 1, 0, sw.z + 10], [W - 1, sw.y, sw.z + 10], `${sw.y} to switch`));
  right.add(dim([W - 1, sw.y - 10, 0], [W - 1, sw.y - 10, sw.z], `${sw.z} to switch ℄`, { tick: [0, 4, 0] }));

  return g;
}

// Floor grid: 10 cm minor, 50 cm major, over the room footprint only.
export function buildGrid(spec = SPEC) {
  const { width: W, depth: D } = spec.room;
  const minor = [], major = [];
  for (let x = 0; x <= W; x += 10) (x % 50 === 0 ? major : minor).push(P(x, 0, 0.1), P(x, D, 0.1));
  for (let y = 0; y <= D; y += 10) (y % 50 === 0 ? major : minor).push(P(0, y, 0.1), P(W, y, 0.1));
  const g = new THREE.Group();
  g.name = 'Grid';
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(minor),
    new THREE.LineBasicMaterial({ color: 0x6b645a, transparent: true, opacity: 0.18 })));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(major),
    new THREE.LineBasicMaterial({ color: 0x4a443c, transparent: true, opacity: 0.45 })));
  return g;
}

// ---------- Fit checks ----------

// Checks a box (room coords: x, y, w, d, z, h) against the fixed room geometry.
// `it.allow` lists fixtures the item deliberately deals with ('pillar', 'socket', 'switch');
// those become notes rather than errors.
export function checkFit(it, spec = SPEC) {
  const d = derive(spec);
  const { width: W, depth: D } = spec.room;
  const allow = new Set(it.allow ?? []);
  const z0 = it.z ?? 0, z1 = z0 + it.h;
  const x1 = it.x + it.w, y1 = it.y + it.d;
  const errors = [], notes = [];

  if (it.x < 0 || x1 > W || it.y < 0 || y1 > D || z0 < 0) errors.push('outside the room footprint');
  if (z1 > spec.room.height) errors.push('taller than the main ceiling');
  if (it.y < spec.ceilingDrop.depth && z1 > d.dropUnderside) errors.push(`hits the ceiling drop (max ${d.dropUnderside} in the rear ${spec.ceilingDrop.depth} cm)`);

  // Pillar: circle-vs-rectangle in plan, when the heights overlap.
  const cx = Math.max(it.x, Math.min(d.pillar.centreX, x1));
  const cy = Math.max(it.y, Math.min(d.pillar.centreY, y1));
  if (Math.hypot(cx - d.pillar.centreX, cy - d.pillar.centreY) < d.pillar.radius && z0 < d.pillar.top) {
    (allow.has('pillar') ? notes : errors).push(allow.has('pillar') ? 'fits round the pillar (nothing fixed into it)' : 'intersects the pillar');
  }

  // Doorways: anything in front of an opening, below its head, blocks it.
  const proud = spec.doorways.frame.proud;
  if (it.x < proud + 1 && y1 > d.leftOpening.y0 && z0 < d.leftOpening.top) errors.push('runs across the left doorway');
  if (x1 > W - proud - 1 && y1 > d.rightOpening.y0 && z0 < d.rightOpening.top) errors.push('runs across the right doorway');

  // Radiator: nothing in front of it or over it (keeps 5 cm clear for heat).
  const rad = d.radiator;
  if (it.x < rad.x1 && x1 > rad.x0 && y1 > rad.y0 - 5 && z0 < rad.z1 + 5 && z1 > rad.z0) errors.push('covers the radiator');

  // Light switch: covered if the box sits against the right wall across the switch plate.
  const sw = spec.lightSwitch;
  if (x1 > W - sw.plateT - 1 && it.y < sw.y + sw.plateW / 2 && y1 > sw.y - sw.plateW / 2 && z0 < sw.z + sw.plateH / 2 && z1 > sw.z - sw.plateH / 2) {
    (allow.has('switch') ? notes : errors).push(allow.has('switch') ? 'light switch needs moving (e.g. to the door side of the frame)' : 'covers the light switch');
  }

  // Socket: covered if the box sits against the left wall across the socket plate.
  const s = spec.socket;
  if (it.x < s.plateT + 1 && it.y < s.y + s.plateW / 2 && y1 > s.y - s.plateW / 2 && z0 < s.z + s.plateH / 2 && z1 > s.z - s.plateH / 2) {
    (allow.has('socket') ? notes : errors).push(allow.has('socket') ? (it.socketNote ?? 'covers the socket: needs a cut-out or moving') : 'covers the socket');
  }
  return { errors, notes };
}
