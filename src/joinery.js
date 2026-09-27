import * as THREE from 'three';
import { SPEC, derive } from './spec.js';
import { P, box, checkFit } from './room.js';

// Renders and measures fit-out options (see fitouts.js for the data format).
//
// A unit is built in a local frame, then rotated onto its wall:
//   local x = u, along the run, left → right as you face the fronts
//   local y = up
//   local z = v, depth, 0 at the back of the unit → D at the fronts

const T = 1.8;           // panel thickness
const FRONT = 2;         // drawer/door front thickness (inside the footprint)
const PER_GARMENT = 4;   // cm of rail per hung garment, for capacity estimates
const GARMENT_HALF = 23; // half the width of a hung garment, measured across the rail
const SHELF_T = 2.5;     // open shelf board thickness

// Clear space needed in front of each kind of front, beyond the front face (cm).
// Drawers: full travel plus room to stand. Hanging: room to stand and take things off.
const NEED = { hang: 55, shelves: 45, glass: 45, open: 45, knee: 65 };
const doorCount = (w) => (w > 45 ? 2 : 1);
const needFor = (kind, travel, doorW) =>
  kind === 'drawers' ? travel + 25 : kind === 'cupboard' ? Math.min(doorW, 60) : NEED[kind];
// Rails deal with fixtures by position, so they don't need an allow list, but the
// pillar is a hard obstacle for everything.

export const joineryMat = new THREE.MeshStandardMaterial({ color: 0xd9c3a0, roughness: 0.55 });
const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
const grooveMat = new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 0.6 });
const railMat = new THREE.MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.3, metalness: 0.4 });
const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ea, roughness: 0.05, metalness: 0.2 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe3e6, roughness: 0.1, transparent: true, opacity: 0.35 });
const fabricMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 1 });
const gownMat = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 1 });
// Painted furniture (Cotswold-style chests): body colour comes from the scheme.
export const paintMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.6 });
export const oakMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, map: oakTexture() });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.35, metalness: 0.5 });

// Straight oak grain: warm base with darker streaks running along the board.
function oakTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#b8874f';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * c.height;
    g.strokeStyle = `rgba(${90 + Math.random() * 30}, ${55 + Math.random() * 20}, 25, ${0.12 + Math.random() * 0.2})`;
    g.lineWidth = 0.5 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= c.width; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 1.5);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const CLOTHES = ['#8a9bb0', '#c9b8a3', '#6f7d6a', '#b56b5a', '#e3ddd2', '#3c4a5e', '#9c8aa5', '#d8c07a', '#5b5f66', '#a3b8b0']
  .map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));

const WALL_OF = { '+Y': 'Back wall', '+X': 'Left wall', '-X': 'Right wall', '-Y': 'Front wall' };

// Deterministic randomness so garments/stacks don't jump around between rebuilds.
function rng(seedText) {
  let a = [...seedText].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lengthDepth(it) {
  return it.facing === '+Y' || it.facing === '-Y' ? { L: it.w, D: it.d } : { L: it.d, D: it.w };
}

// Resolves `h: null` parts to the remaining height and validates the arithmetic.
export function normalise(option) {
  const errors = [];
  const items = option.items.map((it) => {
    if (it.type === 'rail') return { ...it, ...railBox(it) };
    if (it.type === 'hook') return { ...it, ...hookBox(it) };
    if (it.type === 'shelf') {
      const lo = Math.min(...it.levels), hi = Math.max(...it.levels);
      return { ...it, z: lo, h: hi - lo + SHELF_T };
    }
    if (it.type !== 'unit') return it;
    const { L } = lengthDepth(it);
    const sum = it.sections.reduce((s, sec) => s + sec.w, 0);
    if (Math.abs(sum - L) > 0.01) errors.push(`${it.name}: sections add to ${sum}, run is ${L}`);
    const sections = it.sections.map((sec) => {
      if (sec.filler) return sec;
      const avail = it.h - it.plinth;
      const known = sec.parts.reduce((s, p) => s + (p.h ?? 0), 0);
      const open = sec.parts.filter((p) => p.h == null).length;
      if (open > 1) errors.push(`${it.name}: more than one part without a height`);
      const rest = avail - known;
      if (rest < -0.01 || (open === 0 && Math.abs(rest) > 0.01)) errors.push(`${it.name}: parts add to ${known}, space is ${avail}`);
      return { ...sec, parts: sec.parts.map((p) => (p.h == null ? { ...p, h: rest } : p)) };
    });
    return { ...it, sections };
  });
  return { ...option, items, errors };
}

// ---------- Rendering ----------

// ---------- Cotswold-style chest ----------
// Painted body on short turned feet, oak top with a small overhang, inset panelled drawers in
// graduated rows (e.g. [2, 1, 1, 1] = two small drawers over three long ones), a black cup
// handle centred on each drawer. `plinth` is the foot height.
const CW = { top: 3, over: 1.2, stile: 3, rail: 2 };

export function cotswoldRows(it, part) {
  const avail = it.h - CW.top - it.plinth - CW.rail * (part.rows.length + 1);
  const weights = part.rows.map((n, i) => (part.equal ? (n > 1 ? 0.85 : 1) : n > 1 ? 0.8 : 1 + 0.12 * i));
  const sum = weights.reduce((a, b) => a + b, 0);
  return part.rows.map((n, i) => ({ n, h: (avail * weights[i]) / sum }));
}

function buildCotswold(it) {
  const { L, D } = lengthDepth(it);
  const H = it.h, feet = it.plinth;
  const g = new THREE.Group();
  const add = (name, u0, u1, z0, z1, v0, v1, mat, edges = true) => {
    const geom = new THREE.BoxGeometry(u1 - u0, z1 - z0, v1 - v0);
    const m = new THREE.Mesh(geom, mat);
    m.name = `${it.name}: ${name}`;
    m.position.set((u0 + u1) / 2, (z0 + z1) / 2, (v0 + v1) / 2);
    m.castShadow = m.receiveShadow = true;
    if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), lineMat));
    g.add(m);
  };
  const c0 = CW.over, c1 = L - CW.over, vf = D - CW.over; // carcass sides and front plane

  add('oak top', 0, L, H - CW.top, H, 0, D, oakMat);
  add('body', c0, c1, feet, H - CW.top, 0, vf, paintMat);
  for (const [u, v] of [[c0 + 3.5, 3.5], [c1 - 3.5, 3.5], [c0 + 3.5, vf - 3.5], [c1 - 3.5, vf - 3.5]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.9, feet, 16), paintMat);
    foot.position.set(u, feet / 2, v);
    foot.name = `${it.name}: foot`;
    g.add(foot);
  }

  const part = it.sections[0].parts[0];
  let z = H - CW.top - CW.rail;
  for (const row of cotswoldRows(it, part)) {
    const span = c1 - c0 - 2 * CW.stile - CW.rail * (row.n - 1);
    const fw = span / row.n;
    for (let k = 0; k < row.n; k++) {
      const u0 = c0 + CW.stile + k * (fw + CW.rail), u1 = u0 + fw;
      const z0 = z - row.h, z1 = z;
      add('drawer', u0 + 0.2, u1 - 0.2, z0 + 0.2, z1 - 0.2, vf - 0.5, vf + 0.6, paintMat);
      // Raised centre panel, then a black cup handle in the middle of the drawer.
      add('drawer panel', u0 + 3, u1 - 3, z0 + 2.6, z1 - 2.6, vf + 0.6, vf + 0.9, paintMat);
      const uc = (u0 + u1) / 2, zc = (z0 + z1) / 2 + 1, hw = Math.min(10, fw * 0.3);
      add('cup handle', uc - hw / 2, uc + hw / 2, zc - 1.6, zc + 1.6, vf + 0.9, vf + 1.1, ironMat, false);
      add('cup handle', uc - hw / 2 + 0.4, uc + hw / 2 - 0.4, zc - 1.6, zc, vf + 1.1, vf + 1.1 + Math.min(1.8, CW.over + 0.1), ironMat, false);
    }
    z -= row.h + CW.rail;
  }
  return g;
}

// ---------- Painted chest on legs (reeded corners, brass knobs) ----------
// Flush drawers in rows from the top; wide drawers get two knobs, narrow ones one.
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc2a05e, roughness: 0.3, metalness: 0.75 });
const paints = new Map();
const paintOf = (hex) => {
  if (!paints.has(hex)) paints.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55 }));
  return paints.get(hex);
};

function buildLegged(it) {
  const { L, D } = lengthDepth(it);
  const H = it.h, legH = it.plinth, mat = it.paint ? paintOf(it.paint) : paintMat;
  const g = new THREE.Group();
  const add = (name, u0, u1, z0, z1, v0, v1, m = mat, edges = true) => {
    const geom = new THREE.BoxGeometry(u1 - u0, z1 - z0, v1 - v0);
    const mesh = new THREE.Mesh(geom, m);
    mesh.name = `${it.name}: ${name}`;
    mesh.position.set((u0 + u1) / 2, (z0 + z1) / 2, (v0 + v1) / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), lineMat));
    g.add(mesh);
  };
  const rod = (name, u, v, z0, z1, r0, r1, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, z1 - z0, 16), m);
    mesh.position.set(u, (z0 + z1) / 2, v);
    mesh.name = `${it.name}: ${name}`;
    mesh.castShadow = true;
    g.add(mesh);
  };
  const c0 = 1, c1 = L - 1, vf = D - 1, top = 2.5;

  add('top', 0, L, H - top, H, 0, D);
  add('body', c0, c1, legH, H - top, 0, vf);
  // Turned legs, and reeding down the front corner stiles.
  for (const [u, v] of [[c0 + 2.5, 2.5], [c1 - 2.5, 2.5], [c0 + 2.5, vf - 2.5], [c1 - 2.5, vf - 2.5]]) rod('leg', u, v, 0, legH, 2.2, 1.8);
  for (const side of [c0 + CW.stile / 2, c1 - CW.stile / 2]) {
    for (const du of [-0.9, 0, 0.9]) rod('reeding', side + du, vf + 0.2, legH + 1, H - top - 1, 0.4, 0.4);
  }

  const part = it.sections[0].parts[0];
  let z = H - top - CW.rail;
  for (const row of cotswoldRows({ ...it, h: H + CW.top - top }, part)) {
    const span = c1 - c0 - 2 * CW.stile - CW.rail * (row.n - 1);
    const fw = span / row.n;
    for (let k = 0; k < row.n; k++) {
      const u0 = c0 + CW.stile + k * (fw + CW.rail), u1 = u0 + fw;
      add('drawer', u0 + 0.2, u1 - 0.2, z - row.h + 0.2, z - 0.2, vf - 0.5, vf + 0.3);
      const zc = z - row.h / 2;
      const knobs = fw > 55 ? [u0 + fw * 0.25, u0 + fw * 0.75] : [(u0 + u1) / 2];
      for (const u of knobs) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 10), brassMat);
        knob.scale.set(1, 1, 0.8);
        knob.position.set(u, zc, vf + 1.3);
        knob.name = `${it.name}: brass knob`;
        g.add(knob);
      }
    }
    z -= row.h + CW.rail;
  }
  return g;
}

function buildUnit(it, rand) {
  const { L, D } = lengthDepth(it);
  const H = it.h, p = it.plinth, ds = !!it.doubleSided;
  const vA = ds ? FRONT : 0, vB = D - FRONT;
  const g = new THREE.Group();

  const add = (name, u0, u1, z0, z1, v0, v1, mat = joineryMat, edges = true) => {
    const geom = new THREE.BoxGeometry(u1 - u0, z1 - z0, v1 - v0);
    const m = new THREE.Mesh(geom, mat);
    m.name = `${it.name}: ${name}`;
    m.position.set((u0 + u1) / 2, (z0 + z1) / 2, (v0 + v1) / 2);
    m.castShadow = m.receiveShadow = true;
    if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), lineMat));
    g.add(m);
    return m;
  };
  // Fronts on the room side (and the back too for double-sided units).
  const front = (name, u0, u1, z0, z1, pull) => {
    const sides = ds ? [[vB, D, D, D + 0.1], [0, vA, -0.1, 0]] : [[vB, D, D, D + 0.1]];
    for (const [f0, f1, g0, g1] of sides) {
      add(name, u0, u1, z0, z1, f0, f1);
      if (pull === 'top') add('pull', u0 + 2, u1 - 2, z1 - 1.4, z1 - 0.6, g0, g1, grooveMat, false);
      const out = g1 > 0 ? [D, D + 1.4] : [-1.4, 0];
      if (pull?.knob) add('knob', pull.knob - 0.8, pull.knob + 0.8, pull.z - 0.8, pull.z + 0.8, ...out, grooveMat, false);
    }
  };

  // Carcass.
  if (p > 0) add('plinth', T, L - T, 0, p, ds ? vA + 5 : 0, vB - 5);
  add('base', 0, L, p, p + T, vA, vB);
  add('top', 0, L, H - T, H, vA, vB);
  if (ds) add('spine', T, L - T, p + T, H - T, D / 2 - 0.4, D / 2 + 0.4);
  else add('back', T, L - T, p + T, H - T, 0, 0.8);

  const bounds = [0];
  for (const sec of it.sections) bounds.push(bounds.at(-1) + sec.w);
  bounds.forEach((b, i) => {
    const end = i === 0 || i === bounds.length - 1;
    const [u0, u1] = i === 0 ? [0, T] : i === bounds.length - 1 ? [L - T, L] : [b - T / 2, b + T / 2];
    add('side', u0, u1, end ? 0 : p, H, vA, vB);
  });

  it.sections.forEach((sec, i) => {
    const a = bounds[i], b = bounds[i + 1];
    if (sec.filler) { add('pillar casing', a, b, 0, H, 0, D); return; }
    const ui0 = a + (i === 0 ? T : T / 2), ui1 = b - (i === it.sections.length - 1 ? T : T / 2);
    let zc = p;
    sec.parts.forEach((part, j) => {
      const z0 = zc, z1 = zc + part.h;
      zc = z1;
      const last = j === sec.parts.length - 1;
      if (!last) add('shelf', ui0, ui1, z1 - T, z1, vA, vB);
      const iz0 = j === 0 ? p + T : z0, iz1 = last ? H - T : z1 - T;

      if (part.k === 'drawers') {
        const hp = part.h / part.n;
        for (let n = 0; n < part.n; n++) front('drawer', a + 0.15, b - 0.15, z0 + n * hp + 0.15, z0 + (n + 1) * hp - 0.15, 'top');
      } else if (part.k === 'cupboard') {
        const nd = doorCount(b - a), dw = (b - a) / nd;
        for (let n = 0; n < nd; n++) {
          const d0 = a + n * dw + 0.15, d1 = a + (n + 1) * dw - 0.15;
          const knob = nd === 2 ? (n === 0 ? d1 - 3 : d0 + 3) : d1 - 3;
          front('door', d0, d1, z0 + 0.15, z1 - 0.15, { knob, z: z0 + part.h * (z0 > 100 ? 0.12 : 0.88) });
        }
      } else if (part.k === 'hang') {
        hanging(add, ui0, ui1, iz0, iz1, vA, vB, part.h, rand);
        if (sec.doors) {
          // Fitted look: hinged doors over the hanging.
          const nd = doorCount(b - a), dw = (b - a) / nd;
          for (let n = 0; n < nd; n++) {
            const d0 = a + n * dw + 0.15, d1 = a + (n + 1) * dw - 0.15;
            const knob = nd === 2 ? (n === 0 ? d1 - 3 : d0 + 3) : d1 - 3;
            front('door', d0, d1, z0 + 0.15, z1 - 0.15, { knob, z: z0 + part.h * 0.4 });
          }
        }
      } else if (part.k === 'shelves' || part.k === 'glass') {
        const step = (iz1 - iz0) / (part.n + 1);
        const levels = [iz0];
        for (let n = 1; n <= part.n; n++) {
          const z = iz0 + n * step;
          add(part.k === 'glass' ? 'glass shelf' : 'shelf', ui0, ui1, z - T / 2, z + T / 2, vA + 1, vB - 1, part.k === 'glass' ? glassMat : joineryMat);
          levels.push(z + T / 2);
        }
        if (part.k === 'shelves' && step - T >= 16) {
          // Folded stacks so shelves read as storage.
          const count = Math.floor((ui1 - ui0) / 30);
          for (const z of levels) {
            for (let n = 0; n < count; n++) {
              if (rand() < 0.3) continue;
              const cu = ui0 + (n + 0.5) * ((ui1 - ui0) / count);
              const sh = Math.min(step - T - 5, 8 + rand() * 10);
              const depth = Math.min(26, vB - vA - 6);
              add('folded', cu - 13, cu + 13, z, z + sh, vB - 3 - depth, vB - 3, CLOTHES[Math.floor(rand() * CLOTHES.length)], false);
            }
          }
        }
      }
    });
  });
  return g;
}

// Front-facing rail (deep units) or end-on pull-out rails (shallow units).
function hanging(add, ui0, ui1, iz0, iz1, vA, vB, partH, rand) {
  const railZ = iz1 - 5;
  const long = partH >= 130;
  const len = () => Math.min(railZ - 3 - (iz0 + 3), long ? 105 + rand() * 45 : 70 + rand() * 22);
  if (vB - vA >= 48) {
    const rail = add('rail', ui0, ui1, railZ - 1.2, railZ + 1.2, (vA + vB) / 2 - 1.2, (vA + vB) / 2 + 1.2, railMat, false);
    rail.name = rail.name.replace(': rail', long ? ': long hanging' : ': short hanging');
    const width = Math.min(44, vB - vA - 4), vc = (vA + vB) / 2;
    const n = Math.floor(((ui1 - ui0 - 6) / 4.5) * 0.8);
    for (let k = 0; k < n; k++) {
      const u = ui0 + 3 + k * 4.5 + rand();
      add('garment', u - 0.8, u + 0.8, railZ - 3 - len(), railZ - 3, vc - width / 2, vc + width / 2, CLOTHES[Math.floor(rand() * CLOTHES.length)], false);
    }
  } else {
    const nr = Math.max(1, Math.floor((ui1 - ui0) / 46));
    for (let r = 0; r < nr; r++) {
      const uc = ui0 + (r + 0.5) * ((ui1 - ui0) / nr);
      add('pull-out rail', uc - 1, uc + 1, railZ - 1, railZ + 1, vA + 3, vB - 3, railMat, false);
      const n = Math.floor(((vB - vA - 8) / 4.5) * 0.8);
      const width = Math.min(40, (ui1 - ui0) / nr - 4);
      for (let k = 0; k < n; k++) {
        const v = vA + 5 + k * 4.5;
        add('garment', uc - width / 2, uc + width / 2, railZ - 3 - len(), railZ - 3, v - 0.8, v + 0.8, CLOTHES[Math.floor(rand() * CLOTHES.length)], false);
      }
    }
  }
}

function place(g, it) {
  const x1 = it.x + it.w, y1 = it.y + it.d;
  const [rot, ox, oy] = {
    '+Y': [0, it.x, it.y],
    '+X': [Math.PI / 2, it.x, y1],
    '-X': [-Math.PI / 2, x1, it.y],
    '-Y': [Math.PI, x1, y1],
  }[it.facing];
  g.rotation.y = rot;
  g.position.copy(P(ox, oy, it.z ?? 0));
}

// ---------- Open rails and shelves ----------

// Plan box of a rail's hanging garments: the rail line ± half a garment.
function railBox(it) {
  const alongX = Math.abs(it.x1 - it.x0) >= Math.abs(it.y1 - it.y0);
  const lo = Math.min(...it.rails.map((r) => r.z - r.drop - 3));
  const hi = Math.max(...it.rails.map((r) => r.z + 3));
  if (alongX) {
    return { x: Math.min(it.x0, it.x1), w: Math.abs(it.x1 - it.x0), y: it.y0 - GARMENT_HALF, d: 2 * GARMENT_HALF, z: lo, h: hi - lo };
  }
  return { x: it.x0 - GARMENT_HALF, w: 2 * GARMENT_HALF, y: Math.min(it.y0, it.y1), d: Math.abs(it.y1 - it.y0), z: lo, h: hi - lo };
}

function buildRail(it, rand) {
  const g = new THREE.Group();
  const alongX = Math.abs(it.x1 - it.x0) >= Math.abs(it.y1 - it.y0);
  const len = alongX ? Math.abs(it.x1 - it.x0) : Math.abs(it.y1 - it.y0);
  const a0 = alongX ? Math.min(it.x0, it.x1) : Math.min(it.y0, it.y1);
  const c = alongX ? it.y0 : it.x0; // the rail line's fixed coordinate
  const at = (s, off, z) => (alongX ? P(a0 + s, c + off, z) : P(c + off, a0 + s, z));

  for (const { z, drop } of it.rails) {
    const geom = new THREE.CylinderGeometry(1.3, 1.3, len, 16);
    const rail = new THREE.Mesh(geom, railMat);
    rail.name = `${it.name}: ${drop >= 120 ? 'long' : 'short'} hanging rail`;
    rail.position.copy(at(len / 2, 0, z));
    if (alongX) rail.rotation.z = Math.PI / 2; else rail.rotation.x = Math.PI / 2;
    g.add(rail);
    for (const s of [1.5, len - 1.5]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3, 7, 3), railMat);
      b.position.copy(at(s, 0, z + 2));
      b.name = `${it.name}: rail bracket`;
      g.add(b);
    }
    const n = Math.floor((len - 6) / 4.5 * 0.8);
    for (let k = 0; k < n; k++) {
      const s = 3 + k * 4.5 + rand();
      const L = Math.min(drop, drop * (0.72 + rand() * 0.28));
      const geomG = alongX ? new THREE.BoxGeometry(1.6, L, 2 * GARMENT_HALF - 2) : new THREE.BoxGeometry(2 * GARMENT_HALF - 2, L, 1.6);
      const m = new THREE.Mesh(geomG, CLOTHES[Math.floor(rand() * CLOTHES.length)]);
      m.position.copy(at(s, 0, z - 3 - L / 2));
      m.castShadow = true;
      m.name = `${it.name}: garment`;
      g.add(m);
    }
  }
  return g;
}

function buildShelf(it, rand) {
  const g = new THREE.Group();
  const alongX = it.access === '+Y' || it.access === '-Y';
  const span = alongX ? it.w : it.d, depth = alongX ? it.d : it.w;
  for (const z of it.levels) {
    const m = box(`${it.name}: shelf`, [it.x, it.x + it.w], [it.y, it.y + it.d], [z, z + SHELF_T], joineryMat);
    m.castShadow = true;
    g.add(m);
    // Two brackets under each board, against the wall.
    for (const f of [0.12, 0.88]) {
      const s = f * span;
      const [bx, by] = alongX
        ? [it.x + s, it.access === '+Y' ? it.y : it.y + it.d]
        : [it.access === '+X' ? it.x : it.x + it.w, it.y + s];
      const bw = alongX ? [bx - 0.6, bx + 0.6] : null;
      const d0 = Math.min(depth * 0.6, 20);
      const xr = alongX ? bw : (it.access === '+X' ? [bx, bx + d0] : [bx - d0, bx]);
      const yr = alongX ? (it.access === '+Y' ? [by, by + d0] : [by - d0, by]) : [by - 0.6, by + 0.6];
      g.add(box(`${it.name}: bracket`, xr, yr, [z - 12, z], grooveMat, { edges: false }));
    }
    // Folded stacks / boxes.
    const count = Math.floor(span / 32);
    for (let n = 0; n < count; n++) {
      if (rand() < 0.35) continue;
      const s = (n + 0.5) * (span / count);
      const h = 8 + rand() * 12, dd = Math.min(26, depth - 4);
      const xr = alongX ? [it.x + s - 13, it.x + s + 13] : (it.access === '+X' ? [it.x + 2, it.x + 2 + dd] : [it.x + it.w - 2 - dd, it.x + it.w - 2]);
      const yr = alongX ? (it.access === '+Y' ? [it.y + 2, it.y + 2 + dd] : [it.y + it.d - 2 - dd, it.y + it.d - 2]) : [it.y + s - 13, it.y + s + 13];
      g.add(box(`${it.name}: folded`, xr, yr, [z + SHELF_T, z + SHELF_T + h], CLOTHES[Math.floor(rand() * CLOTHES.length)], { edges: false }));
    }
  }
  return g;
}

// ---------- Hooks ----------
// A hook screwed under a shelf (`z` = shelf underside), HOOK_OFF cm off the wall, optionally
// holding a dressing gown or a cap. The box covers whatever hangs from it.
const HOOK_OFF = 6;
const HUNG = { gown: { out: 16, half: 17, drop: 112 }, cap: { out: 18, half: 11, drop: 18 }, none: { out: 9, half: 1, drop: 0 } };

function hookBox(it) {
  const h = HUNG[it.holds ?? 'none'];
  const lo = it.z - 8 - h.drop;
  const x = it.access === '+X' ? 0 : 180 - h.out;
  return { mount: it.z, x, w: h.out, y: it.y - h.half, d: 2 * h.half, z: lo, h: it.z - lo };
}

function buildHook(it, rand) {
  const g = new THREE.Group();
  const s = it.access === '+X' ? 1 : -1, wall = it.access === '+X' ? 0 : 180;
  const X = (a, b) => [wall + s * a, wall + s * b].sort((p, q) => p - q);
  const y = it.y + (HUNG[it.holds ?? 'none'].half), z = it.mount; // centre line and shelf underside
  // J-hook: stem down from the shelf, out, then a short upturn.
  g.add(box(`${it.name}: hook`, X(HOOK_OFF - 0.5, HOOK_OFF + 0.5), [y - 0.6, y + 0.6], [z - 7, z], grooveMat, { edges: false }));
  g.add(box(`${it.name}: hook`, X(HOOK_OFF, HOOK_OFF + 3.5), [y - 0.6, y + 0.6], [z - 7.5, z - 6.5], grooveMat, { edges: false }));
  g.add(box(`${it.name}: hook`, X(HOOK_OFF + 2.7, HOOK_OFF + 3.5), [y - 0.6, y + 0.6], [z - 7.5, z - 4.5], grooveMat, { edges: false }));
  const top = z - 7;
  if (it.holds === 'gown') {
    // Shoulders bunched on the hook, then the body falling to about knee height.
    g.add(box(`${it.name}: dressing gown`, X(1, 12), [y - 12, y + 12], [top - 30, top], gownMat, { edges: false }));
    g.add(box(`${it.name}: dressing gown`, X(1, 15.5), [y - 16.5, y + 16.5], [top - 112 + 1, top - 30], gownMat, { edges: false }));
  } else if (it.holds === 'cap') {
    const mat = CLOTHES[Math.floor(rand() * CLOTHES.length)];
    const crown = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    crown.rotation.z = -s * Math.PI / 2; // dome faces into the room, opening to the wall
    crown.position.copy(P(wall + s * 3, y, top - 9));
    crown.name = `${it.name}: cap`;
    g.add(crown);
    g.add(box(`${it.name}: cap peak`, X(2, 4), [y - 8, y + 8], [top - 18, top - 16], mat, { edges: false }));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Round seat on three splayed legs; the footprint (w × d) is the spread of the feet.
function threeLegStool(it) {
  const r = it.w / 2, cx = it.x + r, cy = it.y + r, seatT = 3.5;
  const parts = [];
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(r - 3, r - 3, seatT, 40), joineryMat);
  seat.position.copy(P(cx, cy, it.h - seatT / 2));
  seat.name = it.name;
  parts.push(seat);
  for (const a of [90, 210, 330].map((deg) => (deg * Math.PI) / 180)) {
    const top = P(cx + (r - 8) * Math.cos(a), cy + (r - 8) * Math.sin(a), it.h - seatT);
    const foot = P(cx + (r - 1.5) * Math.cos(a), cy + (r - 1.5) * Math.sin(a), 0);
    const dir = top.clone().sub(foot);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.1, dir.length(), 12), joineryMat);
    leg.position.copy(foot.clone().add(top).multiplyScalar(0.5));
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    leg.name = `${it.name}: leg`;
    parts.push(leg);
  }
  parts.forEach((m) => { m.castShadow = true; });
  return parts;
}

export function buildFitout(option) {
  const root = new THREE.Group();
  root.name = 'Fit-out';
  if (!option) return root;
  const { items } = normalise(option);
  const rand = rng(option.id);
  for (const it of items) {
    const z0 = it.z ?? 0;
    let g;
    if (it.type === 'unit') {
      g = it.style === 'cotswold' ? buildCotswold(it) : it.style === 'legged' ? buildLegged(it) : buildUnit(it, rand);
      place(g, it);
    } else if (it.type === 'rail') {
      g = buildRail(it, rand);
    } else if (it.type === 'shelf') {
      g = buildShelf(it, rand);
    } else if (it.type === 'hook') {
      g = buildHook(it, rand);
    } else {
      g = new THREE.Group();
      const mat = { mirror: mirrorMat, slab: it.mat === 'fabric' ? fabricMat : joineryMat }[it.type] ?? fabricMat;
      if (it.type === 'stool' && it.style === 'three-leg') {
        g.add(...threeLegStool(it));
      } else if (it.type === 'stool') {
        const r = it.w / 2;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, it.h, 32), fabricMat);
        m.position.copy(P(it.x + r, it.y + r, it.h / 2));
        m.castShadow = true;
        m.name = it.name;
        g.add(m);
      } else {
        const m = box(it.name, [it.x, it.x + it.w], [it.y, it.y + it.d], [z0, z0 + it.h], mat);
        m.castShadow = true;
        g.add(m);
      }
    }
    g.name = it.name;
    g.userData.wall = WALL_OF[it.facing ?? it.access] ?? null;
    g.userData.flat = it.type === 'mirror';
    g.userData.top = (it.z ?? 0) + (it.h ?? 0);
    root.add(g);
  }
  return root;
}

// ---------- Access ----------

// Every front an item presents: drawers, doors, hanging, shelves. `dir` is the way you face
// it from (the direction the clear zone extends), `face` the plane of the front, [a, b] its
// extent along the face, [z0, z1] its height.
function fronts(it) {
  const out = [];
  if (it.type === 'unit') {
    const { D } = lengthDepth(it);
    const x1 = it.x + it.w, y1 = it.y + it.d;
    const travel = (it.doubleSided ? D / 2 : D) - FRONT - 6;
    const faces = {
      '+Y': [{ dir: '+Y', face: y1, map: (u) => it.x + u }],
      '-Y': [{ dir: '-Y', face: it.y, map: (u) => x1 - u }],
      '+X': [{ dir: '+X', face: x1, map: (u) => y1 - u }],
      '-X': [{ dir: '-X', face: it.x, map: (u) => it.y + u }],
    }[it.facing];
    if (it.doubleSided) faces.push({ dir: '-Y', face: it.y, map: faces[0].map });
    let u = 0;
    for (const sec of it.sections) {
      const u0 = u, u1 = u + sec.w;
      u = u1;
      if (sec.filler) continue;
      let zc = (it.z ?? 0) + it.plinth;
      for (const part of sec.parts) {
        const z0 = part === sec.parts[0] ? (it.z ?? 0) : zc, z1 = zc + part.h;
        zc = z1;
        if (part.k === 'blank') continue;
        for (const f of faces) {
          const [a, b] = [f.map(u0), f.map(u1)].sort((p, q) => p - q);
          out.push({
            label: `${it.name} · ${part.k === 'hang' ? 'hanging' : part.k}`, kind: part.k, dir: f.dir, face: f.face,
            a, b, z0, z1, travel, need: needFor(part.k, travel, sec.w / doorCount(sec.w)),
          });
          // Doors over hanging must also be able to swing open.
          if (part.k === 'hang' && sec.doors) {
            out.push({ label: `${it.name} · hanging doors`, kind: 'cupboard', dir: f.dir, face: f.face, a, b, z0, z1, travel,
              need: needFor('cupboard', travel, sec.w / doorCount(sec.w)) });
          }
        }
      }
    }
  } else if (it.type === 'rail' || it.type === 'shelf') {
    const kind = it.type === 'rail' ? 'hang' : 'shelves';
    const alongX = it.access === '+Y' || it.access === '-Y';
    const face = { '+Y': it.y + it.d, '-Y': it.y, '+X': it.x + it.w, '-X': it.x }[it.access];
    const [a, b] = alongX ? [it.x, it.x + it.w] : [it.y, it.y + it.d];
    out.push({ label: `${it.name} · ${kind === 'hang' ? 'hanging' : 'shelves'}`, kind, dir: it.access, face, a, b,
      z0: it.z, z1: it.z + it.h + (kind === 'shelves' ? 20 : 0), need: NEED[kind] });
  }
  return out;
}

// Plan rectangle in front of a front, from d0 to d1 cm out from its face.
function zoneRect(f, d0, d1) {
  const s = f.dir[0] === '+' ? 1 : -1;
  const [p0, p1] = [f.face + s * d0, f.face + s * d1].sort((a, b) => a - b);
  return f.dir[1] === 'Y' ? { x0: f.a, x1: f.b, y0: p0, y1: p1 } : { x0: p0, x1: p1, y0: f.a, y1: f.b };
}

// Is each front reachable? Its clear zone must be free of other items, the pillar and walls.
function checkAccess(items, spec) {
  const d = derive(spec);
  const { width: W, depth: D } = spec.room;
  const pillar = {
    name: 'the pillar',
    x0: d.pillar.centreX - d.pillar.radius, x1: d.pillar.centreX + d.pillar.radius,
    y0: d.pillar.centreY - d.pillar.radius, y1: d.pillar.centreY + d.pillar.radius, z0: 0, z1: d.pillar.top,
  };
  const boxes = items.filter((it) => it.type !== 'stool' && it.type !== 'mirror').map((it) => ({ ...aabb(it), it }));
  const errors = [], notes = [];
  let count = 0;

  for (const it of items) {
    for (const f of fronts(it)) {
      count++;
      // Drawers: the travel path must be completely clear; the standing room beyond it can be
      // partly taken (you stand a little to one side). Doors: the swing must be clear.
      // Hanging and shelves: reachable as long as most of the space in front is free.
      const zones = f.kind === 'drawers'
        ? [{ d0: 0, d1: f.travel, strict: true }, { d0: f.travel, d1: f.need, limit: 0.5 }]
        : f.kind === 'cupboard' ? [{ d0: 0, d1: f.need, strict: true }] : [{ d0: 0, d1: f.need, limit: 0.35 }];
      // High fronts (shelves over a bench or worktop) can be reached over low things.
      const zr = f.z0 >= 100 ? [f.z0 - 5, f.z1] : [0, f.z1];

      for (const zd of zones) {
        const zone = zoneRect(f, zd.d0, zd.d1);
        const area = (zone.x1 - zone.x0) * (zone.y1 - zone.y0);
        const rects = [];
        const hitters = new Set();
        const test = (o, name) => {
          const ox = Math.min(o.x1, zone.x1) - Math.max(o.x0, zone.x0);
          const oy = Math.min(o.y1, zone.y1) - Math.max(o.y0, zone.y0);
          const oz = Math.min(o.z1, zr[1]) - Math.max(o.z0, zr[0]);
          if (ox > 0.5 && oy > 0.5 && oz > 0.5) { rects.push(o); hitters.add(name); }
        };
        for (const o of boxes) if (o.it !== it) test(o, o.it.name);
        test(pillar, pillar.name);
        // Beyond the walls counts as blocked too.
        const outside = [
          { x0: -1e3, x1: 0, y0: -1e3, y1: 1e3 }, { x0: W, x1: 1e3, y0: -1e3, y1: 1e3 },
          { x0: -1e3, x1: 1e3, y0: -1e3, y1: 0 }, { x0: -1e3, x1: 1e3, y0: D, y1: 1e3 },
        ].filter((o) => Math.min(o.x1, zone.x1) - Math.max(o.x0, zone.x0) > 0.5 && Math.min(o.y1, zone.y1) - Math.max(o.y0, zone.y0) > 0.5);
        if (outside.length) { rects.push(...outside); hitters.add('a wall'); }
        if (!hitters.size) continue;
        const hit = coveredArea(zone, rects);

        const who = [...hitters].join(', ');
        const pct = Math.min(100, Math.round((hit / area) * 100));
        if (zd.strict) {
          errors.push(f.kind === 'drawers'
            ? `${f.label}: can’t open fully, ${who} is in the drawer’s way (needs ${Math.round(f.travel)} cm)`
            : `${f.label}: door can’t swing open, ${who} is in the way`);
        } else if (pct / 100 > zd.limit) {
          errors.push(`${f.label}: ${who} takes ${pct}% of the space needed in front`);
        } else {
          notes.push(`${f.label}: ${who} takes ${pct}% of the space in front (still usable)`);
        }
      }
    }
  }
  return { errors, notes, count };
}

// Area of `zone` covered by any of `rects` (plan), on a 1 cm grid.
function coveredArea(zone, rects) {
  let n = 0;
  for (let x = Math.floor(zone.x0) + 0.5; x < zone.x1; x++) {
    for (let y = Math.floor(zone.y0) + 0.5; y < zone.y1; y++) {
      if (x > zone.x0 && y > zone.y0 && rects.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1)) n++;
    }
  }
  return n;
}

function union(intervals) {
  const s = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0, cur = null;
  for (const [a, b] of s) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

// ---------- Metrics ----------

export function measure(option, spec = SPEC) {
  const opt = normalise(option);
  const m = { drawers: 0, drawerLitres: 0, longRail: 0, shortRail: 0, shelves: 0, cupboardLitres: 0, hooks: 0 };

  for (const it of opt.items) {
    if (it.type === 'rail') {
      const len = Math.hypot(it.x1 - it.x0, it.y1 - it.y0);
      for (const r of it.rails) if (r.drop >= 120) m.longRail += len; else m.shortRail += len;
      continue;
    }
    if (it.type === 'shelf') {
      m.shelves += it.levels.length * (it.access === '+Y' || it.access === '-Y' ? it.w : it.d);
      continue;
    }
    if (it.type === 'hook') { m.hooks++; continue; }
    if (it.type !== 'unit') continue;
    const { D } = lengthDepth(it);
    const sides = it.doubleSided ? 2 : 1;
    const drawerDepth = (it.doubleSided ? D / 2 : D) - FRONT - 6;
    for (const sec of it.sections) {
      if (sec.filler) continue;
      const innerW = sec.w - T;
      for (const part of sec.parts) {
        if (part.k === 'drawers') {
          m.drawers += part.n * sides;
          if (part.rows) {
            for (const row of cotswoldRows(it, part)) {
              m.drawerLitres += (row.n * ((sec.w - 2 * CW.over - 2 * CW.stile) / row.n - 5) * (drawerDepth - CW.over) * (row.h - 5)) / 1000;
            }
          } else {
            m.drawerLitres += (sides * part.n * (innerW - 4) * drawerDepth * (part.h / part.n - 5)) / 1000;
          }
        } else if (part.k === 'hang') {
          const rail = D - FRONT >= 48 ? innerW : Math.max(1, Math.floor(innerW / 46)) * (D - FRONT - 8);
          if (part.h >= 130) m.longRail += rail; else m.shortRail += rail;
        } else if (part.k === 'shelves' || part.k === 'glass') {
          m.shelves += part.n * innerW;
        } else if (part.k === 'cupboard') {
          m.cupboardLitres += (innerW * (D - FRONT - 2) * (part.h - T)) / 1000;
        }
      }
    }
  }
  m.garments = Math.round((m.longRail + m.shortRail) / PER_GARMENT);
  m.aisle = narrowest(opt.items, spec);
  m.pillarGap = pillarClearance(option, spec);

  // Room fit per item, overlaps between items, the walkway between the doors, then access.
  const errors = [...opt.errors], notes = [];
  for (const it of opt.items) {
    const r = checkFit(it, spec);
    r.errors.forEach((e) => errors.push(`${it.name}: ${e}`));
    r.notes.forEach((n) => notes.push(`${it.name}: ${n}`));
  }
  const bb = opt.items.map(aabb);
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05;
  for (let i = 0; i < bb.length; i++) {
    for (let j = i + 1; j < bb.length; j++) {
      const a = bb[i], b = bb[j];
      if (ov(a.x0, a.x1, b.x0, b.x1) && ov(a.y0, a.y1, b.y0, b.y1) && ov(a.z0, a.z1, b.z0, b.z1)) {
        errors.push(`${a.name} overlaps ${b.name}`);
      }
    }
  }
  if (!doorRoute(opt.items, spec)) errors.push(`no ${ROUTE_WIDTH} cm wide route between the two doors`);
  const acc = checkAccess(opt.items, spec);
  return { ...m, errors: [...errors, ...acc.errors], notes: [...notes, ...acc.notes], fronts: acc.count, blocked: acc.errors.length };
}

// Can a person (ROUTE_WIDTH wide) walk from one doorway to the other? Floor-plan search on a
// 2.5 cm grid, keeping half the route width clear of anything below head height, the pillar
// and the solid walls.
const ROUTE_WIDTH = 60;

function doorRoute(items, spec) {
  const d = derive(spec);
  const { width: W, depth: D } = spec.room;
  const fw = spec.doorways.frame.width, r = ROUTE_WIDTH / 2, step = 2.5;
  const obs = items.filter((it) => it.type !== 'mirror' && it.type !== 'stool' && (it.z ?? 0) < 170).map(aabb);
  obs.push(
    { x0: d.pillar.centreX - d.pillar.radius, x1: d.pillar.centreX + d.pillar.radius, y0: d.pillar.centreY - d.pillar.radius, y1: d.pillar.centreY + d.pillar.radius },
    { x0: -10, x1: 0, y0: -10, y1: d.leftOpening.y0 },   // left wall, solid part
    { x0: W, x1: W + 10, y0: -10, y1: d.rightOpening.y0 }, // right wall, solid part
    { x0: -10, x1: W + 10, y0: -10, y1: 0 },             // back wall
    { x0: -10, x1: W + 10, y0: D, y1: D + 10 },          // front wall
    d.radiator,
  );
  const nx = Math.ceil(W / step), ny = Math.ceil(D / step);
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) * step, y = (j + 0.5) * step;
      free[j * nx + i] = obs.every((o) => Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.y0 - y, 0, y - o.y1)) >= r) ? 1 : 0;
    }
  }
  const inDoor = (j, o) => { const y = (j + 0.5) * step; return y > o.y0 + fw && y < D - fw; };
  const seen = new Uint8Array(nx * ny);
  const queue = [];
  for (let j = 0; j < ny; j++) if (free[j * nx] && inDoor(j, d.leftOpening)) { seen[j * nx] = 1; queue.push(j * nx); }
  while (queue.length) {
    const c = queue.pop(), i = c % nx, j = (c - i) / nx;
    if (i === nx - 1 && inDoor(j, d.rightOpening)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (free[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
    }
  }
  return false;
}

const aabb = (it) => ({
  name: it.name, x0: it.x, x1: it.x + it.w, y0: it.y, y1: it.y + it.d, z0: it.z ?? 0, z1: (it.z ?? 0) + it.h,
});

// Main walkway: the narrowest clear width across the room (left ↔ right) between
// floor-standing things, garments and walls. Gaps under 30 cm are joins or dead pockets.
// The pillar is reported separately (pillarClearance) since it only pinches one spot.
function narrowest(items, spec) {
  const { width: W, depth: D } = spec.room;
  const obstacles = floorObstacles(items);
  const all = [...obstacles, { name: 'left wall', wall: true, x0: -10, x1: 0, y0: 0, y1: D }, { name: 'right wall', wall: true, x0: W, x1: W + 10, y0: 0, y1: D }];
  let best = { gap: Infinity, between: '' };
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (a.wall && b.wall) continue;
      const ylo = Math.max(a.y0, b.y0), yhi = Math.min(a.y1, b.y1);
      if (yhi - ylo <= 5) continue;
      const [l, r] = a.x1 <= b.x0 ? [a, b] : [b, a];
      const gap = r.x0 - l.x1;
      const rect = { x0: l.x1, x1: r.x0, y0: ylo, y1: yhi };
      const blocked = all.some((c) => c !== a && c !== b
        && Math.min(c.x1, rect.x1) - Math.max(c.x0, rect.x0) > 0.5 && Math.min(c.y1, rect.y1) - Math.max(c.y0, rect.y0) > 0.5);
      if (gap >= 30 && gap < best.gap && !blocked) best = { gap, between: `${l.name} ↔ ${r.name}` };
    }
  }
  return best.gap === Infinity ? { gap: W, between: 'left wall ↔ right wall (side walls clear)' } : best;
}

function floorObstacles(items) {
  return items
    .filter((it) => it.type !== 'mirror' && it.type !== 'stool' && (it.z ?? 0) < 100 && it.h > 40)
    .map(aabb);
}

// Smallest gap between the pillar and anything beside it (0 = boxed in or touching).
export function pillarClearance(option, spec = SPEC) {
  const d = derive(spec);
  const p = { x0: d.pillar.centreX - d.pillar.radius, x1: d.pillar.centreX + d.pillar.radius, y0: d.pillar.centreY - d.pillar.radius, y1: d.pillar.centreY + d.pillar.radius };
  let best = { gap: Infinity, to: '' };
  for (const o of floorObstacles(normalise(option).items)) {
    const dx = Math.max(o.x0 - p.x1, p.x0 - o.x1, 0), dy = Math.max(o.y0 - p.y1, p.y0 - o.y1, 0);
    const gap = Math.hypot(dx, dy);
    if (gap < best.gap) best = { gap, to: o.name };
  }
  return best;
}
