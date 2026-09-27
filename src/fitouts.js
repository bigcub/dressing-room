import { SPEC, derive } from './spec.js';

// Fit-out options. All positions in room cm (x from left wall, y from back wall, z from floor).
//
// Items:
//   unit    carcass run. x/y/w/d is its footprint in plan; `facing` is the direction its fronts
//           face: '+Y' on the back wall, '+X' on the left wall, '-X' on the right, '-Y' on the front.
//           `sections` split the run left → right as you face it; each stacks `parts` from the
//           plinth up. One part per section may omit its height and takes what's left.
//   rail    open hanging rail(s) along a line (x0,y0 → x1,y1); `access` is the side you stand on.
//   shelf   open wall shelves: a board footprint and a list of `levels`.
//   mirror, slab, stool   simple pieces.
//   allow   fixtures the item deliberately deals with: 'pillar', 'socket', 'switch'.
//
// Every drawer, door, rail and shelf is checked for a clear zone in front of it (joinery.js),
// so an option only passes if everything in it can actually be opened and reached.
//
// The room, as it constrains layouts:
//   pillar  X 68.4–78.75, Y 23.8–34.2. Its centre line (Y 29) is exactly where a back-wall
//           clothes rail sits, so rails can run wall → pillar → wall.
//   back-left pocket  X 0–68 beside the pillar: anything facing sideways here has the pillar in
//           its way, so it is either faced from the front (+Y) with the left wall kept clear in
//           front of it, or used for open shelves (reachable round the pillar).
//   socket  left wall, Y 35.5–50.1, Z 45–54 · switch  right wall, Y 124.7–133.3, Z 113–121
//   doors   left wall from Y 147, right wall from Y 152; the front strip is the walkway
//   drop    underside 267 over Y 0–53, so tall units are 265

const PIL = derive().pillar;
const PL = +(PIL.centreX - PIL.radius).toFixed(2); // pillar left face  (68.4)
const PR = +(PIL.centreX + PIL.radius).toFixed(2); // pillar right face (78.75)
const PY = PIL.centreY;                            // pillar centre line (29)

const TALL = 265;
const W = SPEC.room.width; // right wall

const drawers = (n, h = null) => ({ k: 'drawers', n, h });
const hang = (h = null) => ({ k: 'hang', h });
const shelves = (n, h = null) => ({ k: 'shelves', n, h });
const glass = (n, h = null) => ({ k: 'glass', n, h });
const cupboard = (h = null) => ({ k: 'cupboard', h });
const knee = (h = null) => ({ k: 'knee', h });
const open = (h = null) => ({ k: 'open', h });
// Cotswold-style chest drawers: rows from the top, e.g. [2, 1, 1, 1] = two over three.
const cotswold = (rows) => ({ k: 'drawers', n: rows.reduce((a, b) => a + b, 0), h: null, rows });
const sec = (w, ...parts) => ({ w, parts });
const filler = (w = 12) => ({ w, filler: true });

const unit = (o) => ({ type: 'unit', h: TALL, z: 0, plinth: 8, allow: [], ...o });
const rail = (o) => ({ type: 'rail', allow: [], ...o });
const shelf = (o) => ({ type: 'shelf', allow: [], ...o });
const hook = (o) => ({ type: 'hook', allow: [], ...o });
const mirror = (o) => ({ type: 'mirror', allow: [], ...o });
const slab = (o) => ({ type: 'slab', allow: [], ...o });

// Common sections.
const doubleHang = (w) => sec(w, hang(100), hang(100), cupboard());
const longHang = (w) => sec(w, hang(165), cupboard());
const drawersShelves = (w) => sec(w, drawers(6, 132), shelves(3));
const drawersHang = (w) => sec(w, drawers(6, 132), hang());
const drawerTower = (w) => sec(w, drawers(8, 176), cupboard());

// Front wall mirror sits above the radiator.
const RAD = derive().radiator;
// A mirror only needs to be about half your height: from 85 to 205 cm shows most people head
// to toe from a step or two back.
const frontMirror = mirror({ name: 'Mirror (over radiator)', facing: '-Y', x: 45, y: 237.5, w: 90, d: 1.5, z: RAD.z1 + 10, h: 205 - RAD.z1 - 10 });

// Open shelves in the back-left pocket, facing the aisle. The socket stays reachable under
// the lowest shelf, and the pillar only stands in front of a small part of it.
const pocketShelves = (d = 42) => unit({
  name: 'Pocket shelves', facing: '+X', x: 0, y: 0, w: 30, d, allow: ['socket'],
  socketNote: 'socket stays reachable under the lowest shelf',
  sections: [sec(d, open(52), shelves(5))],
});

// Low chest under the light switch at the front of the right wall (switch stays above it).
const switchChest = (y0) => unit({
  name: 'Chest under switch', facing: '-X', x: W - 45, y: y0, w: 45, d: 151 - y0, h: 90,
  sections: [sec(151 - y0, drawers(4))],
});

// Rails round the pillar at 200 cm over 90 cm chests, shelves above (the preferred layout).
const railsOverDrawers = [
  rail({ name: 'Left rail', x0: 0, y0: PY, x1: PL - 0.5, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }] }),
  rail({ name: 'Right rail', x0: PR + 0.5, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }] }),
  unit({
    name: 'Chest (left)', facing: '+Y', x: 0, y: 0, w: 66, d: 50, h: 90, allow: ['socket'],
    socketNote: 'socket is behind the chest: move it up to ~100 cm, just above the chest top',
    sections: [sec(66, drawers(4))],
  }),
  unit({ name: 'Chests (right)', facing: '+Y', x: 80, y: 0, w: 100, d: 50, h: 90, sections: [sec(50, drawers(4)), sec(50, drawers(4))] }),
  shelf({ name: 'Back shelves', x: 0, y: 0, w: W, d: 38, levels: [212, 242], access: '+Y', allow: ['pillar'] }),
  // Three-legged stool against the left wall, past the end of the left chest's drawer travel
  // (drawers reach 92 cm from the back wall). A pouf up to ~45 cm across fits the same spot.
  { type: 'stool', style: 'three-leg', name: 'Three-legged stool', facing: '+X', x: 2, y: 107, w: 36, d: 36, h: 45, allow: [] },
  frontMirror,
];

export const FITOUTS = [
  // ---------------------------------------------------------------- Sensible
  {
    id: 'drawer-galley',
    name: 'Drawer galley',
    tag: 'Sensible',
    summary: 'Two straight runs facing each other across an 80 cm aisle. Left: 45 cm drawer run with shelves above. Right: 55 cm run with drawers under hanging, and long hanging at the back. The back-left pocket beside the pillar is open shelving.',
    pillar: 'Stands at the back of the aisle. Only open shelving and hanging sit beside it (both reachable round it); every drawer bank is in front of it.',
    pros: ['24 drawers, all of which open fully', 'No blind corners: every front faces the aisle', 'Light switch and socket untouched'],
    cons: ['Back wall behind the pillar left bare', 'Aisle is 80 cm: fine, but drawers opposite each other can’t both be open'],
    items: [
      pocketShelves(52),
      unit({ name: 'Left run', facing: '+X', x: 0, y: 52, w: 45, d: 94, sections: [drawersShelves(47), drawersShelves(47)] }),
      unit({ name: 'Right run', facing: '-X', x: W - 55, y: 0, w: 55, d: 123, sections: [longHang(41), drawersHang(41), drawersHang(41)] }),
      frontMirror,
    ],
  },
  {
    id: 'wardrobe-galley',
    name: 'Wardrobe galley',
    tag: 'Sensible',
    summary: 'Same two-run layout, weighted to hanging: the right run is all hanging (long at the back, double hanging in front); the left run is drawers with shelves over.',
    pillar: 'At the back of the aisle, beside the long hanging and pocket shelves.',
    pros: ['About 2 m of hanging plus 14 drawers', 'Double hanging for shirts and jackets at the front where it’s easy to reach'],
    cons: ['Fewer drawers than the drawer galley'],
    items: [
      pocketShelves(52),
      unit({ name: 'Left run', facing: '+X', x: 0, y: 52, w: 45, d: 94, sections: [drawersShelves(47), sec(47, drawers(8, 176), cupboard())] }),
      unit({ name: 'Right run', facing: '-X', x: W - 55, y: 0, w: 55, d: 123, sections: [longHang(41), doubleHang(41), doubleHang(41)] }),
      frontMirror,
    ],
  },
  {
    id: 'back-wardrobe',
    name: 'Back-wall wardrobe',
    tag: 'Sensible',
    summary: 'One fitted wardrobe across the whole back wall, 55 cm deep, with the pillar boxed into it. Side walls are kept clear in front of it so every door and drawer opens, with a drawer tower and a low chest near the front.',
    pillar: 'Boxed into a 12 cm filler inside the back wardrobe. Its front face is 21 cm behind the doors, so it disappears.',
    pros: ['Pillar completely hidden', 'Walk in and everything is in front of you', 'Most open floor of the fitted options'],
    cons: ['Side walls only used near the front', 'Socket ends up inside the wardrobe (needs a cut-out or moving)'],
    items: [
      unit({
        name: 'Back wardrobe', facing: '+Y', x: 0, y: 0, w: W, d: 55, allow: ['pillar', 'socket'],
        sections: [doubleHang(67), filler(), drawerTower(50.5), longHang(W - 129.5)],
      }),
      unit({ name: 'Left tower', facing: '+X', x: 0, y: 111, w: 45, d: 35, sections: [drawersShelves(35)] }),
      switchChest(111),
      frontMirror,
    ],
  },

  {
    id: 'fitted-mirror-pier',
    name: 'Fitted wardrobes + mirrored pier',
    tag: 'Sensible',
    summary: 'Built-in wardrobes either side of the pillar, 60 cm deep, floor to 265 cm: four drawers at the bottom, hanging behind doors above, cupboards at the top. The pillar is hidden behind a 40 cm wide panel, flush with the wardrobe fronts, carrying a full-length mirror.',
    pillar: 'Enclosed behind the mirrored panel. The panel and its frame fix to the wardrobe sides, never to the pillar; the pillar just sits in the void.',
    pros: ['Reads as one fitted wall with a mirror at its centre', 'Pillar completely out of sight, nothing fixed to it', '12 drawers at waist height, all hanging behind doors'],
    cons: ['Hanging is short (shirts, jackets); no long hanging', 'Deeper units push the stool to the front of the right wall', 'Socket ends up inside the left wardrobe: move it'],
    items: [
      unit({
        name: 'Left wardrobe', facing: '+Y', x: 0, y: 0, w: 53, d: 60, allow: ['socket'],
        socketNote: 'socket is inside the left wardrobe: move it (e.g. to the right wall by the switch)',
        sections: [{ w: 53, doors: true, parts: [drawers(4, 82), hang(118), cupboard()] }],
      }),
      unit({ name: 'Mirror pier', facing: '+Y', x: 53, y: 0, w: 40, d: 60, allow: ['pillar'], sections: [filler(40)] }),
      mirror({ name: 'Pier mirror', facing: '+Y', x: 55.5, y: 60, w: 35, d: 1, z: 30, h: 170 }),
      unit({
        name: 'Right wardrobe', facing: '+Y', x: 93, y: 0, w: W - 93, d: 60,
        sections: [
          { w: (W - 93) / 2, doors: true, parts: [drawers(4, 82), hang(118), cupboard()] },
          { w: (W - 93) / 2, doors: true, parts: [drawers(4, 82), hang(118), cupboard()] },
        ],
      }),
      { type: 'stool', style: 'three-leg', name: 'Three-legged stool', facing: '-X', x: W - 38, y: 114, w: 36, d: 36, h: 45, allow: [] },
    ],
  },

  // ---------------------------------------------------------------- Rails & shelves
  {
    id: 'open-pillar-rails',
    name: 'Open rails round the pillar',
    tag: 'Rails & shelves',
    summary: 'No wardrobes: clothes rails on the back wall run from the left wall to the pillar and from the pillar to the right wall, on the pillar’s own centre line. Two long shelves above, notched round the pillar. A chest of drawers sits under the right-hand rail.',
    pillar: 'Becomes part of the hanging line: rails stop at it (clamp brackets), garments hang either side of it.',
    pros: ['Cheapest and most flexible', 'Pillar is used rather than hidden', 'Long hanging on the left, shirts over a chest on the right'],
    cons: ['Clothes are on show (no doors)', 'Fewer drawers'],
    items: [
      rail({ name: 'Left rail', x0: 0, y0: PY, x1: PL - 0.5, y1: PY, access: '+Y', rails: [{ z: 190, drop: 130 }] }),
      rail({ name: 'Right rail', x0: PR + 0.5, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }] }),
      unit({ name: 'Chest under rail', facing: '+Y', x: 80, y: 0, w: 100, d: 50, h: 90, sections: [sec(50, drawers(4)), sec(50, drawers(4))] }),
      shelf({ name: 'Back shelves', x: 0, y: 0, w: W, d: 38, levels: [212, 242], access: '+Y', allow: ['pillar'] }),
      unit({ name: 'Left shelf tower', facing: '+X', x: 0, y: 110, w: 35, d: 36, sections: [sec(36, shelves(7))] }),
      switchChest(118),
      frontMirror,
    ],
  },
  {
    id: 'open-rails-drawers',
    name: 'Open rails over drawers',
    tag: 'Rails & shelves',
    summary: 'Rails round the pillar at 200 cm with a 90 cm chest of drawers under each: one in the pocket left of the pillar, two to its right. Two long shelves above. A mirror over the radiator on the front wall, and a three-legged stool against the left wall, beyond the reach of the drawers.',
    pillar: 'Part of the hanging line: rails stop at it (clamp brackets); chests sit either side of it.',
    pros: ['Drawers under all the hanging: 12 drawers, all at waist height', 'Every chest is off-the-shelf: 90 cm high, up to 50 cm deep', 'Stool sits past the end of the drawers’ travel, and moves anywhere', 'Middle of the room left completely open'],
    cons: ['No long hanging (coats, dresses) over the chests', 'Socket ends up behind the left chest: move it to just above the chest top (~100 cm) for charging'],
    items: railsOverDrawers,
  },
  {
    id: 'open-rails-drawers-wrap',
    name: 'Rails over drawers + wrap-round shelves',
    tag: 'Rails & shelves',
    summary: 'Open rails over drawers, with the two high shelves carried round the corners and along both side walls up to the door frames (30 cm deep on the sides). Hooks under the side shelves: a dressing gown over the stool, and caps.',
    pillar: 'As Open rails over drawers: part of the hanging line, chests either side.',
    pros: ['About 4 m more shelf, all above head height (212 and 242 cm)', '7 hooks under the side shelves for a dressing gown and caps', 'Nothing added below 2 m apart from what hangs on the hooks'],
    cons: ['Shelves run all round the room at head height, which can feel low and heavy', 'Back-shelf corners sit behind the side shelves, so they’re awkward to reach', 'Everything up there needs a step'],
    items: [
      ...railsOverDrawers,
      shelf({ name: 'Left wall shelves', x: 0, y: 38, w: 30, d: 108, levels: [212, 242], access: '+X' }),
      shelf({ name: 'Right wall shelves', x: W - 30, y: 38, w: 30, d: 113, levels: [212, 242], access: '-X' }),
      // Hooks under the lower side shelves. The gown hangs over the stool (like coat hooks over a
      // hall bench); the right wall has caps only, so nothing hangs over the light switch.
      hook({ name: 'Hook L1', access: '+X', y: 66, z: 212, holds: 'cap' }),
      hook({ name: 'Hook L2', access: '+X', y: 90, z: 212, holds: 'cap' }),
      hook({ name: 'Hook L3', access: '+X', y: 108, z: 212 }),
      hook({ name: 'Robe hook', access: '+X', y: 126, z: 212, holds: 'gown' }),
      hook({ name: 'Hook R1', access: '-X', y: 66, z: 212, holds: 'cap' }),
      hook({ name: 'Hook R2', access: '-X', y: 88, z: 212 }),
      hook({ name: 'Hook R3', access: '-X', y: 110, z: 212, holds: 'cap' }),
    ],
  },
  {
    id: 'tallboy-rail-chest',
    name: 'Tallboy + rail over chest',
    tag: 'Rails & shelves',
    summary: 'A Cotswold-style tallboy (two over four) fills the narrow pocket left of the pillar. The wider space right of the pillar has a rail at 200 cm over a matching 90 cm chest (two over three). Painted bodies, oak tops, black cup handles. Long shelves above; stool on the left wall, mirror over the radiator.',
    pillar: 'Separates the tallboy from the hanging; the rail fixes to it (clamp bracket).',
    pros: ['11 deep drawers in a matching painted-and-oak pair', 'Tallboy uses the pocket’s height without hanging over it', 'Hanging kept where it’s widest (1 m)'],
    cons: ['About 1 m of hanging, all short (shirts, jackets, folded trousers)', 'Socket is behind the tallboy: move it up, or to the other side of the pillar'],
    items: [
      rail({ name: 'Rail', x0: PR + 0.5, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }] }),
      unit({
        name: 'Tallboy', facing: '+Y', style: 'cotswold', x: 0, y: 0, w: 64, d: 45, h: 125, allow: ['socket'],
        socketNote: 'socket is behind the tallboy: move it up above ~135 cm or onto the right-hand wall',
        sections: [sec(64, cotswold([2, 1, 1, 1, 1]))],
      }),
      unit({ name: 'Chest', facing: '+Y', style: 'cotswold', x: 80, y: 0, w: 100, d: 50, h: 90, sections: [sec(100, cotswold([2, 1, 1, 1]))] }),
      shelf({ name: 'Back shelves', x: 0, y: 0, w: W, d: 38, levels: [212, 242], access: '+Y', allow: ['pillar'] }),
      { type: 'stool', style: 'three-leg', name: 'Three-legged stool', facing: '+X', x: 2, y: 107, w: 36, d: 36, h: 45, allow: [] },
      frontMirror,
    ],
  },
  {
    id: 'blue-chests',
    name: 'John Lewis Pillar pair',
    tag: 'Rails & shelves',
    summary: 'John Lewis Pillar 6-drawer tallboy (136 × 54 × 46) in the pocket left of the pillar, Pillar 5-drawer chest (121 × 91 × 46) centred on the right. Because the chest is 121 cm tall, the rail above it at 200 cm only suits folded trousers, skirts and cropped pieces (about 70 cm drop): shirts and jackets would sit on the chest top. Long shelves above; stool on the left wall, mirror over the radiator.',
    pillar: 'Between the two pieces; the rail fixes to it with a clamp collar.',
    pros: ['Matching pair, off the shelf (£300 together)', 'Tallboy sits clear of the wall, so the socket stays reachable beside it', 'Legs keep the floor visible underneath, so the room feels lighter'],
    cons: ['The chest is 121 cm tall: no shirt or jacket hanging over it, only trousers/skirts', 'No proper hanging anywhere in this layout (about 1 m of trouser rail)'],
    items: [
      // Trouser rail: folded trousers on a hanger hang ~70 cm, clearing the 121 cm chest.
      rail({ name: 'Trouser rail', x0: PR + 0.5, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 70 }] }),
      unit({
        name: 'Pillar 6-drawer tallboy', facing: '+Y', style: 'legged', paint: '#4e6677', x: 7, y: 0, w: 54, d: 46, h: 136, plinth: 14,
        sections: [sec(54, { ...cotswold([1, 1, 1, 1, 1, 1]), equal: true })],
      }),
      unit({
        name: 'Pillar 5-drawer chest', facing: '+Y', style: 'legged', paint: '#4e6677', x: (PR + W) / 2 - 45.5, y: 0, w: 91, d: 46, h: 121, plinth: 14,
        sections: [sec(91, { ...cotswold([2, 1, 1, 1]), equal: true })],
      }),
      shelf({ name: 'Back shelves', x: 0, y: 0, w: W, d: 38, levels: [212, 242], access: '+Y', allow: ['pillar'] }),
      { type: 'stool', style: 'three-leg', name: 'Three-legged stool', facing: '+X', x: 2, y: 107, w: 36, d: 36, h: 45, allow: [] },
      frontMirror,
    ],
  },
  {
    id: 'open-rails-pocket-bench',
    name: 'Open rails + pocket bench',
    tag: 'Rails & shelves',
    summary: 'The pocket left of the pillar becomes a built-in bench with drawers and shoe shelves above. Right of the pillar, the rail is split: long hanging next to the pillar, short hanging over a chest by the right wall. Long shelves above everything; side walls clear apart from a mirror.',
    pillar: 'Divides seat from hanging: the bench is scribed to one side, the rail fixes to the other.',
    pros: ['Seat built into the dead pocket, so the room stays open', 'Socket in the bench end: boot dryer or phone charging', 'Nothing in front of the doors'],
    cons: ['Less hanging and fewer drawers than the front-bench version', 'The split rail needs a slim upright (or hangs from the shelf) where long meets short'],
    items: [
      unit({
        name: 'Bench', facing: '+Y', x: 0, y: 0, w: 67, d: 45, h: 46, allow: ['socket'],
        socketNote: 'socket reached through a cut-out in the bench end (boot dryer / charging)',
        sections: [sec(67, drawers(2))],
      }),
      slab({ name: 'Bench cushion', mat: 'fabric', x: 2, y: 0, w: 65, d: 45, z: 46, h: 6 }),
      shelf({ name: 'Shoe shelves', x: 0, y: 0, w: 67, d: 25, levels: [150, 180], access: '+Y' }),
      rail({ name: 'Long rail', x0: PR + 0.5, y0: PY, x1: 128, y1: PY, access: '+Y', rails: [{ z: 190, drop: 135 }] }),
      rail({ name: 'Short rail', x0: 128, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }] }),
      unit({ name: 'Chest under rail', facing: '+Y', x: 128, y: 0, w: W - 128, d: 50, h: 90, sections: [sec(W - 128, drawers(4))] }),
      shelf({ name: 'Back shelves', x: 0, y: 0, w: W, d: 38, levels: [212, 242], access: '+Y', allow: ['pillar'] }),
      mirror({ name: 'Mirror (left wall)', facing: '+X', x: 0, y: 55, w: 1.5, d: 85, z: 20, h: 185 }),
    ],
  },
  {
    id: 'open-galley',
    name: 'Open rail galley',
    tag: 'Rails & shelves',
    summary: 'A long open rail system down the right wall (long hanging at the back, double hanging in front) with shelves above, facing freestanding drawer chests and wall shelves on the left.',
    pillar: 'Stands at the back of the aisle, 50 cm clear of the hanging. Nothing needs to open past it.',
    pros: ['1.8 m of open rail', 'Chests and shelves can be bought off the shelf', 'Socket stays reachable under the pocket shelves'],
    cons: ['Clothes on show', 'Chest drawers are 50 cm deep, so they’re the main drawer storage (12)'],
    items: [
      rail({ name: 'Long rail', x0: W - PY, y0: 0, x1: W - PY, y1: 60, access: '-X', rails: [{ z: 195, drop: 140 }] }),
      rail({ name: 'Double rail', x0: W - PY, y0: 60, x1: W - PY, y1: 120, access: '-X', rails: [{ z: 205, drop: 95 }, { z: 100, drop: 88 }] }),
      shelf({ name: 'Shelves over rails', x: W - 40, y: 0, w: 40, d: 120, levels: [215, 245], access: '-X' }),
      pocketShelves(52),
      unit({ name: 'Drawer chests', facing: '+X', x: 0, y: 52, w: 50, d: 94, h: 140, sections: [sec(47, drawers(6)), sec(47, drawers(6))] }),
      shelf({ name: 'Shelves over chests', x: 0, y: 52, w: 30, d: 94, levels: [170, 200, 230], access: '+X' }),
      frontMirror,
    ],
  },

  // ---------------------------------------------------------------- Creative
  {
    id: 'drawer-max',
    name: 'Drawer max',
    tag: 'Creative',
    summary: 'The drawer galley pushed as far as it goes: drawer towers on the left, drawers under every hanging section on the right (run taken to the door frame, switch moved), and cupboards bridging the walkway above both door heads.',
    pillar: 'At the back of the aisle beside long hanging and open shelves; no drawer opens towards it.',
    pros: ['34 drawers, every one fully openable', 'Over-door cupboards add suitcase/seasonal space', 'Walkway headroom stays at 208 cm'],
    cons: ['Light switch has to move to the door side of the frame', 'Top drawers of the towers are at chest height (up to 184 cm)'],
    items: [
      pocketShelves(52),
      unit({ name: 'Left run', facing: '+X', x: 0, y: 52, w: 45, d: 94, sections: [drawerTower(47), drawerTower(47)] }),
      unit({
        name: 'Right run', facing: '-X', x: W - 55, y: 0, w: 55, d: 151, allow: ['switch'],
        sections: [longHang(41), drawersHang(37), drawersHang(37), drawersHang(36)],
      }),
      unit({
        name: 'Over-door cupboards', facing: '-Y', x: 0, y: 199, w: W, d: 40, z: 208, h: 57, plinth: 0,
        sections: [sec(W / 4, cupboard()), sec(W / 4, cupboard()), sec(W / 4, cupboard()), sec(W / 4, cupboard())],
      }),
      frontMirror,
    ],
  },
  {
    id: 'niche-wall',
    name: 'Pillar niche wall',
    tag: 'Creative',
    summary: 'A fitted back wall split around the pillar into a lit 30 cm niche: shallow jewellery drawers in front of the pillar, glass shelves above. Hanging and a drawer tower either side; small drawer tower and chest near the front.',
    pillar: 'The centrepiece: shown off in a glass-shelved niche, boxed in only below the jewellery drawers.',
    pros: ['Turns the pillar into a feature', 'Jewellery/watch drawers at a comfortable height', '22 drawers'],
    cons: ['Glass shelves need notching round the pillar', 'Socket ends up inside the left wardrobe'],
    items: [
      unit({ name: 'Back (left)', facing: '+Y', x: 0, y: 0, w: 58, d: 60, allow: ['socket'], sections: [doubleHang(58)] }),
      unit({ name: 'Niche casing', facing: '+Y', x: 58, y: 0, w: 30, d: 35, h: 80, allow: ['pillar'], sections: [filler(30)] }),
      unit({ name: 'Jewellery drawers', facing: '+Y', x: 58, y: 35, w: 30, d: 25, h: 80, sections: [sec(30, drawers(4))] }),
      unit({ name: 'Glass niche', facing: '+Y', x: 58, y: 0, w: 30, d: 60, z: 80, h: 185, plinth: 0, allow: ['pillar'], sections: [sec(30, glass(4))] }),
      unit({ name: 'Back (right)', facing: '+Y', x: 88, y: 0, w: W - 88, d: 60, sections: [drawerTower(46), longHang(W - 134)] }),
      unit({ name: 'Left tower', facing: '+X', x: 0, y: 116, w: 45, d: 30, sections: [drawersShelves(30)] }),
      switchChest(116),
      frontMirror,
    ],
  },
  {
    id: 'dressing-nook',
    name: 'Dressing-table nook',
    tag: 'Creative',
    summary: 'The awkward pocket left of the pillar becomes a dressing table with a lit mirror, using the existing socket for a hairdryer. A full-height wardrobe fills the back wall right of the pillar.',
    pillar: 'Frames the nook: dressing table on one side, wardrobe scribed to the other.',
    pros: ['A proper sit-down grooming spot', 'Existing socket is exactly where a hairdryer wants it', 'Pillar reads as deliberate'],
    cons: ['Gives up the pocket as storage', '17 drawers'],
    items: [
      unit({ name: 'Dressing table', facing: '+Y', x: 0, y: 0, w: 66, d: 45, h: 76, plinth: 0, allow: ['socket'], socketNote: 'socket sits under the table top, where a hairdryer plugs in', sections: [sec(66, knee(62), drawers(1, 14))] }),
      mirror({ name: 'Vanity mirror', facing: '+Y', x: 6, y: 0, w: 54, d: 1.5, z: 95, h: 110 }),
      { type: 'stool', name: 'Stool', x: 18, y: 55, w: 30, d: 30, h: 45, allow: [] },
      unit({ name: 'Wardrobe', facing: '+Y', x: 79, y: 0, w: W - 79, d: 60, sections: [drawersHang(50.5), doubleHang(W - 129.5)] }),
      unit({ name: 'Left tower', facing: '+X', x: 0, y: 111, w: 45, d: 35, sections: [drawersShelves(35)] }),
      switchChest(116),
      frontMirror,
    ],
  },
  {
    id: 'bench-rails',
    name: 'Bench & open rails',
    tag: 'Creative',
    summary: 'A padded bench with deep drawers fills the pocket left of the pillar, with shoe cubbies above. Right of the pillar, open double-hanging rails run from the pillar to the wall under two shelves.',
    pillar: 'Divides sitting (left) from hanging (right); the rails fix to it.',
    pros: ['Somewhere to sit and put shoes on', '2 m of open double hanging', 'Socket in the bench end for a boot dryer or charging'],
    cons: ['Only 12 drawers', 'Clothes on show'],
    items: [
      unit({ name: 'Bench', facing: '+Y', x: 0, y: 0, w: 66, d: 45, h: 46, allow: ['socket'], socketNote: 'socket reached through a cut-out in the bench end (boot dryer / charging)', sections: [sec(66, drawers(2))] }),
      slab({ name: 'Bench cushion', mat: 'fabric', x: 2, y: 0, w: 64, d: 45, z: 46, h: 5 }),
      unit({ name: 'Shoe cubbies', facing: '+Y', x: 0, y: 0, w: 66, d: 25, z: 110, h: 155, plinth: 0, sections: [sec(66, shelves(4))] }),
      rail({ name: 'Double rail', x0: PR + 0.5, y0: PY, x1: W, y1: PY, access: '+Y', rails: [{ z: 200, drop: 92 }, { z: 100, drop: 88 }] }),
      shelf({ name: 'Shelves over rails', x: 79, y: 0, w: W - 79, d: 38, levels: [212, 242], access: '+Y' }),
      unit({ name: 'Left tower', facing: '+X', x: 0, y: 108, w: 45, d: 38, sections: [drawersShelves(38)] }),
      switchChest(108),
      frontMirror,
    ],
  },
  {
    id: 'dresser',
    name: 'Dresser & worktop',
    tag: 'Creative',
    summary: 'Waist-height drawer chests across the back wall with one continuous worktop, the pillar rising through it like a column. Mirror and open shelves above; a drawer tower and chest near the front.',
    pillar: 'Rises through a scribed cut-out in the worktop; boxed in below it.',
    pros: ['Worktop to lay out outfits, watches, jewellery', 'Room feels open above 93 cm', '19 drawers'],
    cons: ['No hanging: suits someone whose hanging lives elsewhere', 'Socket inside the left chest'],
    items: [
      unit({ name: 'Chest (left)', facing: '+Y', x: 0, y: 0, w: 67, d: 45, h: 90, allow: ['socket'], sections: [sec(67, drawers(3))] }),
      unit({ name: 'Pillar casing', facing: '+Y', x: 67, y: 0, w: 12, d: 45, h: 90, allow: ['pillar'], sections: [filler()] }),
      unit({ name: 'Chest (right)', facing: '+Y', x: 79, y: 0, w: W - 79, d: 45, h: 90, sections: [sec(50.5, drawers(3)), sec(W - 129.5, drawers(3))] }),
      slab({ name: 'Worktop', x: 0, y: 0, w: W, d: 46, z: 90, h: 3, allow: ['pillar'] }),
      shelf({ name: 'Wall shelves', x: 0, y: 0, w: 66, d: 25, levels: [125, 160, 195, 230], access: '+Y' }),
      mirror({ name: 'Mirror (back wall)', facing: '+Y', x: 86, y: 0, w: 88, d: 1.5, z: 100, h: 125 }),
      unit({ name: 'Left tower', facing: '+X', x: 0, y: 108, w: 45, d: 38, sections: [drawersShelves(38)] }),
      switchChest(108),
      frontMirror,
    ],
  },
];
