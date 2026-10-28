import * as THREE from "three";
import { makeNoseMaps } from "../scene/textures.js";

export const PAINTS = [
  {
    id: "tango-red",
    name: "Tango Red",
    hex: "#a5142a",
    secondary: "#5c0712",
    metalness: 0.5,
    roughness: 0.29,
    official: true,
  },
  {
    id: "ruby-velvet",
    name: "Ruby Velvet",
    hex: "#5c0c18",
    secondary: "#26040a",
    metalness: 0.56,
    roughness: 0.29,
    official: true,
  },
  {
    id: "everest-white",
    name: "Everest White",
    hex: "#e8e6df",
    secondary: "#b9b8b2",
    metalness: 0.2,
    roughness: 0.35,
    official: true,
  },
  {
    id: "stealth-black",
    name: "Stealth Black",
    hex: "#101214",
    secondary: "#050607",
    metalness: 0.48,
    roughness: 0.29,
    official: true,
  },
  {
    id: "nebula-blue",
    name: "Nebula Blue",
    hex: "#1b3d63",
    secondary: "#0b1b30",
    metalness: 0.48,
    roughness: 0.31,
    official: true,
  },
  {
    id: "deep-forest",
    name: "Deep Forest",
    hex: "#18382c",
    secondary: "#081a13",
    metalness: 0.46,
    roughness: 0.32,
    official: true,
  },
  {
    id: "desert-myst",
    name: "Desert Myst",
    hex: "#b9aa96",
    secondary: "#8b7e6c",
    metalness: 0.32,
    roughness: 0.35,
    official: true,
  },
];

const std = (opts) => new THREE.MeshStandardMaterial(opts);

/**
 * Low-contrast procedural pebble/grain map. Used as a bump map on the tyres
 * and leather so close-up surfaces are not perfectly flat, without adding the
 * screen-space speckle that a film-grain overlay would.
 */
function microTexture({
  size = 256,
  blobs = 900,
  repeat = [5, 5],
  spread = 28,
  base = 128,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = `rgb(${base}, ${base}, ${base})`;
  ctx.fillRect(0, 0, size, size);

  let seed = 7321;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < blobs; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = size * (0.004 + rand() * 0.016);
    const value = Math.round(base + (rand() * 2 - 1) * spread);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${value}, ${value}, ${value}, 0.65)`);
    grad.addColorStop(0.7, `rgba(${value}, ${value}, ${value}, 0.18)`);
    grad.addColorStop(1, "rgba(128, 128, 128, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createMaterials() {
  const paint = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PAINTS[0].hex),
    metalness: PAINTS[0].metalness,
    roughness: PAINTS[0].roughness,
    clearcoat: 0.9,
    // Keep a glossy clearcoat, but not a mirror. A sharper clearcoat turned
    // the overhead studio panel into a hard white oval on the bonnet and a
    // thin white blade along the shoulder.
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.94,
    reflectivity: 1,
  });

  // Roof rails and the roof panel are painted surfaces seen from both sides.
  // Keep them on a separate material so switching paint updates them without
  // forcing every body panel to render double sided.
  const paintPanel = paint.clone();
  paintPanel.name = "CarPaintRoof";
  paintPanel.side = THREE.DoubleSide;
  // The roof is a large, nearly horizontal panel. A mirror clearcoat there
  // caught the night sky as one solid white sheet and hid the paint colour.
  // A calmer satin clearcoat keeps the roof body-colour under city lights.
  paintPanel.metalness = 0.2;
  paintPanel.roughness = 0.62;
  paintPanel.clearcoat = 0;
  paintPanel.clearcoatRoughness = 0.6;
  paintPanel.envMapIntensity = 0.3;
  paintPanel.specularIntensity = 0;
  paintPanel.reflectivity = 0.35;

  // The A-pillar is a separate painted plastic part. A softer clearcoat keeps
  // its narrow rounded section from catching the studio softbox as a chrome
  // blade, while still reading as body colour under the night lights.
  const pillarPaint = paint.clone();
  pillarPaint.name = "CarPaintPillar";
  pillarPaint.roughness = Math.max(0.42, PAINTS[0].roughness + 0.1);
  pillarPaint.clearcoat = 0.35;
  pillarPaint.clearcoatRoughness = 0.4;
  pillarPaint.envMapIntensity = 0.7;

  const materials = {
    paint,
    paintPanel,
    pillarPaint,
    ppf: new THREE.MeshPhysicalMaterial({
      color: 0x0a0b0c,
      metalness: 0.45,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.2,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x080d10,
      metalness: 0.14,
      roughness: 0.05,
      transparent: true,
      opacity: 0.74,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5,
      ior: 1.52,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
    glassLight: new THREE.MeshPhysicalMaterial({
      // Deep factory tint. The reference car reads as a dark, reflective screen
      // with only the seat silhouettes and terracotta shoulders visible; a
      // clearer glass exposed a pale toy-like cabin from every exterior angle.
      color: 0x05090c,
      metalness: 0.1,
      roughness: 0.025,
      transparent: true,
      opacity: 0.88,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.9,
      ior: 1.52,
      depthWrite: false,
      side: THREE.FrontSide,
    }),
    glassRoof: new THREE.MeshPhysicalMaterial({
      color: 0x040608,
      metalness: 0.03,
      // A near-horizontal glass panel acts like a mirror for the night sky.
      // Keep the panoramic panel dark and satin so it never turns into one
      // broad white sheet over the cabin.
      roughness: 0.42,
      clearcoat: 0.06,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.12,
      specularIntensity: 0.05,
      ior: 1.52,
      side: THREE.DoubleSide,
    }),
    glassRear: new THREE.MeshPhysicalMaterial({
      // Privacy glass, not opaque paint. Without transparency the rear side
      // windows and backlight were solid black slabs from every exterior view.
      color: 0x0c141a,
      metalness: 0.2,
      roughness: 0.055,
      transparent: true,
      opacity: 0.85,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      envMapIntensity: 1.8,
      ior: 1.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    gloss: std({
      name: "Gloss black",
      color: 0x060708,
      metalness: 0.5,
      roughness: 0.16,
      envMapIntensity: 1.0,
    }),
    roofBlack: std({
      name: "Satin roof black",
      color: 0x080a0b,
      metalness: 0.45,
      roughness: 0.4,
      envMapIntensity: 0.55,
    }),
    satin: std({
      name: "Satin cladding",
      color: 0x090b0c,
      metalness: 0.1,
      roughness: 0.64,
      envMapIntensity: 0.5,
    }),
    satinSoft: std({
      color: 0x111214,
      metalness: 0.08,
      roughness: 0.66,
      envMapIntensity: 0.6,
    }),
    rubber: std({
      color: 0x070707,
      metalness: 0.0,
      roughness: 0.9,
      envMapIntensity: 0.35,
    }),
    rubberTrim: std({
      color: 0x0a0a0b,
      metalness: 0.0,
      roughness: 0.72,
      envMapIntensity: 0.4,
    }),
    chrome: new THREE.MeshPhysicalMaterial({
      color: 0xd9dde2,
      metalness: 1,
      roughness: 0.12,
      clearcoat: 0.4,
      envMapIntensity: 1.35,
    }),
    darkChrome: new THREE.MeshPhysicalMaterial({
      color: 0x6c7076,
      metalness: 1,
      roughness: 0.24,
      clearcoat: 0.3,
      envMapIntensity: 1.1,
    }),
    alloy: new THREE.MeshPhysicalMaterial({
      color: 0xc9ccd1,
      metalness: 1,
      // The polished lip used to mirror the brightest night-neon source into a
      // soft blob at distance. A slightly rougher, less environment-driven
      // alloy keeps the machined highlight without that bloom-like hotspot.
      roughness: 0.31,
      clearcoat: 0.4,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.92,
    }),
    alloyDark: new THREE.MeshPhysicalMaterial({
      color: 0x33373c,
      metalness: 0.95,
      roughness: 0.34,
      clearcoat: 0.2,
      envMapIntensity: 1.15,
    }),
    wheelFace: new THREE.MeshPhysicalMaterial({
      color: 0xb4b9bf,
      metalness: 0.7,
      roughness: 0.39,
      clearcoat: 0.12,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.78,
    }),
    brakeDisc: std({
      color: 0x4a4c4f,
      metalness: 0.9,
      roughness: 0.44,
      envMapIntensity: 1.0,
    }),
    brakeRotor: new THREE.MeshPhysicalMaterial({
      color: 0x777a7e,
      metalness: 1,
      roughness: 0.28,
      clearcoat: 0.2,
      envMapIntensity: 1.1,
    }),
    caliper: std({
      color: 0x27292c,
      metalness: 0.65,
      roughness: 0.35,
      envMapIntensity: 1.0,
    }),
    underbody: std({
      color: 0x121315,
      metalness: 0.12,
      roughness: 0.78,
    }),
    wheelWell: std({
      color: 0x050506,
      metalness: 0.0,
      roughness: 0.95,
      envMapIntensity: 0.15,
      side: THREE.DoubleSide,
    }),
    gap: std({
      color: 0x020202,
      metalness: 0,
      roughness: 0.9,
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: 0xccc8b8,
      metalness: 0.0,
      roughness: 0.54,
      sheen: 0.34,
      sheenColor: new THREE.Color(0xeee9dc),
      sheenRoughness: 0.78,
      clearcoat: 0.05,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.5,
    }),
    leatherDark: std({
      color: 0x303630,
      metalness: 0.0,
      roughness: 0.56,
    }),
    // The production cabin reads almost black through the windscreen, with
    // terracotta shoulder panels on the seats. Splitting these out from the
    // light lower leather keeps the cabin view premium without turning the
    // whole interior into a cream fishbowl.
    seatBack: new THREE.MeshPhysicalMaterial({
      color: 0x17191b,
      metalness: 0.0,
      roughness: 0.56,
      sheen: 0.24,
      sheenColor: new THREE.Color(0x4a403c),
      sheenRoughness: 0.74,
      clearcoat: 0.05,
      clearcoatRoughness: 0.5,
      envMapIntensity: 0.42,
    }),
    seatAccent: new THREE.MeshPhysicalMaterial({
      color: 0x6e2427,
      metalness: 0.0,
      roughness: 0.52,
      sheen: 0.3,
      sheenColor: new THREE.Color(0xb46a5f),
      sheenRoughness: 0.68,
      clearcoat: 0.08,
      clearcoatRoughness: 0.45,
      envMapIntensity: 0.48,
    }),
    interiorSage: new THREE.MeshPhysicalMaterial({
      color: 0xa0a496,
      metalness: 0.0,
      roughness: 0.62,
      sheen: 0.18,
      sheenColor: new THREE.Color(0xd9dccf),
      sheenRoughness: 0.8,
      clearcoat: 0.03,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.45,
    }),
    interiorSageDeep: new THREE.MeshPhysicalMaterial({
      color: 0x6f776c,
      metalness: 0.0,
      roughness: 0.66,
      envMapIntensity: 0.4,
    }),
    stitch: std({
      color: 0x858476,
      metalness: 0.0,
      roughness: 0.78,
    }),
    interiorDark: new THREE.MeshPhysicalMaterial({
      color: 0x101112,
      metalness: 0.05,
      roughness: 0.6,
      clearcoat: 0.2,
      clearcoatRoughness: 0.35,
    }),
    interiorSoft: std({
      color: 0x1e1e1f,
      metalness: 0.0,
      roughness: 0.86,
    }),
    interiorMetal: new THREE.MeshPhysicalMaterial({
      color: 0x8f9296,
      metalness: 1,
      roughness: 0.26,
      envMapIntensity: 1.0,
    }),
    screenGlass: new THREE.MeshPhysicalMaterial({
      color: 0x08090a,
      metalness: 0.25,
      roughness: 0.035,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.4,
    }),
    screen: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    }),
    headlampHousing: new THREE.MeshPhysicalMaterial({
      color: 0x050607,
      metalness: 0.75,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.2,
    }),
    projector: new THREE.MeshPhysicalMaterial({
      color: 0x06090b,
      metalness: 0.58,
      roughness: 0.31,
      clearcoat: 0.55,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.4,
    }),
    lensClear: new THREE.MeshPhysicalMaterial({
      color: 0xcfdde5,
      metalness: 0.05,
      roughness: 0.06,
      transparent: true,
      opacity: 0.07,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 0.8,
      depthWrite: false,
    }),
    lensRed: new THREE.MeshPhysicalMaterial({
      color: 0x6b0309,
      metalness: 0.05,
      roughness: 0.06,
      transparent: true,
      opacity: 0.4,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5,
      depthWrite: false,
    }),
    headlampLED: new THREE.MeshStandardMaterial({
      color: 0x1b252b,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      metalness: 0.35,
      roughness: 0.24,
      envMapIntensity: 0.5,
      toneMapped: false,
    }),
    drl: new THREE.MeshStandardMaterial({
      color: 0x737f86,
      emissive: 0xf6fbff,
      emissiveIntensity: 0.0,
      metalness: 0.08,
      roughness: 0.1,
      toneMapped: false,
    }),
    tailLED: new THREE.MeshStandardMaterial({
      color: 0x920b16,
      emissive: 0xff1020,
      emissiveIntensity: 0.0,
      metalness: 0.14,
      roughness: 0.18,
      toneMapped: false,
    }),
    tailLens: new THREE.MeshPhysicalMaterial({
      color: 0x650810,
      metalness: 0.18,
      roughness: 0.1,
      transparent: true,
      opacity: 0.64,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.25,
      depthWrite: false,
    }),
    reverseLED: std({
      color: 0x252a2d,
      emissive: 0xf4f7ff,
      emissiveIntensity: 0.0,
      metalness: 0.1,
      roughness: 0.24,
    }),
    indicator: std({
      color: 0x2b1a05,
      emissive: 0xff7300,
      emissiveIntensity: 0.0,
      metalness: 0.1,
      roughness: 0.28,
    }),
    ambient: std({
      color: 0x061b20,
      emissive: 0x27d6ee,
      emissiveIntensity: 0.0,
      metalness: 0,
      roughness: 0.36,
      toneMapped: true,
    }),
    emblem: new THREE.MeshPhysicalMaterial({
      color: 0xd7dade,
      metalness: 1,
      roughness: 0.16,
      clearcoat: 0.4,
      envMapIntensity: 1.35,
      emissive: 0x1a2a33,
      emissiveIntensity: 0.0,
    }),
    plate: new THREE.MeshPhysicalMaterial({
      color: 0x0a0b0c,
      metalness: 0.2,
      roughness: 0.34,
      clearcoat: 0.8,
      clearcoatRoughness: 0.08,
    }),
    plateFace: new THREE.MeshBasicMaterial({
      transparent: true,
      toneMapped: false,
    }),
    tireTread: std({
      color: 0x0a0a0a,
      metalness: 0.0,
      roughness: 0.93,
      envMapIntensity: 0.25,
    }),
  };

  materials.paint.name = "CarPaint";
  materials.glass.name = "AutomotiveGlass";
  materials.glass.side = THREE.DoubleSide;
  materials.glassLight.side = THREE.DoubleSide;

  // The production nose is body colour with a fine milled lattice, not a gloss
  // black grille. A satin clearcoat plus a low-contrast bump map keeps the
  // shield from reflecting the studio like a mirror.
  const noseMaps = makeNoseMaps();
  materials.noseShield = paint.clone();
  materials.noseShield.name = "SculptedNose";
  materials.noseShield.bumpMap = noseMaps.bump;
  materials.noseShield.bumpScale = 0.0032;
  materials.noseShield.map = noseMaps.pattern;
  materials.noseShield.roughness = 0.3;
  materials.noseShield.metalness = 0.2;
  materials.noseShield.clearcoat = 0.55;
  materials.noseShield.clearcoatRoughness = 0.22;
  materials.noseShield.envMapIntensity = 1.0;

  materials.intakeMesh = materials.satin.clone();
  materials.intakeMesh.name = "LowerIntakeMesh";
  materials.intakeMesh.color.set(0x060809);
  materials.intakeMesh.bumpMap = noseMaps.bump;
  materials.intakeMesh.bumpScale = 0.0025;
  materials.intakeMesh.roughness = 0.54;
  materials.intakeMesh.metalness = 0.28;
  materials.intakeMesh.envMapIntensity = 0.35;

  // Close-up surface texture. The scales are deliberately low so these read as
  // material, not as noise, under the studio lights.
  const leatherBump = microTexture({ blobs: 1050, repeat: [6, 6], spread: 24 });
  materials.leather.bumpMap = leatherBump;
  materials.leather.bumpScale = 0.0012;
  materials.leatherDark.bumpMap = leatherBump;
  materials.leatherDark.bumpScale = 0.001;
  materials.interiorSage.bumpMap = leatherBump;
  materials.interiorSage.bumpScale = 0.0008;

  const rubberBump = microTexture({
    blobs: 1700,
    repeat: [8, 2],
    spread: 18,
  });
  materials.tireTread.bumpMap = rubberBump;
  materials.tireTread.bumpScale = 0.0016;

  return materials;
}

export function applyPaint(materials, paintConfig) {
  const { hex, secondary, metalness, roughness } = paintConfig;
  const mat = materials.paint;
  mat.color.set(hex);
  mat.userData.secondary = new THREE.Color(secondary);
  mat.metalness = metalness;
  // Satin-clearcoat finish: keeps deep colour and a soft studio sheen without
  // the hard white reflection line that the previous mirror-gloss paint threw
  // across the shoulder and bonnet.
  mat.roughness = Math.max(0.34, roughness);
  mat.needsUpdate = true;

  if (materials.paintPanel) {
    materials.paintPanel.color.copy(mat.color);
    // Roof rails stay satin and only lightly metallic. A colour change must not
    // restore the flat roof's broad white highlight.
    materials.paintPanel.metalness = Math.min(0.2, mat.metalness);
    materials.paintPanel.roughness = Math.max(0.6, roughness + 0.2);
    materials.paintPanel.needsUpdate = true;
  }

  if (materials.pillarPaint) {
    materials.pillarPaint.color.copy(mat.color);
    materials.pillarPaint.metalness = mat.metalness;
    materials.pillarPaint.roughness = Math.max(0.42, mat.roughness + 0.08);
    materials.pillarPaint.needsUpdate = true;
  }

  if (materials.noseShield) {
    materials.noseShield.color.set(hex);
    materials.noseShield.metalness = metalness * 0.8;
    materials.noseShield.roughness = Math.max(0.36, roughness + 0.07);
    materials.noseShield.needsUpdate = true;
  }
}
