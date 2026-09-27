import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SPEC, derive } from './spec.js';
import { P, box } from './room.js';
import { oakMat } from './joinery.js';

// Detail of how the back-wall shelves (and the rail) are fixed. Room coordinates in cm,
// same datum as the main model. Only the upper back corner zone is drawn (from 150 cm up).

const d = derive(SPEC);
const W = SPEC.room.width;
const PX = d.pillar.centreX, PYc = d.pillar.centreY, PRr = d.pillar.radius;
const LEVELS = [212, 242];     // shelf undersides (as in the main model)
const DEPTH = 38;              // shelf depth
const BOARD = 2.5;             // shelf board thickness
const CLEAT = { h: 4.4, t: 2.1 }; // 44 × 21 mm planed timber
const RAIL_Z = 200;            // current rail height (still to be decided)
const Z0 = 150;                // bottom of the cropped detail

// Wall build-ups (cm), behind the finished faces.
const BOARD_T = 1.25;          // 12.5 mm plasterboard
const DAB_GAP = 1.5;           // adhesive dabs: board stands ~15 mm off the block
const BLOCK_T = 10;
const BATTEN = { w: 3.5, t: 2.5, ys: [20, 60] }; // side-wall battens: ASSUMED positions (400 mm centres)

const mats = {
  board: new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.9, transparent: true, opacity: 1 }),
  block: new THREE.MeshStandardMaterial({ color: 0x9c9d99, roughness: 1 }),
  dab: new THREE.MeshStandardMaterial({ color: 0xc9c2b2, roughness: 1 }),
  batten: new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.8 }),
  cleat: new THREE.MeshStandardMaterial({ color: 0xdcc6a0, roughness: 0.7 }),
  collar: new THREE.MeshStandardMaterial({ color: 0x8a5a35, roughness: 0.6 }),
  cork: new THREE.MeshStandardMaterial({ color: 0xa47a4f, roughness: 1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.6 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.3, metalness: 0.4 }),
  pillar: new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.55 }),
  drop: new THREE.MeshStandardMaterial({ color: 0xf7f6f3, roughness: 0.9, transparent: true, opacity: 0.55 }),
};

// ---------- Scene ----------

const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewport.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
viewport.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d0c4, 1.5));
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.copy(P(140, 160, 320));
sun.target.position.copy(P(90, 10, 210));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 800 });
scene.add(sun, sun.target);

const root = new THREE.Group();
scene.add(root);
const add = (m) => { m.castShadow = m.receiveShadow = true; root.add(m); return m; };
const B = (name, xr, yr, zr, mat, edges = true) => add(box(name, xr, yr, zr, mat, { edges }));

// Cylinder helper, room coords: axis 'x' | 'y' | 'z', from a0 to a1 along that axis.
function cyl(name, axis, at, a0, a1, r, mat, segs = 16) {
  const g = new THREE.CylinderGeometry(r, r, Math.abs(a1 - a0), segs);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'y') g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  const mid = (a0 + a1) / 2;
  const [x, y, z] = at;
  m.position.copy(axis === 'x' ? P(mid, y, z) : axis === 'y' ? P(x, mid, z) : P(x, y, mid));
  m.name = name;
  return add(m);
}

// ---------- Walls ----------

const boards = [];
// Back wall: plasterboard on adhesive dabs over concrete block.
boards.push(B('Back wall plasterboard', [-BATTEN.t - BOARD_T, W + BATTEN.t + BOARD_T], [-BOARD_T, 0], [Z0, 270], mats.board));
B('Concrete block', [-BATTEN.t - BOARD_T, W + BATTEN.t + BOARD_T], [-BOARD_T - DAB_GAP - BLOCK_T, -BOARD_T - DAB_GAP], [Z0, 270], mats.block);
const dabs = [];
for (let x = 15; x < W; x += 30) {
  for (let z = Z0 + 15; z < 270; z += 40) {
    dabs.push(cyl('Adhesive dab', 'y', [x, 0, z], -BOARD_T - DAB_GAP, -BOARD_T, 5, mats.dab, 14));
  }
}
// Side walls: plasterboard on timber battens.
for (const [x0, x1, bx0, bx1] of [[-BOARD_T, 0, -BOARD_T - BATTEN.t, -BOARD_T], [W, W + BOARD_T, W + BOARD_T, W + BOARD_T + BATTEN.t]]) {
  boards.push(B('Side wall plasterboard', [x0, x1], [-BOARD_T, 70], [Z0, 270], mats.board));
  for (const y of BATTEN.ys) B('Wall batten (behind board)', [bx0, bx1], [y - BATTEN.w / 2, y + BATTEN.w / 2], [Z0, 270], mats.batten);
}

// Pillar (cropped) and the ceiling drop above.
const pil = new THREE.Mesh(new THREE.CylinderGeometry(PRr, PRr, d.pillar.top - Z0, 48), mats.pillar);
pil.position.copy(P(PX, PYc, (Z0 + d.pillar.top) / 2));
pil.name = 'Cast-iron pillar (structural: no drilling)';
add(pil);
B('Ceiling drop', [0, W], [0, SPEC.ceilingDrop.depth], [d.dropUnderside, 270], mats.drop);

// ---------- Shelves ----------

// Each shelf is two boards meeting on the pillar centreline, each scribed round the pillar
// with a 3 mm gap so nothing bears on (or rubs) the column.
const GAP = 0.3;
function shelfHalf(left, top) {
  const rr = PRr + GAP, s = new THREE.Shape();
  const cx = PX + (left ? -0.1 : 0.1);
  if (left) {
    s.moveTo(0, 0); s.lineTo(cx, 0); s.lineTo(cx, PYc - rr);
    s.absarc(PX, PYc, rr, -Math.PI / 2, Math.PI / 2, true);
    s.lineTo(cx, DEPTH); s.lineTo(0, DEPTH); s.lineTo(0, 0);
  } else {
    s.moveTo(cx, 0); s.lineTo(W, 0); s.lineTo(W, DEPTH); s.lineTo(cx, DEPTH); s.lineTo(cx, PYc + rr);
    s.absarc(PX, PYc, rr, Math.PI / 2, -Math.PI / 2, true);
    s.lineTo(cx, 0);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: BOARD, bevelEnabled: false, curveSegments: 32 });
  g.rotateX(Math.PI / 2); // shape Y → room Y, extrusion → downwards
  const m = new THREE.Mesh(g, oakMat);
  m.position.y = top;
  m.name = `Shelf board (${left ? 'left' : 'right'} half, 25 mm)`;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })));
  return add(m);
}

const shelfBoards = [];
const fixingZ = [];
for (const lv of LEVELS) {
  shelfBoards.push(shelfHalf(true, lv + BOARD), shelfHalf(false, lv + BOARD));
  const zc = [lv - CLEAT.h, lv];

  // Back cleat: full width, continuous behind the pillar (which stands 24 cm off the wall).
  B('Back cleat (44 × 21 mm)', [0, W], [0, CLEAT.t], zc, mats.cleat);
  // Frame fixings through cleat, board and gap into the block, ~40 cm centres.
  for (const x of [8, 45, 90, 135, 172]) {
    const z = lv - CLEAT.h / 2;
    cyl('Frame fixing sleeve (into block)', 'y', [x, 0, z], -BOARD_T - DAB_GAP - 6, CLEAT.t - 0.1, 0.5, mats.sleeve, 10);
    cyl('Frame fixing screw head', 'y', [x, 0, z], CLEAT.t - 0.1, CLEAT.t + 0.25, 0.8, mats.steel, 14);
  }
  fixingZ.push(lv - CLEAT.h / 2);

  // Side cleats on both side walls: a wood screw into a batten, plus a hollow-wall anchor.
  for (const [x0, x1, face, dir] of [[0, CLEAT.t, CLEAT.t, -1], [W - CLEAT.t, W, W - CLEAT.t, 1]]) {
    B('Side cleat (44 × 21 mm)', [x0, x1], [CLEAT.t, DEPTH - 2], zc, mats.cleat);
    const z = lv - CLEAT.h / 2;
    const wallFace = dir < 0 ? 0 : W;
    // Screw into the batten behind the board (batten at Y 20 here).
    cyl('Wood screw into wall batten', 'x', [0, BATTEN.ys[0], z], Math.min(face, wallFace + dir * (BOARD_T + BATTEN.t - 0.3)), Math.max(face, wallFace + dir * (BOARD_T + BATTEN.t - 0.3)), 0.25, mats.steel, 8);
    cyl('Screw head', 'x', [0, BATTEN.ys[0], z], Math.min(face, face - dir * 0.3), Math.max(face, face - dir * 0.3), 0.6, mats.steel, 12);
    // Hollow-wall (spring toggle) anchor where no batten falls.
    const ya = 31;
    cyl('Hollow-wall anchor bolt', 'x', [0, ya, z], Math.min(face, wallFace + dir * (BOARD_T + 1.2)), Math.max(face, wallFace + dir * (BOARD_T + 1.2)), 0.3, mats.steel, 8);
    cyl('Screw head', 'x', [0, ya, z], Math.min(face, face - dir * 0.3), Math.max(face, face - dir * 0.3), 0.6, mats.steel, 12);
    const tx = wallFace + dir * (BOARD_T + 0.6);
    B('Toggle wings (behind board)', [tx - 0.4, tx + 0.4], [ya - 3, ya + 3], [z - 0.4, z + 0.4], mats.steel, false);
  }

  // Pillar collar under the joint: two hardwood halves, cork-lined, bolted through their own
  // lugs. It grips the column by clamping; nothing is drilled into the iron.
  collar(lv - 6, lv, 'Pillar collar (carries both shelf ends)');
}

function collar(z0, z1, name) {
  const r0 = PRr + 0.2, r1 = PRr + 3.2;
  for (const half of [0, 1]) {
    const a0 = half * Math.PI + 0.02, len = Math.PI - 0.04; // two halves split front/back
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, z1 - z0, 40, 1, false, a0, len), mats.collar);
    ring.position.copy(P(PX, PYc, (z0 + z1) / 2));
    ring.name = name;
    add(ring);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, z1 - z0, 40, 1, true, a0, len), mats.cork);
    cork.material.side = THREE.DoubleSide;
    cork.position.copy(ring.position);
    cork.name = 'Cork liner';
    add(cork);
  }
  // Lugs at the split (front and back of the column), each with a clamp bolt across the joint.
  for (const s of [-1, 1]) {
    const y = PYc + s * (PRr + 4.2);
    B(`${name}: lug`, [PX - 1.4, PX + 1.4], [y - 1.6, y + 1.6], [z0, z1], mats.collar);
    cyl('Clamp bolt (through the collar only)', 'x', [0, y, (z0 + z1) / 2], PX - 2.2, PX + 2.2, 0.4, mats.steel, 10);
  }
}

// ---------- Rail ----------

const railEnds = [[0, PX - PRr - 0.5], [PX + PRr + 0.5, W]];
for (const [a, b] of railEnds) cyl('Hanging rail', 'x', [0, PYc, RAIL_Z], a, b, 1.3, mats.rail);
for (const x of [0, W]) {
  const s = x === 0 ? 1 : -1;
  cyl('Rail end socket (side wall)', 'x', [0, PYc, RAIL_Z], Math.min(x, x + s * 0.8), Math.max(x, x + s * 0.8), 3, mats.rail, 20);
}
collar(RAIL_Z - 4, RAIL_Z + 4, 'Rail collar on pillar (sockets each side)');
for (const s of [-1, 1]) cyl('Rail socket', 'x', [0, PYc, RAIL_Z], PX + s * (PRr + 3.2), PX + s * (PRr + 0.5), 2.2, mats.rail, 16);

// ---------- Labels ----------

const NOTES = [
  [1, P(150, -1, 258), 'Back wall'],
  [2, P(135, CLEAT.t + 0.5, LEVELS[0] - CLEAT.h / 2), 'Frame fixing'],
  [3, P(110, CLEAT.t, LEVELS[0] - CLEAT.h - 1.5), 'Back cleat'],
  [4, P(CLEAT.t + 0.5, BATTEN.ys[0], LEVELS[0] - CLEAT.h - 1.5), 'Side cleat'],
  [5, P(CLEAT.t + 0.5, 31, LEVELS[0] + 5), 'Hollow-wall anchor'],
  [6, P(PX + 8, DEPTH, LEVELS[1] + BOARD + 2), 'Shelf halves'],
  [7, P(PX + 9, PYc + 6, LEVELS[0] - 3), 'Pillar collar'],
  [8, P(PX - 12, PYc + 4, RAIL_Z), 'Rail + collar'],
  [9, P(30, 20, (LEVELS[1] + BOARD + d.dropUnderside) / 2), 'Clearance'],
];
for (const [n, pos, title] of NOTES) {
  const el = document.createElement('div');
  el.className = 'pin';
  el.textContent = n;
  el.title = title;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  scene.add(o);
}
// Clearance line from top shelf to the ceiling drop.
{
  const a = P(30, 20, LEVELS[1] + BOARD), b = P(30, 20, d.dropUnderside);
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x2b5fa8 })));
}

// ---------- Views & toggles ----------

const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const VIEWS = {
  overview: { pos: P(160, 250, 250), target: P(90, 15, 218) },
  pillar: { pos: P(118, 110, 228), target: P(PX, PYc, 214) },
  left: { pos: P(70, 95, 228), target: P(4, 18, 212) },
  behind: { pos: P(120, 170, 222), target: P(90, 0, 214), xray: true },
};
function setView(name) {
  const v = VIEWS[name];
  // Narrow windows need the camera further back to keep the same framing.
  const k = Math.max(1, 1.3 / Math.max(0.6, viewport.clientWidth / viewport.clientHeight));
  const pos = v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(k));
  camera.position.copy(pos);
  controls.target.copy(v.target);
  controls.update();
  if (v.xray !== undefined) setToggle('xray', v.xray);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}

const state = { xray: false, lift: false };
function setToggle(key, on) {
  state[key] = on;
  const el = document.querySelector(`[data-toggle="${key}"]`);
  if (el) el.checked = on;
  if (key === 'xray') {
    mats.board.opacity = on ? 0.18 : 1;
    mats.board.depthWrite = !on;
  }
  if (key === 'lift') {
    shelfBoards.forEach((m, i) => { m.position.y = LEVELS[Math.floor(i / 2)] + BOARD + (on ? 14 : 0); });
  }
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => setToggle(el.dataset.toggle, el.checked)));

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
setView('overview');
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
Object.assign(window, { setView, setToggle });
