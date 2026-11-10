// Shared mutable game state + static data tables
export const G = {
  state: 'boot',
  time: 0,
  dt: 0,
  timeScale: 1,
  maxDt: 0.05, // largest simulated step per frame (seconds)
  hitstop: 0,
  shake: 0,
  enemies: [],
  projs: [],
  eprojs: [],
  hazards: [],
  pickups: [],
  wells: [],
  anim: [],
  run: null,
  room: null,
  arena: null,
  input: { keys: {}, mouse: { x: 0, y: 0, down: false, right: false }, aim: null },
};

export const ASPECTS = [
  { id: 'ember', name: 'Ember', color: 0xff6a2b, css: '#ff7a3a', light: 0xffb27a, skill: 'Fireball', key: '1' },
  { id: 'frost', name: 'Frost', color: 0x4fd8ff, css: '#5fdcff', light: 0xbdf1ff, skill: 'Glacial Lance', key: '2' },
  { id: 'volt', name: 'Volt', color: 0xffe94a, css: '#ffe94a', light: 0xfff6a8, skill: 'Chain Lightning', key: '3' },
];

export const BIOMES = [
  {
    name: 'The Cinder Reach', sub: 'Where the world burns slowly',
    fog: 0x1c0906, skyTop: 0x050102, skyMid: 0x3c0f08, skyBot: 0x8a2a0c,
    accent: 0xff5a1f, accent2: 0xffb03a, floor: 0x1a0f0d, rock: 0x2a1410,
    hemiSky: 0xff9a66, hemiGround: 0x2a0c06, sun: 0xffc99a, rim: 0xff4a1a,
    hazard: 'geyser', root: 41.2, mote: [0xff7a2a, 0xffc060, 0xff3a10],
  },
  {
    name: 'Frostbound Hollow', sub: 'Silence has teeth',
    fog: 0x07131f, skyTop: 0x01060c, skyMid: 0x0b2a44, skyBot: 0x2f8fb8,
    accent: 0x4fd0ff, accent2: 0xc8f4ff, floor: 0x0c1722, rock: 0x14283a,
    hemiSky: 0x9fdcff, hemiGround: 0x081420, sun: 0xcfeaff, rim: 0x3aa8ff,
    hazard: 'icicle', root: 36.7, mote: [0xbfeaff, 0x7fd0ff, 0xffffff],
  },
  {
    name: 'Voltaic Abyss', sub: 'The storm remembers you',
    fog: 0x0d0618, skyTop: 0x030108, skyMid: 0x2a0a4a, skyBot: 0x8a2fd0,
    accent: 0xb44bff, accent2: 0xeaff4a, floor: 0x120a1e, rock: 0x22123a,
    hemiSky: 0xc890ff, hemiGround: 0x0e0618, sun: 0xe6c8ff, rim: 0xd24bff,
    hazard: 'bolt', root: 32.7, mote: [0xeaff4a, 0xc060ff, 0xffffff],
  },
];

export const ROOM_TYPES = {
  slaughter: { name: 'Slaughter', sym: '⚔', desc: 'Cut down every invader.' },
  defend: { name: 'Defend the Heart', sym: '❖', desc: 'Protect the Heart Crystal.' },
  hunt: { name: 'Champion Hunt', sym: '☠', desc: 'Track and slay the marked Champion.' },
  tempest: { name: 'Tempest', sym: '☄', desc: 'Survive the storm.' },
  prism: { name: 'Prism Trial', sym: '◈', desc: 'Wards demand the right Aspect.' },
  shop: { name: "Wanderer's Bazaar", sym: '✦', desc: 'Spend your gold.' },
  boss: { name: 'Boss', sym: '♛', desc: '' },
};
