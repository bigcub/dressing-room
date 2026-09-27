import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SPEC, validate } from './spec.js';
import { P, toRoom, buildRoom, buildDimensions, buildGrid } from './room.js';
import { FITOUTS } from './fitouts.js';
import { buildFitout, measure, joineryMat, paintMat } from './joinery.js';
import { SCHEMES, ELEMENTS } from './schemes.js';

const { width: W, depth: D, height: H } = SPEC.room;

// ---------- Renderer / scene ----------

const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
viewport.appendChild(labels.domElement);

const scene = new THREE.Scene();
// Background is a CSS gradient behind a transparent canvas (see #viewport[data-bg]).

scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d0c4, 1.5));
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.copy(P(W * 0.35, D * 0.75, H + 400));
sun.target.position.copy(P(W / 2, D / 2, 0));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1200 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.copy(P(-200, 400, 150));
scene.add(fill);

const room = buildRoom(SPEC);
const dims = buildDimensions(SPEC);
const grid = buildGrid(SPEC);
let furniture = buildFitout(null);
grid.visible = false;
scene.add(room.root, dims, grid, furniture);

// ---------- Cameras & views ----------

const persp = new THREE.PerspectiveCamera(45, 1, 1, 5000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
let camera = persp;
let controls;
let orthoSpan = 320; // cm visible across the shorter screen dimension in orthographic views

const VIEWS = {
  '3d':    { cam: 'persp', pos: P(W + 120, D + 300, H + 300), target: P(W / 2, D / 2 - 30, 60), rotate: true },
  inside:  { cam: 'persp', pos: P(W / 2 + 10, D - 15, 160), target: P(W / 2, 0, 130), rotate: true, fov: 70 },
  plan:    { cam: 'ortho', pos: P(W / 2, D / 2 + 0.01, 1500), target: P(W / 2, D / 2, 0), rotate: false, span: 290 },
  back:    { cam: 'ortho', pos: P(W / 2, 1500, H / 2), target: P(W / 2, 0, H / 2), rotate: false, span: 310, wall: 'Back wall' },
  left:    { cam: 'ortho', pos: P(1500, D / 2, H / 2), target: P(0, D / 2, H / 2), rotate: false, span: 310, wall: 'Left wall' },
  right:   { cam: 'ortho', pos: P(-1500, D / 2, H / 2), target: P(W, D / 2, H / 2), rotate: false, span: 310, wall: 'Right wall' },
  front:   { cam: 'ortho', pos: P(W / 2, -1500, H / 2), target: P(W / 2, D, H / 2), rotate: false, span: 310, wall: 'Front wall' },
};

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  const aspect = w / h;
  const half = orthoSpan / 2;
  if (aspect >= 1) Object.assign(ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
  else Object.assign(ortho, { left: -half, right: half, top: half / aspect, bottom: -half / aspect });
  ortho.updateProjectionMatrix();
}

let focusWall = null; // elevations show only that wall's joinery

function setView(name) {
  const v = VIEWS[name];
  focusWall = v.wall ?? null;
  camera = v.cam === 'ortho' ? ortho : persp;
  camera.position.copy(v.pos);
  camera.up.set(0, 1, 0);
  if (v.cam === 'ortho') {
    orthoSpan = v.span;
    ortho.zoom = 1;
  } else {
    persp.fov = v.fov ?? 45;
  }
  resize();
  controls?.dispose();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(v.target);
  controls.enableRotate = v.rotate;
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  controls.update();
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}

// ---------- Cutaway ----------

const state = { cutaway: true, ceiling: true };
const tmp = new THREE.Vector3();

function updateCutaway() {
  // Orthographic cameras sit far out along their view axis; test against their position just the same.
  for (const { group, normal, point } of room.cutaway) {
    const outside = tmp.copy(camera.position).sub(point).dot(normal) < 0;
    group.visible = !(state.cutaway && outside);
    const wallDims = dims.getObjectByName(group.name);
    if (wallDims) wallDims.visible = group.visible;
  }
  // Elevations show only the joinery on the wall being looked at. Otherwise joinery stays
  // visible, except flat things on a cut-away wall (mirrors) and anything tall on the front
  // wall, which would sit between the camera and the room.
  const wallVisible = Object.fromEntries(room.cutaway.map(({ group }) => [group.name, group.visible]));
  for (const g of furniture.children) {
    const wall = g.userData.wall;
    if (focusWall) g.visible = wall === focusWall;
    else g.visible = !wall || wallVisible[wall] || !(g.userData.flat || (wall === 'Front wall' && g.userData.top > 120));
  }
  if (!state.ceiling) room.ceiling.visible = false;

  // Seen from above, make the ceiling drop translucent so its footprint shows without hiding the floor.
  const above = camera.position.y > H;
  room.dropMat.opacity = above ? 0.35 : 1;
  room.dropMat.depthWrite = !above;
}

// ---------- Hover readout ----------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const readout = document.getElementById('readout');
let pointerInside = false;

renderer.domElement.addEventListener('pointermove', (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  pointerInside = true;
});
renderer.domElement.addEventListener('pointerleave', () => { pointerInside = false; });

function visibleInScene(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function updateReadout() {
  if (!pointerInside) { readout.textContent = 'Hover the model for X / Y / Z in cm'; return; }
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster
    .intersectObjects([room.root, furniture], true)
    .find((h) => h.object.isMesh && visibleInScene(h.object) && !(h.object === room.drop && room.dropMat.opacity < 1));
  if (!hit) { readout.textContent = '—'; return; }
  const { X, Y, Z } = toRoom(hit.point);
  const f = (n) => n.toFixed(1).padStart(6);
  readout.textContent = `X ${f(X)}   Y ${f(Y)}   Z ${f(Z)}   ${hit.object.name}`;
}

// ---------- UI ----------

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

const toggles = {
  dims: (on) => { dims.visible = on; labels.domElement.style.display = on ? '' : 'none'; },
  grid: (on) => { grid.visible = on; },
  cutaway: (on) => { state.cutaway = on; },
  ceiling: (on) => { state.ceiling = on; room.drop.visible = on; },
};
document.querySelectorAll('[data-toggle]').forEach((el) => {
  el.addEventListener('change', () => toggles[el.dataset.toggle](el.checked));
  toggles[el.dataset.toggle](el.checked);
});

// Colour schemes: a scheme sets every finish; each finish can then be tweaked on its own.
const schemesEl = document.getElementById('schemes');
const finishesEl = document.getElementById('finishes');
const schemeNameEl = document.getElementById('scheme-name');
const colours = {};
const finishes = { ...room.finishes, joinery: [joineryMat], painted: [paintMat] };
let baseScheme = SCHEMES[0];

function renderColours() {
  for (const [key, mats] of Object.entries(finishes)) mats.forEach((m) => m.color.set(colours[key]));
  const tweaked = ELEMENTS.filter(([k]) => colours[k] !== baseScheme[k]).map(([, label]) => label.toLowerCase());
  schemeNameEl.textContent = tweaked.length ? `${baseScheme.name}, tweaked (${tweaked.join(', ')})` : baseScheme.note;
  schemesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.name === baseScheme.name));
  finishesEl.querySelectorAll('input').forEach((el) => {
    el.value = colours[el.dataset.key];
    el.closest('label').classList.toggle('tweaked', colours[el.dataset.key] !== baseScheme[el.dataset.key]);
    el.closest('label').querySelector('code').textContent = colours[el.dataset.key];
  });
  try { localStorage.setItem('colours', JSON.stringify({ scheme: baseScheme.name, colours })); } catch {}
  renderBackground();
}

// Backdrop: 'auto' picks dark behind light walls and light behind dark walls.
const bgEl = document.getElementById('background');
let bgMode = 'auto';
try { bgMode = localStorage.getItem('background') || 'auto'; } catch {}

function renderBackground() {
  const c = new THREE.Color(colours.walls ?? '#ffffff');
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear-light luminance
  const resolved = bgMode === 'auto' ? (lum > 0.18 ? 'dark' : 'light') : bgMode;
  viewport.dataset.bg = resolved;
  // Cut wall tops: charcoal on light/mid backdrops, lighter grey so they still read on dark.
  room.cutMat.color.set(resolved === 'dark' ? 0x8a8d93 : 0x2c2d30);
  bgEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.bg === bgMode));
  bgEl.querySelector('[data-bg="auto"]').title = `Currently ${resolved}`;
}

bgEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  bgMode = b.dataset.bg;
  try { localStorage.setItem('background', bgMode); } catch {}
  renderBackground();
});

function applyScheme(scheme) {
  baseScheme = scheme;
  for (const [k] of ELEMENTS) colours[k] = scheme[k];
  renderColours();
}

schemesEl.innerHTML = SCHEMES.map((sc) => `
  <button data-name="${sc.name}" title="${sc.note}">
    <span class="chip" style="--w:${sc.walls};--p:${sc.pillar};--f:${sc.floor};--t:${sc.frames}"><b></b></span>
    ${sc.name}
  </button>`).join('');
schemesEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) applyScheme(SCHEMES.find((sc) => sc.name === b.dataset.name));
});

finishesEl.innerHTML = ELEMENTS.map(([key, label]) => `
  <label><input type="color" data-key="${key}"><span>${label}</span><code></code></label>`).join('');
finishesEl.addEventListener('input', (e) => {
  colours[e.target.dataset.key] = e.target.value;
  renderColours();
});
document.getElementById('reset-scheme').addEventListener('click', () => applyScheme(baseScheme));

(() => {
  // Restore the last scheme and any tweaks; fall back to the first scheme.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('colours')); } catch {}
  const scheme = SCHEMES.find((sc) => sc.name === saved?.scheme);
  if (!scheme) return applyScheme(SCHEMES[0]);
  baseScheme = scheme;
  for (const [k] of ELEMENTS) {
    const v = saved.colours?.[k];
    colours[k] = /^#[0-9a-f]{6}$/i.test(v ?? '') ? v : scheme[k];
  }
  renderColours();
})();

document.getElementById('export').addEventListener('click', () => {
  // glTF is metres, Y-up: scale cm → m on a temporary wrapper.
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(0.01);
  const parts = [room.root, furniture];
  parts.forEach((p) => wrapper.add(p));
  const restore = [];
  wrapper.traverse((o) => { restore.push([o, o.visible]); o.visible = true; });
  new GLTFExporter().parse(wrapper, (glb) => {
    restore.forEach(([o, v]) => { o.visible = v; });
    parts.forEach((p) => scene.add(p));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    a.download = 'dressing-room.glb';
    a.click();
    URL.revokeObjectURL(a.href);
  }, (err) => console.error(err), { binary: true, onlyVisible: false });
});

// Spec checks in the side panel.
const report = validate(SPEC);
const checks = document.getElementById('checks');
const d = report.derived;
const lines = [
  `Pillar Ø ${d.pillar.diameter.toFixed(2)} cm, centre X ${d.pillar.centreX.toFixed(2)}, Y ${d.pillar.centreY}`,
  `Placed ${SPEC.pillar.leftClearance} cm from the left wall. Clearances + Ø = ${d.pillar.widthCheck.toFixed(2)} cm vs ${W} room width (${d.pillar.discrepancy >= 0 ? '+' : ''}${d.pillar.discrepancy.toFixed(2)})`,
  ...report.errors.map((e) => `✗ ${e}`),
];
checks.innerHTML = lines.map((l) => `<li class="${l.startsWith('✗') ? 'bad' : ''}">${l}</li>`).join('');
if (report.ok) checks.insertAdjacentHTML('afterbegin', '<li class="ok">✓ All datum checks pass</li>');

// ---------- Fit-outs ----------

const fitTable = document.getElementById('fitouts');
const fitDetail = document.getElementById('fitout-detail');
const metrics = Object.fromEntries(FITOUTS.map((f) => [f.id, measure(f)]));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const m1 = (cm) => (cm / 100).toFixed(1);
let currentFit = 'none';

function fitRow(f) {
  const m = metrics[f.id];
  const flag = m.errors.length ? ' <span class="bad" title="Has fit errors">✗</span>' : '';
  return `<tr data-fit="${f.id}"><td>${esc(f.name)}${flag}</td><td>${m.drawers}</td><td>${m1(m.longRail + m.shortRail)}</td><td>${Math.round(m.aisle.gap)}</td></tr>`;
}

fitTable.innerHTML = `
  <thead><tr><th>Option</th><th title="Number of drawers">Drawers</th><th title="Hanging rail, metres">Hang m</th><th title="Walkway width, cm">Aisle</th></tr></thead>
  <tbody>
    <tr data-fit="none"><td colspan="4">Empty room</td></tr>
    ${['Sensible', 'Rails & shelves', 'Creative'].map((tag) => `
      <tr class="group"><td colspan="4">${tag}</td></tr>
      ${FITOUTS.filter((f) => f.tag === tag).map(fitRow).join('')}`).join('')}
  </tbody>`;

function setFitout(id) {
  const f = FITOUTS.find((o) => o.id === id);
  currentFit = f ? id : 'none';
  scene.remove(furniture);
  furniture = buildFitout(f);
  scene.add(furniture);
  fitTable.querySelectorAll('tr[data-fit]').forEach((r) => r.classList.toggle('active', r.dataset.fit === currentFit));
  try { localStorage.setItem('fitout', currentFit); } catch {}

  if (!f) { fitDetail.innerHTML = ''; return; }
  const m = metrics[f.id];
  const list = (items, cls = '') => items.map((t) => `<li class="${cls}">${esc(t)}</li>`).join('');
  fitDetail.innerHTML = `
    <h3>${esc(f.name)} <span class="tag">${f.tag}</span></h3>
    <p>${esc(f.summary)}</p>
    <table class="metrics">
      <tr><td>Drawers</td><td>${m.drawers} · ${Math.round(m.drawerLitres)} L</td></tr>
      <tr><td>Hanging</td><td>${m1(m.longRail)} m long · ${m1(m.shortRail)} m short (≈${m.garments} items)</td></tr>
      <tr><td>Shelves</td><td>${m1(m.shelves)} m</td></tr>
      <tr><td>Cupboards</td><td>${Math.round(m.cupboardLitres)} L</td></tr>
      ${m.hooks ? `<tr><td>Hooks</td><td>${m.hooks}</td></tr>` : ''}
      <tr><td>Walkway width</td><td>${Math.round(m.aisle.gap)} cm</td></tr>
    </table>
    <p class="note">Walkway measured between ${esc(m.aisle.between)}. Pillar: ${m.pillarGap.gap < 1 ? `boxed in / touching ${esc(m.pillarGap.to)}` : `${Math.round(m.pillarGap.gap)} cm clear of ${esc(m.pillarGap.to)}`}.</p>
    <p><b>Pillar:</b> ${esc(f.pillar)}</p>
    <p class="${m.blocked ? 'bad' : 'okline'}"><b>Access:</b> ${m.blocked ? `${m.blocked} of ${m.fronts} fronts blocked` : `all ${m.fronts} drawers, doors, rails and shelves can be opened and reached`}</p>
    <ul class="pros">${list(f.pros)}</ul>
    <ul class="cons">${list(f.cons)}</ul>
    ${m.notes.length ? `<h4>Fit notes</h4><ul class="fitnotes">${list(m.notes)}</ul>` : ''}
    ${m.errors.length ? `<h4>Fit errors</h4><ul>${list(m.errors, 'bad')}</ul>` : ''}`;
}

fitTable.addEventListener('click', (e) => {
  const r = e.target.closest('tr[data-fit]');
  if (r) setFitout(r.dataset.fit);
});
let savedFit = 'none';
try { savedFit = localStorage.getItem('fitout') || 'none'; } catch {}
setFitout(savedFit);

// Expose for console experiments.
Object.assign(window, { THREE, scene, room, SPEC, setView });

// ---------- Loop ----------

window.addEventListener('resize', resize);
setView('3d');
renderer.setAnimationLoop(() => {
  controls.update();
  updateCutaway();
  updateReadout();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});
