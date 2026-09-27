// Room specification. All values in centimetres.
//
// Datum / axes (room coordinates):
//   X = 0 at the inside face of the LEFT wall, increasing to the right (0 → 180)
//   Y = 0 at the inside face of the BACK wall, increasing towards the front (0 → 239)
//   Z = 0 at floor level, increasing upwards (0 → 270)
//
// Values marked MEASURED come from the survey and are authoritative.
// Values marked ASSUMED were not given and are placeholders to be confirmed.

export const SPEC = {
  room: {
    width: 181.8, // MEASURED, X, left wall → right wall along the back wall
    depth: 239,   // MEASURED, Y, back wall → front wall
    height: 270,  // MEASURED, Z, floor → main ceiling
  },

  walls: {
    thickness: 10, // ASSUMED, drawn outside the internal envelope only; does not affect internal dims
    // MEASURED (construction): back wall is plasterboard on concrete block (dot-and-dab);
    // side walls are plasterboard on timber battens. See shelf-fixing.html.
  },

  ceilingDrop: {
    depth: 53, // MEASURED, Y 0 → 53, full room width
    drop: 3,   // MEASURED, underside at 270 - 3 = 267
  },

  pillar: {
    // Exposed cast-iron structural column: nothing may be drilled into or fixed through it.
    circumference: 32.5, // MEASURED
    leftClearance: 68.4, // MEASURED, left wall → left edge of pillar
    rightClearance: 102.5, // MEASURED, right edge of pillar → right wall
    centreY: 29, // MEASURED (approx), back wall → pillar centre
  },

  socket: {
    y: 42.8,       // MEASURED, back wall → socket centre, along left wall
    z: 49.4,       // MEASURED, floor → socket centre
    plateW: 14.6,  // ASSUMED, UK double socket faceplate 146 × 86 mm
    plateH: 8.6,
    plateT: 1.0,
  },

  lightSwitch: {
    y: 129,        // MEASURED, back wall → switch centre, along right wall
    z: 117,        // MEASURED, floor → switch centre
    plateW: 8.6,   // ASSUMED, UK double (2-gang) switch plate 86 × 86 mm
    plateH: 8.6,
    plateT: 1.0,
  },

  radiator: {
    // On the front wall between the two doors. Position and size not yet surveyed.
    centreX: 90.9, // ASSUMED, centred on the front wall
    w: 100,      // ASSUMED, panel width
    h: 60,       // ASSUMED, panel height
    z: 15,       // ASSUMED, floor → bottom of panel
    d: 11,       // ASSUMED, wall → front of panel (double panel on brackets)
  },

  doorways: {
    // Solid wall runs from Y = 0 to `solidTo`; the opening runs from there to the front wall.
    // `height` is the clear height: floor → underside of the frame head. The structural
    // opening is taller by the frame width.
    left: { solidTo: 147, height: 198 },  // MEASURED
    right: { solidTo: 152, height: 200 }, // MEASURED
    frame: {
      width: 3,   // ASSUMED, face width of the simple frame/jamb, sits inside the opening
      proud: 1,   // ASSUMED, how far the frame stands proud of the wall face into the room
    },
  },
};

// Derived values. Kept separate so the raw survey above stays readable.
export function derive(spec = SPEC) {
  const { room, ceilingDrop, pillar, doorways } = spec;

  const diameter = pillar.circumference / Math.PI;
  const radius = diameter / 2;

  // Positioned from the left wall: the left clearance is used exactly. The two clearances plus
  // the diameter come to 1.25 cm more than the room width, so the right-hand gap in the model
  // is that much smaller than taped (see widthCheck / discrepancy).
  const centreFromLeft = pillar.leftClearance + radius;
  const centreFromRight = room.width - pillar.rightClearance - radius;
  const centreX = centreFromLeft;
  const widthCheck = pillar.leftClearance + diameter + pillar.rightClearance;

  const dropUnderside = room.height - ceilingDrop.drop;

  const opening = (door) => ({
    y0: door.solidTo,
    y1: room.depth,
    width: room.depth - door.solidTo,
    clearHeight: door.height,
    top: door.height + doorways.frame.width, // top of structural opening
  });

  return {
    pillar: {
      diameter,
      radius,
      centreX,
      centreY: pillar.centreY,
      centreFromLeft,
      centreFromRight,
      widthCheck,
      discrepancy: widthCheck - room.width,
      top: dropUnderside,
    },
    dropUnderside,
    radiator: {
      x0: spec.radiator.centreX - spec.radiator.w / 2, x1: spec.radiator.centreX + spec.radiator.w / 2,
      y0: room.depth - spec.radiator.d, y1: room.depth,
      z0: spec.radiator.z, z1: spec.radiator.z + spec.radiator.h,
    },
    leftOpening: opening(doorways.left),
    rightOpening: opening(doorways.right),
  };
}

// Sanity checks on the datum ordering the survey calls out explicitly.
export function validate(spec = SPEC) {
  const d = derive(spec);
  const errors = [];
  const check = (cond, msg) => { if (!cond) errors.push(msg); };

  check(d.pillar.centreY + d.pillar.radius < spec.ceilingDrop.depth,
    'pillar must sit wholly inside the ceiling-drop footprint');
  check(d.pillar.centreY !== spec.socket.y, 'pillar and socket must not share a Y position');
  check(spec.socket.y !== spec.ceilingDrop.depth, 'socket must not align with the ceiling-drop edge');
  check(Math.abs(d.pillar.discrepancy) < 2, `pillar clearances disagree with room width by ${d.pillar.discrepancy.toFixed(2)} cm`);
  check(spec.doorways.left.solidTo < spec.room.depth && spec.doorways.right.solidTo < spec.room.depth,
    'doorways must start before the front wall');
  check(spec.socket.y < spec.doorways.left.solidTo, 'socket must be on the solid part of the left wall');
  check(d.leftOpening.top < spec.room.height && d.rightOpening.top < spec.room.height, 'doorways must be below ceiling');
  const sw = spec.lightSwitch;
  check(sw.y + sw.plateW / 2 < spec.doorways.right.solidTo, 'light switch must be on the solid part of the right wall');

  return { ok: errors.length === 0, errors, derived: d };
}
