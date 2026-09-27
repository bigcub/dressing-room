// Colour schemes. Each starts from a key wall colour and picks pillar, floor (carpet),
// door frames and ceiling to go with it. Every element can still be tweaked in the UI.

export const ELEMENTS = [
  ['walls', 'Walls'],
  ['pillar', 'Pillar'],
  ['floor', 'Floor'],
  ['frames', 'Door frames'],
  ['ceiling', 'Ceiling'],
  ['joinery', 'Joinery'],
  ['painted', 'Painted chests'],
];

export const SCHEMES = [
  {
    name: 'Gallery white',
    note: 'Crisp white shell, oatmeal wool carpet',
    walls: '#f3f2ee', pillar: '#f3f2ee', floor: '#bfb3a0', frames: '#fbfbf9', ceiling: '#f7f6f3', joinery: '#d6bf9b', painted: '#e2dccd',
  },
  {
    name: 'Chalk & slate',
    note: 'Warm chalk walls so the slate-blue chests stand out; oak shelves pick up the brass',
    walls: '#ece6db', pillar: '#ece6db', floor: '#bcad94', frames: '#f6f2ea', ceiling: '#f8f5ef', joinery: '#c9a574', painted: '#4e6677',
  },
  {
    name: 'Inky tonal',
    note: 'Deep blue-slate walls a few shades darker than the chests, warm taupe carpet, oak and cream',
    walls: '#2c3a47', pillar: '#2c3a47', floor: '#8a7f73', frames: '#e9e4da', ceiling: '#efeae1', joinery: '#b8905f', painted: '#4e6677',
  },
  {
    name: 'Classic navy',
    note: 'Deep navy walls, cream pillar and trim, warm oatmeal carpet',
    walls: '#1e2a44', pillar: '#ede7da', floor: '#c7b99f', frames: '#f2eee5', ceiling: '#f6f3ec', joinery: '#e8e2d4', painted: '#e8e2d4',
  },
  {
    name: 'Navy & brass',
    note: 'Navy walls, pillar picked out in soft brass, charcoal carpet',
    walls: '#1e2a44', pillar: '#b8995e', floor: '#4a4a4c', frames: '#1e2a44', ceiling: '#f4f1ea', joinery: '#27324d', painted: '#d8d1c1',
  },
  {
    name: 'Sage & oak',
    note: 'Muted sage, cream pillar, mushroom carpet',
    walls: '#a9b39c', pillar: '#ece6d8', floor: '#8d7c67', frames: '#f4f0e6', ceiling: '#f7f5ef', joinery: '#c6a57a', painted: '#e6e0d2',
  },
  {
    name: 'Greige linen',
    note: 'Tone-on-tone greige with a taupe carpet',
    walls: '#d3c9ba', pillar: '#d3c9ba', floor: '#8e8779', frames: '#f6f3ec', ceiling: '#f8f6f1', joinery: '#efe9df', painted: '#f0ebe2',
  },
  {
    name: 'Forest club',
    note: 'Deep green, tobacco carpet, cream trim',
    walls: '#2e4436', pillar: '#2e4436', floor: '#6f5a45', frames: '#efe9dc', ceiling: '#f4f0e6', joinery: '#5b4332', painted: '#e3dccb',
  },
  {
    name: 'Blush plaster',
    note: 'Soft plaster pink, pale pillar, grey-taupe carpet',
    walls: '#dcc3ba', pillar: '#efe4dd', floor: '#a79a8e', frames: '#faf6f2', ceiling: '#fbf8f5', joinery: '#f3ece6', painted: '#f2ece6',
  },
  {
    name: 'Charcoal',
    note: 'Dark charcoal walls and pillar, pale grey carpet',
    walls: '#3a3b3d', pillar: '#3a3b3d', floor: '#a19c95', frames: '#ebe8e2', ceiling: '#f3f2ee', joinery: '#b89a74', painted: '#d6d2c9',
  },
];
