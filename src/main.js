import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { createStudio } from "./scene/studio.js";
import { createMaterials, PAINTS, applyPaint } from "./car/materials.js";
import { createBody, createUnderbody } from "./car/body.js";
import { createWheels } from "./car/wheels.js";
import { createGreenhouse } from "./car/greenhouse.js";
import { createFront } from "./car/front.js";
import { createRear } from "./car/rear.js";
import { createInterior } from "./car/interior.js";
import { createDriver } from "./car/driver.js";
import { createNightCity } from "./scene/nightCity.js";
import { createVillage, VILLAGE_LANE_Z } from "./scene/village.js";
import { createAlps } from "./scene/alps.js";
import { createTokyo, obbOverlap } from "./scene/tokyo.js";
import { createAmbience } from "./audio/ambience.js";
import { createMissionDirector } from "./missions.js";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const DEFAULT_FOV = 31;
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(window.location.search);
const CLEAN = params.get("clean") === "1";
const NO_COMPILE = params.has("nocompile");
const NO_REFLECTOR = params.has("noreflector");
const NO_SHADOW = params.has("noshadow");
const MIRROR_CLONE = params.get("reflection") === "clone";

const FINISH_LABELS = {
  "tango-red": "Metallic clearcoat",
  "ruby-velvet": "Velvet clearcoat",
  "everest-white": "Pearl clearcoat",
  "stealth-black": "Metallic clearcoat",
  "nebula-blue": "Metallic clearcoat",
  "deep-forest": "Metallic clearcoat",
  "desert-myst": "Satin metallic",
};

const VIEWS = {
  hero: {
    // Low, near-bonnet-height three-quarter. The higher camera flattened the
    // bonnet and made the glass canopy look like a tall dome.
    pos: [6.2, 1.72, 5.7],
    target: [0, 0.84, 0],
    fov: 31,
    label: "Front ¾",
    overview: true,
  },
  profile: {
    pos: [0.02, 1.12, 8.15],
    target: [0, 0.86, 0],
    fov: 31,
    label: "Profile",
    overview: true,
  },
  rear: {
    pos: [-6.25, 2.35, 4.7],
    target: [-0.15, 0.78, 0],
    fov: 31,
    label: "Rear ¾",
    overview: true,
  },
  front: {
    // Eye level close to the bonnet, like the reference photography. Looking
    // down from 1.4 m shortened the front face and over-emphasised the roof.
    pos: [6.75, 1.12, 0.10],
    target: [0.15, 0.86, 0],
    fov: 31,
    label: "Front",
    overview: true,
  },
  back: {
    pos: [-7.05, 1.45, 0.08],
    target: [-0.1, 0.84, 0],
    fov: 32,
    label: "Rear",
    overview: true,
  },
  top: {
    pos: [0.35, 10.8, 1.4],
    target: [0, 0.55, 0],
    fov: 32,
    label: "Top",
    overview: true,
  },
  wheel: {
    pos: [3.12, 1.28, 3.05],
    target: [1.36, 0.44, 0.82],
    fov: 30,
    label: "Wheel",
    overview: false,
    minDistance: 1.0,
    maxDistance: 4.6,
  },
  cabin: {
    // Look over the rear-seat head restraints so the full dash and all three
    // screens stay readable; the old eye-level view buried them behind the
    // front seats.
    pos: [-0.84, 1.42, -0.03],
    target: [0.98, 1.0, 0.14],
    fov: 56,
    label: "Cabin",
    overview: false,
    minDistance: 0.1,
    maxDistance: 3.2,
  },
  under: {
    pos: [4.4, 0.47, 3.3],
    target: [0, 0.26, 0],
    fov: 33,
    label: "Under",
    overview: true,
    minDistance: 1.6,
    maxDistance: 8.5,
  },
  night: {
    pos: [-8.9, 2.2, 3.5],
    target: [-0.08, 0.84, 0],
    fov: 35,
    label: "Night City",
    overview: true,
  },
  village: {
    // Golden-hour three-quarter from the verge. Low enough to feel like a
    // driving shot, wide enough to keep the farmhouse, church spire and fields
    // in frame. The rig sits in the same lane as the car so the lane weave
    // stays centred.
    pos: [11.2, 3.6, 9.8],
    target: [0, 0.95, VILLAGE_LANE_Z],
    fov: 35,
    label: "Village",
    overview: true,
  },
  alps: {
    // A low blue-hour three-quarter on the snow. Pulled back and to the side
    // of the near chalet so the camera sits clear of its window boxes and the
    // village square stays in frame behind the car.
    pos: [13.2, 3.35, 8.2],
    target: [-1.2, 0.95, -1.2],
    fov: 36,
    label: "Alpine Pass",
    overview: true,
  },
  tokyo: {
    // Parked at the kerb on the south side of the avenue, looking down the
    // neon canyon. The camera sits just off the kerb, so the car reads as
    // part of the street rather than a turntable exhibit.
    pos: [-27.5, 2.6, 8.4],
    target: [-16, 0.95, 6.8],
    fov: 38,
    label: "Tokyo Dreams",
    overview: true,
    // Tokyo also supports a 60 m establishing view and POI focus moves, so the
    // orbit rig needs a much wider dolly range than the studio.
    minDistance: 1.1,
    maxDistance: 170,
  },
};

const LIGHT_MODES = {
  // The car starts clean. The lamps are detailed dark lenses when unlit, and
  // stay understated when switched on rather than blooming like neon.
  off: { drl: 0, headlamp: 0, tail: 0, spot: 0 },
  drl: { drl: 2.2, headlamp: 0, tail: 0.9, spot: 0 },
  headlights: { drl: 2.8, headlamp: 4.4, tail: 1.2, spot: 55 },
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const nextFrame = () =>
  new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => setTimeout(done, 0));
    // A hidden or minimised tab pauses requestAnimationFrame. Without this
    // fallback the boot loader would wait forever in a background tab.
    setTimeout(done, 220);
  });
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const damp = (current, target, lambda, dt) =>
  THREE.MathUtils.damp(current, target, lambda, dt);

function colorOf(hex) {
  return new THREE.Color(hex);
}

/**
 * Cheap showroom reflection: mirror a dark, unlit copy of the car below the
 * floor. A real planar reflector renders the whole scene a second time, which
 * doubles shader compilation on older GPUs and was by far the slowest part of
 * boot. The floor overlay blends this silhouette into the gloss.
 */
function addFloorReflection(car, scene) {
  const mirror = car.clone(true);
  const cache = new Map();
  mirror.traverse((object) => {
    if (!object.isMesh) return;
    const source = object.material;
    let material = cache.get(source);
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        color: source?.color ? source.color.clone().multiplyScalar(0.5) : 0x101010,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      cache.set(source, material);
    }
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = -2;
  });
  mirror.scale.y = -1;
  mirror.position.y = 0.004;
  mirror.name = "FloorReflection";
  scene.add(mirror);
  return mirror;
}

/* -------------------------------------------------------------------------- */
/*  DOM                                                                       */
/* -------------------------------------------------------------------------- */

const canvas = $("#scene-canvas");
const loader = $("#loader");
const loaderBar = $("#loader-bar");
const loaderPct = $("#loader-pct");
const loaderStatus = $("#loader-status");
const toast = $("#toast");
const panelScrim = $("#panel-scrim");
const infoModal = $("#info-modal");
const configPanel = $("#config-panel");

if (CLEAN) document.body.classList.add("clean");

const state = {
  paint: "tango-red",
  light: "off",
  ambient: false,
  tail: false,
  autoRotate: false,
  motion: false,
  view: "hero",
  configOpen: window.innerWidth > 1024,
  infoOpen: false,
  night: false,
  stage: null,
  driveSpeed: 35,
  rain: false,
  audioMuted: false,
  musicLights: true,
  musicPreview: false,
};

const music = {
  player: null,
  ready: false,
  playing: false,
  loading: false,
  videoId: "",
  url: "",
  title: "",
  patternTime: 0,
  volume: 65,
  apiPromise: null,
};

const ambience = createAmbience();

let toastTimer = 0;
function showToast(message) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

let loadingValue = 0;
let loadingStart = performance.now();
const bootMarks = { module: performance.now() };
const markBoot = (name) => {
  bootMarks[name] = Math.round(performance.now());
};
window.__XEV_BOOT__ = bootMarks;
async function setLoading(value, label) {
  loadingValue = Math.max(loadingValue, value);
  if (loaderBar) loaderBar.style.width = `${loadingValue}%`;
  if (loaderPct) loaderPct.textContent = String(Math.round(loadingValue)).padStart(2, "0");
  if (loaderStatus && label) loaderStatus.textContent = label;
  await nextFrame();
}

/* -------------------------------------------------------------------------- */
/*  Renderer and studio                                                       */
/* -------------------------------------------------------------------------- */

const renderer = new THREE.WebGLRenderer({
  canvas,
  // The composer's render target provides MSAA; a multisampled default
  // framebuffer would only be used by the final fullscreen output quad.
  antialias: false,
  alpha: true,
  stencil: false,
  powerPreference: "high-performance",
  // Keep the last presented frame in the drawing buffer. Some Windows GPU
  // drivers otherwise expose a cleared (black) buffer for one compositor pass
  // when the UI above the canvas repaints, which reads as a full-screen blink.
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.4 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0xb4b2ac, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = !NO_SHADOW;
renderer.shadowMap.type = THREE.PCFShadowMap;

const camera = new THREE.PerspectiveCamera(
  DEFAULT_FOV,
  window.innerWidth / window.innerHeight,
  0.04,
  600
);
camera.position.set(8.2, 3.3, 7.65);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.062;
controls.enablePan = false;
controls.minDistance = 2.4;
controls.maxDistance = 16;
controls.minPolarAngle = 0.06;
controls.maxPolarAngle = 1.548;
controls.autoRotateSpeed = 0.55;
controls.target.set(0, 0.78, 0);
controls.update();

canvas.addEventListener("webglcontextlost", (event) => {
  // Do not let the browser permanently discard the canvas. Three.js will
  // rebuild its GPU resources and the next scheduled frame repaints the car.
  event.preventDefault();
  console.warn("WebGL context lost — waiting for the browser to restore it.");
});
canvas.addEventListener("webglcontextrestored", () => {
  renderer.shadowMap.needsUpdate = true;
  requestRender();
});

let studio;
let materials;
let car;
let body;
let wheels;
let front;
let rear;
let interior;
let driver = null;
let steeringWheel = null;
let cabinLight = null;
let underbody;
let greenhouse;
let doorHandles = [];
let handlePhase = 0;
let steerAngle = 0;
let steerWheelAngle = 0;
let bodyRoll = 0;
let bodyPitch = 0;
let lastDriveSpeed = 0;
let laneOffset = 0;
let laneOffsetTarget = 0;
let laneShiftTimer = 6;
let nightCity = null;
let village = null;
let alps = null;
let tokyo = null;
let stage = null;
let missionDirector = null;
let stageSnapshot = null;

let scene = new THREE.Scene();
let composer = null;
const carGroup = new THREE.Group();
carGroup.name = "XEV9e";

/**
 * Render the scene into a linear target, then tone-map in OutputPass. This is
 * also the format the Reflector uses for its mirror pass, so both passes share
 * the same compiled programs. Rendering straight to the sRGB canvas gave the
 * reflector its own full set of shader variants; on older GPUs that alone took
 * about ten seconds to compile during boot.
 */
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  const samples = Math.min(4, renderer.capabilities.maxSamples || 4);
  composer.renderTarget1.samples = samples;
  composer.renderTarget2.samples = samples;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
}

/* -------------------------------------------------------------------------- */
/*  Camera framing                                                            */
/* -------------------------------------------------------------------------- */

let cameraTween = null;
let pointerDown = false;
let hintHidden = false;

function viewOffset() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let x = 0;
  let y = 0;

  if (w > 1024) {
    // The sidebar sits over the right of the frame. Shift the render left
    // while it is open, and recentre the moment it is dismissed so the car
    // gets the full width of the studio.
    x = state.configOpen ? w * 0.055 : 0;
    y = state.configOpen ? h * 0.012 : 0;
  } else {
    x = 0;
    y = h * (state.configOpen ? 0.16 : 0.035);
  }
  return { x, y };
}

function updateProjection() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  const { x, y } = viewOffset();
  camera.setViewOffset(w, h, x, y, w, h);
  camera.updateProjectionMatrix();
}

function resolveView(name) {
  const view = VIEWS[name] || VIEWS.hero;
  const target = new THREE.Vector3(...view.target);
  const pos = new THREE.Vector3(...view.pos);
  let fov = view.fov ?? DEFAULT_FOV;

  const aspect = window.innerWidth / window.innerHeight;
  if (aspect < 0.92) {
    if (view.overview) {
      const factor = name === "top" ? 1.2 : 1.38;
      pos.sub(target).multiplyScalar(factor).add(target);
      fov += 4;
    } else if (name === "wheel") {
      pos.sub(target).multiplyScalar(1.08).add(target);
    }
  } else if (aspect < 1.2) {
    if (view.overview) {
      pos.sub(target).multiplyScalar(1.12).add(target);
      fov += 1.5;
    }
  }

  return {
    pos,
    target,
    fov,
    minDistance: view.minDistance ?? 2.4,
    maxDistance: view.maxDistance ?? 16,
  };
}

function setActiveView(name) {
  state.view = name;
  for (const button of $$("[data-view]")) {
    const active = button.dataset.view === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function applyViewLighting(name) {
  if (!studio || stage) return;
  const table = {
    hero: { i: 1.1, p: [2.8, 9.2, 4.2] },
    profile: { i: 1.0, p: [2.8, 9.2, 4.2] },
    front: { i: 0.65, p: [1.2, 9.4, 1.8] },
    back: { i: 0.9, p: [-2.8, 9.2, -4.2] },
    rear: { i: 0.9, p: [-2.8, 9.2, -4.2] },
    top: { i: 0.75, p: [0, 10, 0] },
    wheel: { i: 0.85, p: [2.8, 9.2, 4.2] },
  };
  const light = table[name] || table.hero;
  studio.key.intensity = light.i;
  studio.key.position.set(...light.p);
  renderer.shadowMap.needsUpdate = true;
}

function goToView(name, { duration = 1.3, instant = false } = {}) {
  if (!VIEWS[name]) return;

  // A scripted experience owns the camera and the car. Leaving for another
  // view ends it first, without bouncing the camera back to the stage view.
  if (missionDirector?.active) missionDirector.finish(false, false);

  // Night City, the village and the Alpine pass are stage modes, not just
  // camera presets. Enter them before applying the view so the studio lights
  // and floor are already gone when the camera starts moving. Driving is also
  // the moment to get the configurator out of the way and hand the full frame
  // to the car.
  if (name === "night" || name === "village" || name === "alps" || name === "tokyo") {
    if (state.configOpen) closeMobileConfig();
    enterStage(name, { quiet: instant });
  } else if (stage) exitStage();

  const view = resolveView(name);
  setActiveView(name);
  stopAutoRotate(true);
  applyViewLighting(name);

  controls.minDistance = view.minDistance;
  controls.maxDistance = view.maxDistance;

  if (instant || REDUCED_MOTION) {
    camera.position.copy(view.pos);
    controls.target.copy(view.target);
    camera.fov = view.fov;
    camera.updateProjectionMatrix();
    controls.update();
    cameraTween = null;
    controls.enabled = true;
    requestRender();
    return;
  }

  cameraTween = {
    fromPos: camera.position.clone(),
    toPos: view.pos.clone(),
    fromTarget: controls.target.clone(),
    toTarget: view.target.clone(),
    fromFov: camera.fov,
    toFov: view.fov,
    elapsed: 0,
    duration: Math.max(0.25, duration),
  };
  controls.enabled = false;
  hideHint();
  requestRender();
}

function updateCameraTween(dt) {
  if (!cameraTween) return;
  cameraTween.elapsed += dt;
  const k = easeInOutCubic(clamp01(cameraTween.elapsed / cameraTween.duration));
  camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, k);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, k);
  camera.fov = THREE.MathUtils.lerp(cameraTween.fromFov, cameraTween.toFov, k);
  camera.updateProjectionMatrix();

  if (cameraTween.elapsed >= cameraTween.duration) {
    camera.position.copy(cameraTween.toPos);
    controls.target.copy(cameraTween.toTarget);
    camera.fov = cameraTween.toFov;
    camera.updateProjectionMatrix();
    cameraTween = null;
    controls.enabled = true;
    controls.update();
  }
}

function hideHint() {
  if (hintHidden) return;
  hintHidden = true;
  $("#orbit-hint")?.classList.add("is-hidden");
}

function stopAutoRotate(silent = false) {
  if (!state.autoRotate) return;
  state.autoRotate = false;
  controls.autoRotate = false;
  const button = $("#toggle-rotate");
  button?.setAttribute("aria-pressed", "false");
  if (!silent) showToast("Auto orbit off");
}

function dolly(factor) {
  // Zooming is a deliberate new gesture; finish any preset tween first so the
  // buttons never feel dead while a view is still easing in.
  cameraTween = null;
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance
  );
  offset.setLength(distance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
  hideHint();
  requestRender();
}

/* -------------------------------------------------------------------------- */
/*  Build the car                                                             */
/* -------------------------------------------------------------------------- */

async function build() {
  loadingStart = performance.now();
  markBoot("buildStart");
  await setLoading(4, "Warming the studio");

  // Fonts use font-display: swap; the studio does not need to wait for them.
  await setLoading(14, "Building the light stage");
  studio = createStudio(renderer);
  scene = studio.scene;
  if (NO_REFLECTOR) {
    studio.reflector.visible = false;
    studio.floor.material.opacity = 0.6;
  }
  markBoot("studio");

  await setLoading(25, "Sculpting the body");
  materials = createMaterials();
  body = createBody(materials);
  carGroup.add(body.group);
  underbody = createUnderbody(materials, body);
  carGroup.add(underbody);
  markBoot("body");

  await setLoading(42, "Milling the wheels");
  wheels = createWheels(materials);
  carGroup.add(wheels.group);
  markBoot("wheels");

  await setLoading(56, "Shaping the glasshouse");
  greenhouse = createGreenhouse(materials);
  carGroup.add(greenhouse);
  markBoot("greenhouse");

  await setLoading(66, "Lighting the signature");
  front = createFront(materials);
  rear = createRear(materials);
  carGroup.add(front.group, rear.group);
  markBoot("frontRear");

  await setLoading(78, "Stitching the cabin");
  interior = createInterior(materials);
  carGroup.add(interior);
  steeringWheel = interior.getObjectByName("SteeringWheelRim");
  driver = createDriver();
  carGroup.add(driver.group);

  // A soft cabin fill only exists while the driver is aboard. Without it the
  // tinted glass turns the figure into a black cut-out at golden hour; with it
  // the face, collar and hands read without lighting up the whole street.
  cabinLight = new THREE.PointLight(0xffd6ad, 1.6, 1.4, 2);
  cabinLight.position.set(0.34, 1.27, 0.36);
  cabinLight.visible = false;
  carGroup.add(cabinLight);
  if (MIRROR_CLONE) addFloorReflection(carGroup, scene);
  markBoot("interior");

  missionDirector = createMissionDirector({
    scene,
    carGroup,
    materials,
    camera,
    controls,
    ambience,
    setDriveSpeed: (kmh) => {
      state.driveSpeed = THREE.MathUtils.clamp(Number(kmh) || 0, 0, 202);
      syncDriveUI();
      requestRender();
    },
    restoreView: () => goToView(stage?.kind || "hero", { instant: true }),
    cancelCameraTween: () => {
      cameraTween = null;
    },
    showToast,
    requestRender,
  });

  carGroup.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material?.transparent && object.material?.opacity < 0.5) {
      object.castShadow = false;
    }
    // The car never receives its own shadow map. With a 2048 map spanning the
    // whole studio, self-shadow texels are large enough to stipple the glossy
    // shoulder highlight. The floor still receives the car's cast shadow and
    // the contact shadow keeps the wheels planted, so nothing floats.
    object.receiveShadow = false;
  });

  doorHandles = [];
  carGroup.traverse((object) => {
    if (object.name === "FlushDoorHandle") doorHandles.push(object);
  });
  markBoot("shadows");

  // Initial configuration
  const initialPaint =
    PAINTS.find((paint) => paint.id === params.get("paint")) || PAINTS[0];
  applyPaint(materials, initialPaint);
  state.paint = initialPaint.id;
  syncPaintUI(initialPaint);
  syncLightUI();
  updateLightTargets(true);

  scene.add(carGroup);

  // A quiet first frame, before the shaders are compiled.
  camera.position.set(6.15, 2.42, 5.95).multiplyScalar(1.06);
  controls.target.set(0, 0.76, 0);
  camera.fov = DEFAULT_FOV;
  updateProjection();
  controls.update();

  setupComposer();
  await setLoading(88, "Calibrating reflections");
  if (!NO_COMPILE) {
    try {
      // Compile against the linear composer target, not the canvas. The
      // reflector pass uses the same target format and reuses these programs.
      renderer.setRenderTarget(composer.renderTarget1);
      await renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
    } catch (error) {
      renderer.setRenderTarget(null);
      console.warn("Shader precompilation skipped:", error);
    }
  }
  markBoot("compile");

  composer.render();
  markBoot("firstRender");

  await setLoading(96, "Ready to configure");
  await setLoading(100, "Ready");

  const initialView = VIEWS[params.get("view")] ? params.get("view") : "hero";
  goToView(initialView, { instant: true });
  if (!CLEAN) {
    // A restrained establishing move out of the dark, wide opening frame.
    const opening = resolveView(initialView);
    camera.position
      .copy(opening.pos)
      .sub(opening.target)
      .multiplyScalar(1.22)
      .add(opening.target);
    goToView(initialView, { duration: 1.6 });
  }

  document.body.classList.add("is-ready");

  if (!CLEAN) {
    setTimeout(() => loader?.classList.add("is-hidden"), 120);
    setTimeout(() => {
      const hint = $("#orbit-hint");
      hint?.classList.add("is-hidden");
    }, 7000);
  } else {
    loader?.classList.add("is-hidden");
  }

  frameOnce();
  // The key shadow does not move with the camera. Freeze the shadow map after
  // the establishing frame and refresh it only when the stage light changes.
  renderer.shadowMap.autoUpdate = false;
  markBoot("ready");
  window.__XEV_READY_MS__ = performance.now();
}

/* -------------------------------------------------------------------------- */
/*  Lighting                                                                  */
/* -------------------------------------------------------------------------- */

const lightTargets = {
  drl: 0,
  headlamp: 0,
  tail: 0,
  ambient: 0,
  spot: 0,
};

function updateLightTargets(immediate = false) {
  if (!materials) return;
  const mode = LIGHT_MODES[state.light] || LIGHT_MODES.drl;
  lightTargets.drl = mode.drl;
  lightTargets.headlamp = mode.headlamp;
  lightTargets.tail = state.tail ? mode.tail : 0;
  lightTargets.ambient = state.ambient ? 0.8 : 0;
  lightTargets.spot = mode.spot;

  if (immediate) {
    materials.drl.emissiveIntensity = lightTargets.drl;
    materials.headlampLED.emissiveIntensity = lightTargets.headlamp;
    materials.tailLED.emissiveIntensity = lightTargets.tail;
    materials.ambient.emissiveIntensity = lightTargets.ambient;
    for (const spot of front?.lights ?? []) spot.intensity = lightTargets.spot;
  }
}

function animateLights(dt) {
  if (!materials) return false;

  let moving = false;
  const settle = (object, key, target, lambda, epsilon = 0.002) => {
    const next = damp(object[key], target, lambda, dt);
    object[key] = Math.abs(next - target) < epsilon ? target : next;
    if (object[key] !== target) moving = true;
  };

  // The soundtrack light show owns the drl, tail and ambient intensity while
  // it is running. Headlamps and their road spots still follow the normal
  // lighting controls.
  const musicShow = musicLightShowActive();
  const lambda = 9;
  if (!musicShow) settle(materials.drl, "emissiveIntensity", lightTargets.drl, lambda);
  settle(materials.headlampLED, "emissiveIntensity", lightTargets.headlamp, lambda);
  if (!musicShow) settle(materials.tailLED, "emissiveIntensity", lightTargets.tail, lambda);
  if (!musicShow) settle(materials.ambient, "emissiveIntensity", lightTargets.ambient, lambda);

  for (const spot of front?.lights ?? []) {
    const next = damp(spot.intensity, lightTargets.spot, 7, dt);
    spot.intensity = Math.abs(next - lightTargets.spot) < 0.02 ? lightTargets.spot : next;
    if (spot.intensity !== lightTargets.spot) moving = true;
  }

  return moving;
}

/* -------------------------------------------------------------------------- */
/*  Driving stages                                                            */
/* -------------------------------------------------------------------------- */

function setLiveLabel(text) {
  const label = $("#live-label");
  if (label) label.textContent = text;
}

function ensureStageModule(kind) {
  if (kind === "night") {
    if (!nightCity) {
      nightCity = createNightCity(renderer);
      scene.add(nightCity.group);
      nightCity.group.visible = false;
    }
    return nightCity;
  }
  if (kind === "village") {
    if (!village) {
      village = createVillage(renderer);
      scene.add(village.group);
      village.group.visible = false;
    }
    return village;
  }
  if (kind === "alps") {
    if (!alps) {
      alps = createAlps(renderer);
      scene.add(alps.group);
      alps.group.visible = false;
    }
    return alps;
  }
  if (kind === "tokyo") {
    if (!tokyo) {
      tokyo = createTokyo(renderer);
      scene.add(tokyo.group);
      tokyo.group.visible = false;
    }
    return tokyo;
  }
  return null;
}

const STAGE_NAMES = {
  night: "Night City",
  village: "Country road",
  alps: "Alpine Pass",
  tokyo: "Tokyo Dreams",
};

function stageBodyClass(kind) {
  return kind === "night"
    ? "night-mode"
    : kind === "village"
      ? "village-mode"
      : kind === "tokyo"
        ? "tokyo-mode"
        : "alps-mode";
}

function stageUnavailable(kind) {
  return kind === "night"
    ? "Night City is unavailable on this device"
    : kind === "village"
      ? "The village is unavailable on this device"
      : kind === "tokyo"
        ? "Tokyo Dreams is unavailable on this device"
        : "The Alpine pass is unavailable on this device";
}

function enterStage(kind, { quiet = false } = {}) {
  if (!studio || (stage && stage.kind === kind)) return;
  if (stage) exitStage();

  let module;
  try {
    module = ensureStageModule(kind);
  } catch (error) {
    console.error(`${kind} stage could not be created:`, error);
    showToast(stageUnavailable(kind));
    return;
  }
  if (!module) return;

  const backdrop = scene.getObjectByName("StudioBackdrop");
  const floorReflection = scene.getObjectByName("FloorReflection");
  const meshes = [
    studio.reflector,
    studio.floor,
    studio.outerFloor,
    studio.dressing,
    backdrop,
    floorReflection,
  ].filter(Boolean);
  const lights = [
    studio.hemisphere,
    studio.key,
    studio.fill,
    studio.upperLeft,
    studio.upperRight,
    studio.rearSoft,
    studio.leftSoft,
    studio.rightSoft,
    studio.frontSoft,
    studio.noseFill,
    studio.lowLeft,
    studio.lowRight,
  ].filter(Boolean);

  stageSnapshot = {
    meshes: meshes.map((object) => ({ object, visible: object.visible })),
    lights: lights.map((object) => ({ object, visible: object.visible })),
    fog: scene.fog,
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
    exposure: renderer.toneMappingExposure,
    light: state.light,
    tail: state.tail,
    ambient: state.ambient,
  };

  for (const object of meshes) object.visible = false;
  for (const object of lights) object.visible = false;

  module.group.visible = true;
  scene.fog = module.fog;
  scene.background =
    kind === "tokyo"
      ? null
      : new THREE.Color(
          kind === "night" ? 0x02040a : kind === "alps" ? 0x081322 : 0x9fb8c8
        );
  scene.environment = module.environment;
  scene.environmentIntensity =
    kind === "night" ? 1.15 : kind === "tokyo" ? 1.0 : kind === "alps" ? 0.8 : 0.9;
  renderer.toneMappingExposure =
    kind === "tokyo"
      ? module.exposure ?? 1.0
      : kind === "night"
        ? 1.04
        : kind === "alps"
          ? 1.0
          : 0.98;

  stage = { kind, module };
  state.stage = kind;
  state.night = kind === "night";
  if (kind === "night" || kind === "tokyo") {
    state.light = "headlights";
    state.tail = true;
    state.ambient = true;
  }
  if (kind === "tokyo") {
    // The car is parked at the kerb rather than scrolling down a treadmill.
    resetTokyoDrive();
    carGroup.position.set(-16, 0, 7.0);
    carGroup.rotation.set(0, 0, 0);
    closeTokyoPoi();
  }
  document.body.classList.add("stage-mode", stageBodyClass(kind));
  document.body.dataset.light = state.light;
  setLiveLabel(
    kind === "night"
      ? "NIGHT DRIVE"
      : kind === "village"
        ? "COUNTRY ROAD"
        : kind === "tokyo"
          ? "TOKYO DREAMS"
          : "ALPINE PASS"
  );
  syncLightUI();
  syncDriveUI();
  syncTokyoUI();
  module.setRain?.(state.rain);
  ambience.setStage(kind);
  ambience.setRain(state.rain);
  ambience.ensure();

  // The village, the Alpine pass and Tokyo use real sun/moon shadows on moving
  // scenery, so their maps have to refresh while the stage is live. The studio
  // freezes its shadow map for performance.
  renderer.shadowMap.autoUpdate =
    kind === "village" || kind === "alps" || kind === "tokyo";
  renderer.shadowMap.needsUpdate = true;

  if (kind === "night") {
    if (music.ready && music.player) {
      try {
        music.player.playVideo();
      } catch {
        /* The custom play button remains available. */
      }
    } else if (!quiet) {
      showToast("Night City · add a YouTube track for the full experience");
    }
  }

  requestRender();
}

function exitStage() {
  if (!stage) return;

  if (stageSnapshot) {
    for (const item of stageSnapshot.meshes) item.object.visible = item.visible;
    for (const item of stageSnapshot.lights) item.object.visible = item.visible;
    scene.fog = stageSnapshot.fog;
    scene.background = stageSnapshot.background;
    scene.environment = stageSnapshot.environment;
    scene.environmentIntensity = stageSnapshot.environmentIntensity;
    renderer.toneMappingExposure = stageSnapshot.exposure;
    state.light = stageSnapshot.light;
    state.tail = stageSnapshot.tail;
    state.ambient = stageSnapshot.ambient;
  }

  if (stage.kind === "tokyo") resetTokyoDrive();
  closeTokyoPoi();
  stage.module.group.visible = false;
  stage = null;
  state.stage = null;
  state.night = false;
  laneOffset = 0;
  laneOffsetTarget = 0;
  laneShiftTimer = 6;
  carGroup.position.set(0, 0, 0);
  carGroup.rotation.set(0, 0, 0);
  carGroup.visible = true;
  ambience.setStage(null);
  stageSnapshot = null;
  document.body.classList.remove(
    "stage-mode",
    "night-mode",
    "village-mode",
    "alps-mode",
    "tokyo-mode",
    "tokyo-drive-mode"
  );
  document.body.dataset.light = state.light;
  setLiveLabel("STUDIO LIVE");
  syncLightUI();
  syncDriveUI();
  syncTokyoUI();
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  requestRender();
}

/* -------------------------------------------------------------------------- */
/*  Tokyo Dreams: POIs and minimap                                            */
/* -------------------------------------------------------------------------- */

const tokyoState = {
  poi: null,
};

const tokyoRaycaster = new THREE.Raycaster();
const tokyoPointer = new THREE.Vector2();
let tokyoOrbitClick = null;

/* -------------------------------------------------------------------------- */
/*  Tokyo Dreams: drive mode                                                  */
/* -------------------------------------------------------------------------- */

const TOKYO_CAR = {
  halfLength: 2.42,
  halfWidth: 1.0,
  wheelbase: 2.775,
  maxSpeed: 22.5,
  boostSpeed: 33,
  reverseSpeed: 7,
  accel: 8.6,
  boostAccel: 13.8,
  brake: 17,
  reverseAccel: 5.6,
  rolling: 1.15,
};

// The car is allowed on the avenue, the cross street and the station
// forecourt. The station road is included up to the station building, which
// itself remains a solid collider.
const TOKYO_ROADS = [
  // The avenue is endless. The recycled blocks and the moving asphalt strip in
  // the Tokyo module continue past the authored core in both directions.
  { minX: -Infinity, maxX: Infinity, minZ: -8.9, maxZ: 8.9 },
  // The cross street is a finite side road, closed at both ends by visible
  // construction barriers rather than an invisible wall.
  { minX: -6.7, maxX: 6.7, minZ: -60, maxZ: 60 },
  { minX: 127.8, maxX: 136.2, minZ: 8.9, maxZ: 38 },
  { minX: 122.8, maxX: 141.2, minZ: 8.9, maxZ: 19.2 },
];

const tokyoDrive = {
  on: false,
  position: new THREE.Vector3(-16, 0, 7),
  heading: 0,
  speed: 0,
  steer: 0,
  accel: 0,
  distance: 0,
  keys: new Set(),
  cameraPos: new THREE.Vector3(),
  cameraTarget: new THREE.Vector3(),
  cameraReady: false,
  hudTimer: 0,
  impact: 0,
};

function resetTokyoDrive() {
  tokyoDrive.on = false;
  tokyoDrive.position.set(-16, 0, 7);
  tokyoDrive.heading = 0;
  tokyoDrive.speed = 0;
  tokyoDrive.steer = 0;
  tokyoDrive.accel = 0;
  tokyoDrive.distance = 0;
  tokyoDrive.keys.clear();
  tokyoDrive.cameraReady = false;
  tokyoDrive.hudTimer = 0;
  tokyoDrive.impact = 0;
  document.body.classList.remove("tokyo-drive-mode");
}

function tokyoDrivePointInRoad(x, z) {
  for (const road of TOKYO_ROADS) {
    if (x >= road.minX && x <= road.maxX && z >= road.minZ && z <= road.maxZ) {
      return true;
    }
  }
  return false;
}

function tokyoDriveFootprintInRoad(x, z, heading) {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const hl = TOKYO_CAR.halfLength;
  const hw = TOKYO_CAR.halfWidth;
  const offsets = [
    [hl, hw],
    [hl, -hw],
    [-hl, hw],
    [-hl, -hw],
    [hl, 0],
    [-hl, 0],
    [0, hw],
    [0, -hw],
  ];
  for (const [along, across] of offsets) {
    const px = x + cos * along + sin * across;
    const pz = z - sin * along + cos * across;
    if (!tokyoDrivePointInRoad(px, pz)) return false;
  }
  return true;
}

function tokyoDriveHitsCollider(x, z, heading) {
  if (!stage || stage.kind !== "tokyo") return false;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const hl = TOKYO_CAR.halfLength + 0.04;
  const hw = TOKYO_CAR.halfWidth + 0.04;
  for (const box of stage.module.colliders ?? []) {
    const bcx = (box.minX + box.maxX) * 0.5;
    const bcz = (box.minZ + box.maxZ) * 0.5;
    const bhx = (box.maxX - box.minX) * 0.5;
    const bhz = (box.maxZ - box.minZ) * 0.5;
    const dx = x - bcx;
    const dz = z - bcz;
    // Separating-axis test between the car's oriented rectangle and the
    // axis-aligned street colliders. It is exact enough for kerbs, poles and
    // building corners, and much cheaper than sampling the footprint.
    if (Math.abs(dx) > hl * Math.abs(cos) + hw * Math.abs(sin) + bhx) continue;
    if (Math.abs(dz) > hl * Math.abs(sin) + hw * Math.abs(cos) + bhz) continue;
    if (
      Math.abs(dx * cos - dz * sin) >
      hl + bhx * Math.abs(cos) + bhz * Math.abs(sin)
    ) {
      continue;
    }
    if (
      Math.abs(dx * sin + dz * cos) >
      hw + bhx * Math.abs(sin) + bhz * Math.abs(cos)
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function tokyoDriveHitsTraffic(x, z, heading) {
  if (!stage || stage.kind !== "tokyo") return false;
  const player = {
    x,
    z,
    heading,
    halfLength: TOKYO_CAR.halfLength,
    halfWidth: TOKYO_CAR.halfWidth,
  };
  for (const vehicle of stage.module.traffic ?? []) {
    if (
      obbOverlap(
        player,
        {
          x: vehicle.object.position.x,
          z: vehicle.object.position.z,
          heading: vehicle.object.rotation.y,
          halfLength: vehicle.length * 0.5,
          halfWidth: (vehicle.object.userData.width ?? 1.8) * 0.5,
        },
        0.04
      )
    ) {
      return true;
    }
  }
  return false;
}

function tokyoDriveBlocked(x, z, heading) {
  return (
    !tokyoDriveFootprintInRoad(x, z, heading) ||
    tokyoDriveHitsCollider(x, z, heading) ||
    tokyoDriveHitsTraffic(x, z, heading)
  );
}

function tokyoCameraBlocked(x, z) {
  if (!stage || stage.kind !== "tokyo") return false;
  for (const box of stage.module.colliders ?? []) {
    if (
      x > box.minX - 0.38 &&
      x < box.maxX + 0.38 &&
      z > box.minZ - 0.38 &&
      z < box.maxZ + 0.38
    ) {
      return true;
    }
  }
  return false;
}

function applyTokyoChaseCamera(dt) {
  const speed = Math.abs(tokyoDrive.speed);
  const forwardX = Math.cos(tokyoDrive.heading);
  const forwardZ = -Math.sin(tokyoDrive.heading);
  const wantedDistance = 6.9 + Math.min(3.1, speed * 0.1);
  let distance = 3.4;
  for (let d = wantedDistance; d >= 3.4; d -= 0.55) {
    const cx = tokyoDrive.position.x - forwardX * d;
    const cz = tokyoDrive.position.z - forwardZ * d;
    if (!tokyoCameraBlocked(cx, cz)) {
      distance = d;
      break;
    }
  }

  const wantedX = tokyoDrive.position.x - forwardX * distance;
  const wantedZ = tokyoDrive.position.z - forwardZ * distance;
  const wantedY = 2.55 + Math.min(0.85, speed * 0.022);
  const lookX = tokyoDrive.position.x + forwardX * (3.4 + speed * 0.07);
  const lookZ = tokyoDrive.position.z + forwardZ * (3.4 + speed * 0.07);
  const lookY = 1.0;

  if (!tokyoDrive.cameraReady) {
    tokyoDrive.cameraPos.set(wantedX, wantedY, wantedZ);
    tokyoDrive.cameraTarget.set(lookX, lookY, lookZ);
    tokyoDrive.cameraReady = true;
  } else {
    tokyoDrive.cameraPos.x = damp(tokyoDrive.cameraPos.x, wantedX, 5.4, dt);
    tokyoDrive.cameraPos.y = damp(tokyoDrive.cameraPos.y, wantedY, 4.4, dt);
    tokyoDrive.cameraPos.z = damp(tokyoDrive.cameraPos.z, wantedZ, 5.4, dt);
    tokyoDrive.cameraTarget.x = damp(tokyoDrive.cameraTarget.x, lookX, 7.2, dt);
    tokyoDrive.cameraTarget.y = damp(tokyoDrive.cameraTarget.y, lookY, 7.2, dt);
    tokyoDrive.cameraTarget.z = damp(tokyoDrive.cameraTarget.z, lookZ, 7.2, dt);
  }

  camera.position.copy(tokyoDrive.cameraPos);
  camera.lookAt(tokyoDrive.cameraTarget);
  camera.fov = damp(camera.fov, 56 + Math.min(8, speed * 0.24), 4.5, dt);
  camera.updateProjectionMatrix();
}

function updateTokyoDrive(dt) {
  if (!tokyoDrive.on || stage?.kind !== "tokyo") return;
  const keys = tokyoDrive.keys;
  const throttle = keys.has("forward");
  const brake = keys.has("back");
  const steerInput = (keys.has("left") ? 1 : 0) - (keys.has("right") ? 1 : 0);
  const boost = keys.has("boost");
  const handbrake = keys.has("space");
  const previousSpeed = tokyoDrive.speed;

  let accel = 0;
  if (!handbrake) {
    if (brake) {
      accel = tokyoDrive.speed > 0.25 ? -TOKYO_CAR.brake : -TOKYO_CAR.reverseAccel;
    } else if (throttle) {
      accel =
        tokyoDrive.speed < -0.25
          ? TOKYO_CAR.brake
          : boost
            ? TOKYO_CAR.boostAccel
            : TOKYO_CAR.accel;
    }
  }

  if (handbrake) {
    tokyoDrive.speed = damp(tokyoDrive.speed, 0, 4.6, dt);
  } else {
    tokyoDrive.speed += accel * dt;
    if (!throttle && !brake) {
      const drag = (TOKYO_CAR.rolling + Math.abs(tokyoDrive.speed) * 0.05) * dt;
      if (Math.abs(tokyoDrive.speed) <= drag) tokyoDrive.speed = 0;
      else tokyoDrive.speed -= Math.sign(tokyoDrive.speed) * drag;
    }
    const limit = boost ? TOKYO_CAR.boostSpeed : TOKYO_CAR.maxSpeed;
    if (tokyoDrive.speed > limit) {
      tokyoDrive.speed = Math.max(limit, tokyoDrive.speed - 5.5 * dt);
    }
    tokyoDrive.speed = THREE.MathUtils.clamp(
      tokyoDrive.speed,
      -TOKYO_CAR.reverseSpeed,
      TOKYO_CAR.boostSpeed
    );
  }
  tokyoDrive.accel = (tokyoDrive.speed - previousSpeed) / Math.max(dt, 0.001);

  const speedAbs = Math.abs(tokyoDrive.speed);
  const steerLimit = 0.58 / (1 + speedAbs * 0.085);
  tokyoDrive.steer = damp(
    tokyoDrive.steer,
    steerInput * steerLimit,
    steerInput === 0 ? 9.5 : 7.2,
    dt
  );

  const travel = tokyoDrive.speed * dt;
  const steps = Math.max(1, Math.min(9, Math.ceil(Math.abs(travel) / 0.22)));
  const stepDt = dt / steps;
  for (let step = 0; step < steps; step++) {
    const heading =
      tokyoDrive.heading +
      (tokyoDrive.speed / TOKYO_CAR.wheelbase) * Math.tan(tokyoDrive.steer) * stepDt;
    const dx = Math.cos(heading) * tokyoDrive.speed * stepDt;
    const dz = -Math.sin(heading) * tokyoDrive.speed * stepDt;
    const oldX = tokyoDrive.position.x;
    const oldZ = tokyoDrive.position.z;
    const nextX = oldX + dx;
    const nextZ = oldZ + dz;

    if (!tokyoDriveBlocked(nextX, nextZ, heading)) {
      tokyoDrive.position.x = nextX;
      tokyoDrive.position.z = nextZ;
      tokyoDrive.heading = heading;
      tokyoDrive.distance += Math.abs(tokyoDrive.speed) * stepDt;
      continue;
    }

    // A glancing hit should scrape along the kerb instead of stopping dead.
    let slid = false;
    if (!tokyoDriveBlocked(nextX, oldZ, heading)) {
      tokyoDrive.position.x = nextX;
      slid = true;
    } else if (!tokyoDriveBlocked(oldX, nextZ, heading)) {
      tokyoDrive.position.z = nextZ;
      slid = true;
    }
    if (slid) {
      if (!tokyoDriveBlocked(tokyoDrive.position.x, tokyoDrive.position.z, heading)) {
        tokyoDrive.heading = heading;
      }
      tokyoDrive.speed *= 0.7;
      tokyoDrive.impact = Math.max(tokyoDrive.impact, 0.35);
      continue;
    }

    // Rotating in place is still allowed when the nose is against a wall, so
    // the player can steer out rather than getting locked to the obstacle.
    if (!tokyoDriveBlocked(oldX, oldZ, heading)) {
      tokyoDrive.heading = heading;
    }
    tokyoDrive.speed *= -0.12;
    tokyoDrive.impact = 1;
    break;
  }
  tokyoDrive.impact = damp(tokyoDrive.impact, 0, 7, dt);

  const bob =
    Math.sin(tokyoDrive.distance * 1.85) *
    0.0022 *
    Math.min(1, Math.abs(tokyoDrive.speed) / 6);
  carGroup.position.set(tokyoDrive.position.x, bob, tokyoDrive.position.z);
  carGroup.rotation.y = tokyoDrive.heading;

  for (const wheel of wheels?.wheels ?? []) {
    const sign = wheel.side > 0 ? -1 : 1;
    wheel.spin.rotation.z +=
      (sign * tokyoDrive.speed * dt) / Math.max(0.01, wheel.radius);
    if (wheel.name === "FL" || wheel.name === "FR") {
      wheel.pivot.rotation.y = tokyoDrive.steer;
    }
  }

  applyTokyoChaseCamera(dt);

  tokyoDrive.hudTimer -= dt;
  if (tokyoDrive.hudTimer <= 0) {
    tokyoDrive.hudTimer = 0.1;
    const speedEl = $("#tokyo-drive-speed");
    if (speedEl) {
      speedEl.textContent = String(
        Math.round(Math.abs(tokyoDrive.speed) * 3.6)
      ).padStart(3, "0");
    }
    const gearEl = $("#tokyo-drive-gear");
    if (gearEl) {
      gearEl.textContent =
        tokyoDrive.speed < -0.3 ? "R" : Math.abs(tokyoDrive.speed) < 0.3 ? "N" : "D";
    }
  }
}

function setTokyoDrive(on, { silent = false, restore = true } = {}) {
  if (!stage || stage.kind !== "tokyo") return;

  if (on) {
    if (tokyoDrive.on) return;
    closeTokyoPoi();
    cameraTween = null;
    controls.enabled = false;
    controls.autoRotate = false;
    state.autoRotate = false;
    $("#toggle-rotate")?.setAttribute("aria-pressed", "false");
    tokyoDrive.keys.clear();
    tokyoDrive.speed = 0;
    tokyoDrive.steer = 0;
    tokyoDrive.accel = 0;
    tokyoDrive.cameraReady = false;
    tokyoDrive.hudTimer = 0;
    tokyoDrive.on = true;
    carGroup.visible = true;
    document.body.classList.add("tokyo-drive-mode");
    syncTokyoUI();
    if (!silent) {
      showToast("Drive mode · W/S throttle · A/D steer · Shift boost");
    }
    requestRender();
    return;
  }

  if (!tokyoDrive.on) return;
  tokyoDrive.on = false;
  tokyoDrive.keys.clear();
  tokyoDrive.speed = 0;
  tokyoDrive.steer = 0;
  tokyoDrive.accel = 0;
  tokyoDrive.cameraReady = false;
  carGroup.position.set(tokyoDrive.position.x, 0, tokyoDrive.position.z);
  carGroup.rotation.set(0, tokyoDrive.heading, 0);
  document.body.classList.remove("tokyo-drive-mode");

  const forwardX = Math.cos(tokyoDrive.heading);
  const forwardZ = -Math.sin(tokyoDrive.heading);
  camera.position.set(
    tokyoDrive.position.x - forwardX * 6.6,
    2.55,
    tokyoDrive.position.z - forwardZ * 6.6
  );
  controls.target.set(
    tokyoDrive.position.x + forwardX * 2.6,
    1.0,
    tokyoDrive.position.z + forwardZ * 2.6
  );
  camera.fov = 42;
  camera.updateProjectionMatrix();
  controls.enabled = true;
  controls.update();
  syncTokyoUI();
  if (restore && !silent) {
    showToast("Parked · drag to orbit or press Drive");
  }
  requestRender();
}

function tokyoPickAt(clientX, clientY) {
  if (!stage || stage.kind !== "tokyo" || !stage.module.pickables?.length) return null;
  const rect = canvas.getBoundingClientRect();
  tokyoPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  tokyoPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  tokyoRaycaster.setFromCamera(tokyoPointer, camera);
  const hits = tokyoRaycaster.intersectObjects(stage.module.pickables, false);
  const id = hits[0]?.object?.userData?.tokyoPoi;
  return id ? stage.module.pois.find((poi) => poi.id === id) ?? null : null;
}

function tweenTokyoCamera(pos, target, fov = 42, duration = 1.05) {
  const toPos = new THREE.Vector3(...pos);
  const toTarget = new THREE.Vector3(...target);
  cameraTween = {
    fromPos: camera.position.clone(),
    toPos,
    fromTarget: controls.target.clone(),
    toTarget,
    fromFov: camera.fov,
    toFov: fov,
    elapsed: 0,
    duration,
  };
  controls.enabled = false;
  hideHint();
  requestRender();
}

function focusTokyoPoi(poi) {
  if (!poi?.focus) return;
  tweenTokyoCamera(poi.focus.pos, poi.focus.target, poi.focus.fov ?? 42, 1.0);
}

function openTokyoPoi(poi) {
  if (!poi || !stage || stage.kind !== "tokyo") return;
  tokyoState.poi = poi.id;
  const panel = $("#tokyo-poi");
  const district = $("#tokyo-poi-district");
  const name = $("#tokyo-poi-name");
  const jp = $("#tokyo-poi-jp");
  const body = $("#tokyo-poi-description");
  if (district) district.textContent = poi.district;
  if (name) name.textContent = poi.name;
  if (jp) jp.textContent = poi.jp;
  if (body) body.textContent = poi.description;
  if (panel) panel.hidden = false;
  if (!tokyoDrive.on) focusTokyoPoi(poi);
  requestRender();
}

function closeTokyoPoi() {
  tokyoState.poi = null;
  const panel = $("#tokyo-poi");
  if (panel) panel.hidden = true;
}

function syncTokyoUI() {
  const active = stage?.kind === "tokyo";
  const hud = $("#tokyo-hud");
  if (hud) hud.hidden = !active;
  if (!active) {
    document.body.classList.remove("tokyo-day", "tokyo-drive-mode");
    const panel = $("#tokyo-poi");
    if (panel) panel.hidden = true;
    return;
  }

  const night = tokyo?.night ?? true;
  const neon = tokyo?.neon ?? true;
  const quality = tokyo?.quality ?? "high";
  document.body.classList.toggle("tokyo-day", !night);

  const time = $("#tokyo-time");
  if (time) {
    time.setAttribute("aria-pressed", night ? "true" : "false");
    time.classList.toggle("is-day", !night);
    const label = $("#tokyo-time-label");
    if (label) label.textContent = night ? "Night" : "Day";
  }

  const neonButton = $("#tokyo-neon");
  if (neonButton) {
    neonButton.setAttribute("aria-pressed", neon ? "true" : "false");
    neonButton.textContent = neon ? "Neon on" : "Neon off";
  }

  const rainButton = $("#tokyo-rain");
  if (rainButton) {
    rainButton.setAttribute("aria-pressed", state.rain ? "true" : "false");
    rainButton.textContent = state.rain ? "Rain on" : "Rain off";
  }

  const audioButton = $("#tokyo-audio");
  if (audioButton) {
    audioButton.setAttribute("aria-pressed", state.audioMuted ? "true" : "false");
    audioButton.textContent = state.audioMuted ? "Muted" : "Sound on";
  }

  for (const button of $$("[data-quality]")) {
    const current = button.dataset.quality === quality;
    button.classList.toggle("is-active", current);
    button.setAttribute("aria-pressed", current ? "true" : "false");
  }

  const driveButton = $("#tokyo-drive-mode");
  if (driveButton) {
    driveButton.textContent = tokyoDrive.on ? "Exit car" : "Drive";
    driveButton.setAttribute("aria-pressed", tokyoDrive.on ? "true" : "false");
  }

  const readout = $("#tokyo-drive-readout");
  if (readout) readout.hidden = !tokyoDrive.on;
  if (tokyoDrive.on) {
    const speedEl = $("#tokyo-drive-speed");
    if (speedEl) {
      speedEl.textContent = String(
        Math.round(Math.abs(tokyoDrive.speed) * 3.6)
      ).padStart(3, "0");
    }
    const gearEl = $("#tokyo-drive-gear");
    if (gearEl) {
      gearEl.textContent =
        tokyoDrive.speed < -0.3 ? "R" : Math.abs(tokyoDrive.speed) < 0.3 ? "N" : "D";
    }
  }
}

function setupTokyoControls() {
  $("#tokyo-drive")?.addEventListener("click", () => {
    closeMobileConfig();
    goToView("tokyo");
  });

  $("#tokyo-time")?.addEventListener("click", () => {
    if (stage?.kind !== "tokyo") return;
    stage.module.setTimeOfDay(stage.module.night ? "day" : "night");
    syncTokyoUI();
    requestRender();
    showToast(stage.module.night ? "Tokyo · night" : "Tokyo · day");
  });

  $("#tokyo-neon")?.addEventListener("click", () => {
    if (stage?.kind !== "tokyo") return;
    stage.module.setNeon(!stage.module.neon);
    syncTokyoUI();
    requestRender();
    showToast(stage.module.neon ? "Neon on" : "Neon off");
  });

  $("#tokyo-rain")?.addEventListener("click", () => applyRain(!state.rain));
  $("#tokyo-audio")?.addEventListener("click", () => $("#drive-audio")?.click());

  for (const button of $$("[data-quality]")) {
    button.addEventListener("click", () => {
      if (stage?.kind !== "tokyo") return;
      stage.module.setQuality(button.dataset.quality);
      syncTokyoUI();
      requestRender();
      showToast(`Quality · ${button.textContent.trim()}`);
    });
  }

  $("#tokyo-drive-mode")?.addEventListener("click", () => {
    if (stage?.kind !== "tokyo") return;
    setTokyoDrive(!tokyoDrive.on);
  });

  $("#tokyo-poi-close")?.addEventListener("click", closeTokyoPoi);

  // Orbit-mode POI picking. A click only counts when the pointer barely moved,
  // so orbiting around the car never opens a shop by accident.
  canvas.addEventListener("pointerdown", (event) => {
    if (stage?.kind !== "tokyo" || event.button !== 0) return;
    tokyoOrbitClick = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!tokyoOrbitClick || stage?.kind !== "tokyo") {
      tokyoOrbitClick = null;
      return;
    }
    const moved = Math.hypot(
      event.clientX - tokyoOrbitClick.x,
      event.clientY - tokyoOrbitClick.y
    );
    const elapsed = performance.now() - tokyoOrbitClick.time;
    tokyoOrbitClick = null;
    if (moved > 6 || elapsed > 750) return;
    const poi = tokyoPickAt(event.clientX, event.clientY);
    if (poi) openTokyoPoi(poi);
  });

  const typing = (target) =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

  // Drive mode. WASD/arrows drive, Shift is a boost and Space is the
  // handbrake. Escape parks the car and returns to orbit.
  const driveKeyMap = {
    w: "forward",
    arrowup: "forward",
    s: "back",
    arrowdown: "back",
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right",
    shift: "boost",
    " ": "space",
  };

  window.addEventListener("keydown", (event) => {
    if (!tokyoDrive.on || stage?.kind !== "tokyo" || typing(event.target)) return;
    const key = driveKeyMap[event.key.toLowerCase()];
    if (!key) return;
    tokyoDrive.keys.add(key);
    if (key === "space" || event.key.startsWith("Arrow")) event.preventDefault();
    requestRender();
  });

  window.addEventListener("keyup", (event) => {
    const key = driveKeyMap[event.key.toLowerCase()];
    if (!key) return;
    tokyoDrive.keys.delete(key);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !tokyoDrive.on) return;
    setTokyoDrive(false);
  });

  window.addEventListener("blur", () => {
    tokyoDrive.keys.clear();
  });

  for (const button of $$("[data-drive]")) {
    const action = button.dataset.drive;
    const press = (event) => {
      event.preventDefault();
      button.classList.add("is-down");
      tokyoDrive.keys.add(action);
      requestRender();
    };
    const release = () => {
      button.classList.remove("is-down");
      tokyoDrive.keys.delete(action);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }
}

/* -------------------------------------------------------------------------- */
/*  UI: paint                                                                 */
/* -------------------------------------------------------------------------- */

function buildSwatches() {
  const host = $("#paint-swatches");
  if (!host) return;
  host.innerHTML = PAINTS.map((paint) => {
    return `<button class="swatch" type="button" data-paint="${paint.id}"
      style="--swatch:${paint.hex}" aria-label="${paint.name}"
      aria-pressed="${paint.id === state.paint}" title="${paint.name}"></button>`;
  }).join("");

  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-paint]");
    if (!button) return;
    const paint = PAINTS.find((item) => item.id === button.dataset.paint);
    if (paint) setPaint(paint, true);
  });
}

function syncPaintUI(paint) {
  const name = $("#paint-name");
  const finish = $("#paint-finish");
  if (name) name.textContent = paint.name;
  if (finish) finish.textContent = FINISH_LABELS[paint.id] || "Official finish";
  for (const button of $$("[data-paint]")) {
    const active = button.dataset.paint === paint.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function setPaint(paint, announce = false) {
  if (!materials || !paint) return;
  state.paint = paint.id;
  applyPaint(materials, paint);
  syncPaintUI(paint);
  if (announce) showToast(`${paint.name} · paint updated`);
  requestRender();
}

/* -------------------------------------------------------------------------- */
/*  UI: lighting                                                              */
/* -------------------------------------------------------------------------- */

function syncLightUI() {
  for (const button of $$("button[data-light]")) {
    const active = button.dataset.light === state.light;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
  const ambient = $("#ambient-toggle");
  if (ambient) ambient.checked = state.ambient;
  const tail = $("#tail-toggle");
  if (tail) tail.checked = state.tail;
  updateLightTargets(true);
  requestRender();
}

function setupLightingControls() {
  // A label wrapping a checkbox can synthesise a second click on the input in
  // some browsers, toggling it back to its previous state. Keep the native
  // input click from bubbling back through the label.
  for (const input of $$(".switch-row input")) {
    input.addEventListener("click", (event) => event.stopPropagation());
  }

  for (const button of $$("button[data-light]")) {
    button.addEventListener("click", () => {
      state.light = button.dataset.light;
      document.body.dataset.light = state.light;
      syncLightUI();
      const label =
        state.light === "off"
          ? "Exterior lights off"
          : state.light === "headlights"
            ? "Headlights on"
            : "Daytime running lights";
      showToast(label);
    });
  }

  $("#ambient-toggle")?.addEventListener("change", (event) => {
    state.ambient = event.target.checked;
    updateLightTargets(true);
    requestRender();
    showToast(state.ambient ? "Cabin ambience on" : "Cabin ambience off");
  });

  $("#tail-toggle")?.addEventListener("change", (event) => {
    state.tail = event.target.checked;
    updateLightTargets(true);
    requestRender();
    showToast(state.tail ? "Rear light bar on" : "Rear light bar off");
  });
}

/* -------------------------------------------------------------------------- */
/*  UI: soundtrack                                                            */
/* -------------------------------------------------------------------------- */

function parseYouTubeId(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  let id = "";

  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    id = url.searchParams.get("v") || "";
    if (!id) {
      const match = url.pathname.match(/\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
      if (match) id = match[1];
    }
  }

  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (music.apiPromise) return music.apiPromise;

  music.apiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      music.apiPromise = null;
      finish(() => reject(new Error("The YouTube player took too long to load.")));
    }, 15000);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish(resolve);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      music.apiPromise = null;
      finish(() => reject(new Error("The YouTube player could not be reached.")));
    };
    document.head.appendChild(script);
  });

  return music.apiPromise;
}

function setMusicStatus(text, error = false) {
  const status = $("#music-status");
  if (status) {
    status.textContent = text;
    status.classList.toggle("is-error", error);
  }
}

function updateMusicUI() {
  const toggle = $("#music-toggle");
  const title = $("#music-title");
  if (toggle) {
    toggle.disabled = !music.ready;
    toggle.classList.toggle("is-playing", music.playing);
    toggle.setAttribute("aria-pressed", music.playing ? "true" : "false");
    toggle.setAttribute("aria-label", music.playing ? "Pause soundtrack" : "Play soundtrack");
  }
  if (title) {
    title.textContent = music.title || (music.videoId ? "YouTube track" : "No track loaded");
  }
}

function createYouTubePlayer(videoId) {
  const host = $("#music-player");
  if (!host || !window.YT?.Player) return false;

  host.hidden = false;
  host.innerHTML = "";
  const mount = document.createElement("div");
  mount.id = "music-player-mount";
  host.appendChild(mount);

  music.player = new window.YT.Player(mount, {
    videoId,
    host: "https://www.youtube-nocookie.com",
    width: 320,
    height: 180,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: (event) => {
        music.ready = true;
        event.target.setVolume(music.volume);
        const data = event.target.getVideoData?.();
        if (data?.title) music.title = data.title;
        updateMusicUI();
        setMusicStatus("Ready · press play to start", false);
        try {
          event.target.playVideo();
        } catch {
          /* Browsers may require the explicit play button. */
        }
        setTimeout(() => {
          if (music.ready && !music.playing) {
            setMusicStatus("Press play to start the soundtrack", false);
          }
        }, 1600);
      },
      onStateChange: (event) => {
        const playerState = window.YT?.PlayerState;
        if (event.data === playerState?.PLAYING) {
          music.playing = true;
          music.patternTime = 0;
          const data = event.target.getVideoData?.();
          if (data?.title) music.title = data.title;
          setMusicStatus("Playing · rear light show active", false);
          requestRender();
        } else if (event.data === playerState?.PAUSED) {
          music.playing = false;
          setMusicStatus("Paused", false);
          requestRender();
        } else if (event.data === playerState?.ENDED) {
          music.playing = false;
          setMusicStatus("Finished · play again", false);
          requestRender();
        } else if (event.data === playerState?.BUFFERING) {
          setMusicStatus("Buffering…", false);
        } else if (event.data === playerState?.CUED) {
          music.playing = false;
          setMusicStatus("Ready · press play to start", false);
        }
        updateMusicUI();
      },
      onError: (event) => {
        music.playing = false;
        const message =
          event.data === 101 || event.data === 150
            ? "This video does not allow embedded playback."
            : event.data === 100
              ? "This video is unavailable."
              : "YouTube could not play this video.";
        setMusicStatus(message, true);
        updateMusicUI();
        showToast(message);
      },
    },
  });
  return true;
}

async function loadMusicTrack(value) {
  const id = parseYouTubeId(value);
  if (!id) {
    setMusicStatus("Paste a valid YouTube link or 11-character video ID.", true);
    showToast("That does not look like a YouTube link");
    return;
  }

  if (music.loading) return;
  music.loading = true;
  const loadButton = $("#music-load");
  if (loadButton) {
    loadButton.disabled = true;
    loadButton.textContent = "Loading";
  }
  setMusicStatus("Connecting to YouTube…", false);

  try {
    await loadYouTubeApi();
    if (!window.YT?.Player) throw new Error("The YouTube player is unavailable.");
    music.videoId = id;
    music.url = String(value).trim();
    music.title = "";
    music.ready = Boolean(music.player);
    updateMusicUI();

    if (!music.player) {
      createYouTubePlayer(id);
    } else {
      music.player.loadVideoById(id);
    }
    showToast("Track loaded · press play if the browser blocks sound");
  } catch (error) {
    music.apiPromise = null;
    setMusicStatus(error.message || "YouTube could not be loaded.", true);
    showToast("YouTube player unavailable");
    console.warn("Soundtrack failed to load:", error);
  } finally {
    music.loading = false;
    if (loadButton) {
      loadButton.disabled = false;
      loadButton.textContent = "Load";
    }
  }
}

function musicLightShowActive() {
  return Boolean(state.musicLights && (music.playing || state.musicPreview));
}

function animateMusicLights(dt) {
  if (!materials) return false;

  const segments = rear?.musicSegments ?? [];
  const active = musicLightShowActive();
  let moving = false;

  if (!active) {
    for (const segment of segments) {
      const next = damp(segment.material.emissiveIntensity, 0, 9, dt);
      segment.material.emissiveIntensity = next < 0.003 ? 0 : next;
      if (segment.material.emissiveIntensity !== 0) moving = true;
    }
    return moving;
  }

  music.patternTime += dt;
  const t = music.patternTime;
  const beat = Math.pow(0.5 + 0.5 * Math.cos(t * TAU * 2.0), 5);
  const sweep = (t * 0.32) % 1;
  const count = Math.max(1, segments.length - 1);

  for (const segment of segments) {
    const phase = segment.index / count;
    const distance = Math.abs(phase - sweep);
    const chase = Math.max(0, 1 - Math.min(distance, 1 - distance) * 8);
    const wave = 0.5 + 0.5 * Math.sin(t * TAU * 1.15 + phase * TAU * 2.4);
    const shimmer = 0.5 + 0.5 * Math.sin(t * TAU * 3.7 + phase * 19.0);
    const target = 0.14 + chase * 1.45 + beat * (0.5 + wave * 0.8) + shimmer * 0.08;
    segment.material.emissiveIntensity = Math.min(
      2.4,
      Math.max(0, damp(segment.material.emissiveIntensity, target, 11, dt))
    );
    segment.material.emissive.setRGB(1, 0.06 + wave * 0.2, 0.08 + wave * 0.05);
    moving = true;
  }

  // Keep the main bar alive under the pattern, but never strobe it.
  materials.tailLED.emissiveIntensity = damp(
    materials.tailLED.emissiveIntensity,
    0.62 + beat * 0.95,
    9,
    dt
  );
  materials.ambient.emissiveIntensity = damp(
    materials.ambient.emissiveIntensity,
    0.16 + beat * 0.58,
    8,
    dt
  );
  const drlBase = LIGHT_MODES[state.light]?.drl ?? 0;
  materials.drl.emissiveIntensity = damp(
    materials.drl.emissiveIntensity,
    drlBase + beat * 0.55,
    9,
    dt
  );
  moving = true;

  return moving;
}

function setupMusicControls() {
  const form = $("#music-form");
  const input = $("#music-url");
  const loadButton = $("#music-load");
  const toggle = $("#music-toggle");
  const volume = $("#music-volume");
  const lightShow = $("#music-lights");

  if (lightShow) {
    lightShow.checked = state.musicLights;
    lightShow.addEventListener("change", () => {
      state.musicLights = lightShow.checked;
      requestRender();
      showToast(state.musicLights ? "Music light show on" : "Music light show off");
    });
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadMusicTrack(input?.value || "");
  });

  loadButton?.addEventListener("click", (event) => {
    event.preventDefault();
    loadMusicTrack(input?.value || "");
  });

  toggle?.addEventListener("click", () => {
    if (!music.player || !music.ready) {
      setMusicStatus("Load a YouTube track first.", true);
      return;
    }
    if (music.playing) music.player.pauseVideo();
    else music.player.playVideo();
  });

  volume?.addEventListener("input", () => {
    music.volume = Number(volume.value) || 0;
    if (music.ready) music.player?.setVolume(music.volume);
  });

  $("#night-drive")?.addEventListener("click", () => {
    closeMobileConfig();
    goToView("night");
  });

  $("#village-drive")?.addEventListener("click", () => {
    closeMobileConfig();
    goToView("village");
  });

  updateMusicUI();
}

/* -------------------------------------------------------------------------- */
/*  UI: drive controls                                                        */
/* -------------------------------------------------------------------------- */

function syncDriveUI() {
  const speed = $("#drive-speed");
  if (speed) {
    if (document.activeElement !== speed) speed.value = String(state.driveSpeed);
    speed.disabled = Boolean(missionDirector?.active);
  }
  const out = $("#drive-speed-value");
  if (out) out.innerHTML = `${Math.round(state.driveSpeed)} <small>km/h</small>`;
  const rain = $("#drive-rain");
  if (rain) {
    rain.setAttribute("aria-pressed", state.rain ? "true" : "false");
    const label = rain.querySelector("span");
    if (label) {
      label.textContent =
        state.stage === "alps"
          ? state.rain
            ? "Heavy snow"
            : "Snowfall"
          : state.rain
            ? "Rain on"
            : "Rain off";
    }
  }
  const audio = $("#drive-audio");
  if (audio) {
    audio.setAttribute("aria-pressed", state.audioMuted ? "true" : "false");
    audio.setAttribute(
      "aria-label",
      state.audioMuted ? "Unmute ambience" : "Mute ambience"
    );
    const label = audio.querySelector("span");
    if (label) label.textContent = state.audioMuted ? "Muted" : "Sound on";
  }
  const stageLabel = $("#drive-stage-label");
  if (stageLabel) {
    stageLabel.textContent = STAGE_NAMES[state.stage] || "Studio";
  }
}

function applyRain(value) {
  state.rain = Boolean(value);
  stage?.module.setRain?.(state.rain);
  ambience.setRain(state.rain);
  syncDriveUI();
  syncTokyoUI();
  requestRender();
  const wet = state.stage === "alps" ? (state.rain ? "Heavy snowfall" : "Light snowfall") : state.rain ? "Rain on · wet road" : "Rain off · dry road";
  showToast(wet);
}

function setupDriveControls() {
  const speed = $("#drive-speed");
  speed?.addEventListener("input", () => {
    state.driveSpeed = Number(speed.value) || 0;
    syncDriveUI();
    requestRender();
  });
  $("#drive-rain")?.addEventListener("click", () => applyRain(!state.rain));
  $("#drive-audio")?.addEventListener("click", () => {
    state.audioMuted = !state.audioMuted;
    ambience.ensure();
    ambience.setMuted(state.audioMuted);
    syncDriveUI();
    syncTokyoUI();
    requestRender();
    showToast(state.audioMuted ? "Ambience muted" : "Ambience on");
  });
  syncDriveUI();
}

function startMission(kind) {
  if (!missionDirector || missionDirector.active) return;
  if (kind !== "date") return;
  if (stage?.kind !== "night") {
    goToView("night", { instant: true });
  }
  if (state.configOpen) closeMobileConfig();
  cameraTween = null;
  const ok = missionDirector.start(kind);
  if (ok) showToast("Date · Night City · experience started");
}

/* -------------------------------------------------------------------------- */
/*  UI: views and stage                                                       */
/* -------------------------------------------------------------------------- */

function setupViewControls() {
  $("#view-buttons")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    closeMobileConfig();
    goToView(button.dataset.view);
  });

  $("#mission-dock")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mission]");
    if (!button) return;
    startMission(button.dataset.mission);
  });

  const scroller = $("#view-buttons");
  scroller?.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      if (scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    },
    { passive: false }
  );

  $("#toggle-rotate")?.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    controls.autoRotate = state.autoRotate;
    $("#toggle-rotate")?.setAttribute("aria-pressed", state.autoRotate ? "true" : "false");
    showToast(state.autoRotate ? "Auto orbit on" : "Auto orbit off");
    if (state.autoRotate) hideHint();
    requestRender();
  });

  $("#toggle-motion")?.addEventListener("click", () => {
    state.motion = !state.motion;
    $("#toggle-motion")?.setAttribute("aria-pressed", state.motion ? "true" : "false");
    if (state.motion) {
      goToView("profile", { duration: 1.15 });
      showToast("Wheels in motion · pinch or scroll to zoom");
    } else {
      for (const wheel of wheels?.wheels ?? []) wheel.pivot.rotation.y *= 0;
      showToast("Wheels stopped");
    }
    requestRender();
  });

  $("#zoom-in")?.addEventListener("click", () => dolly(0.84));
  $("#zoom-out")?.addEventListener("click", () => dolly(1.2));

  $("#reset-view")?.addEventListener("click", () => {
    stopAutoRotate(true);
    state.motion = false;
    $("#toggle-motion")?.setAttribute("aria-pressed", "false");
    goToView("hero", { duration: 1.1 });
    showToast("View reset");
  });

  controls.addEventListener("start", () => {
    if (cameraTween) return;
    hideHint();
    canvas.classList.add("is-dragging");
  });
  controls.addEventListener("end", () => {
    canvas.classList.remove("is-dragging");
  });
  controls.addEventListener("change", requestRender);
  canvas.addEventListener("pointerdown", requestRender, { passive: true });
  canvas.addEventListener("wheel", requestRender, { passive: true });
}

/* -------------------------------------------------------------------------- */
/*  UI: info and mobile config                                                */
/* -------------------------------------------------------------------------- */

let lastFocused = null;

function openInfo() {
  if (state.infoOpen) return;
  lastFocused = document.activeElement;
  closeMobileConfig();
  state.infoOpen = true;
  document.body.classList.add("info-open");
  panelScrim.hidden = false;
  requestAnimationFrame(() => panelScrim.classList.add("is-visible"));
  infoModal.classList.add("is-open");
  infoModal.setAttribute("aria-hidden", "false");
  // Wait for the visibility transition to become focusable.
  requestAnimationFrame(() => $("#close-info")?.focus({ preventScroll: true }));
}

function closeInfo() {
  if (!state.infoOpen) return;
  state.infoOpen = false;
  infoModal.classList.remove("is-open");
  infoModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("info-open");
  if (!state.configOpen) {
    panelScrim.classList.remove("is-visible");
    setTimeout(() => {
      if (!state.infoOpen && !state.configOpen) panelScrim.hidden = true;
    }, 360);
  }
  lastFocused?.focus?.({ preventScroll: true });
}

function openMobileConfig() {
  closeInfo();
  state.configOpen = true;
  document.body.classList.add("config-open");
  $("#open-config")?.setAttribute("aria-expanded", "true");
  // Phones get a sheet with a scrim. On desktop the panel is a sidebar and the
  // studio stays fully interactive behind it.
  if (window.innerWidth <= 1024) {
    panelScrim.hidden = false;
    requestAnimationFrame(() => panelScrim.classList.add("is-visible"));
    setTimeout(() => $("#close-config")?.focus({ preventScroll: true }), 300);
  }
  updateProjection();
  requestRender();
}

function closeMobileConfig() {
  if (!state.configOpen) return;
  state.configOpen = false;
  document.body.classList.remove("config-open");
  $("#open-config")?.setAttribute("aria-expanded", "false");
  if (!state.infoOpen && window.innerWidth <= 1024) {
    panelScrim.classList.remove("is-visible");
    setTimeout(() => {
      if (!state.infoOpen && !state.configOpen) panelScrim.hidden = true;
    }, 360);
  }
  updateProjection();
  requestRender();
}

function setupOverlays() {
  $("#open-info")?.addEventListener("click", openInfo);
  $("#close-info")?.addEventListener("click", closeInfo);
  for (const button of $$("[data-close-info]")) {
    button.addEventListener("click", closeInfo);
  }
  $("#open-config")?.addEventListener("click", openMobileConfig);
  $("#close-config")?.addEventListener("click", closeMobileConfig);
  panelScrim?.addEventListener("click", () => {
    if (state.infoOpen) closeInfo();
    else closeMobileConfig();
  });

  $("#save-config")?.addEventListener("click", () => {
    const paint = PAINTS.find((item) => item.id === state.paint) || PAINTS[0];
    try {
      // Render the current studio frame synchronously, then download the
      // drawing buffer. This keeps the saved image identical to the stage.
      composer?.render();
      const data = renderer.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `XEV-9e-${paint.id}-${state.view}.png`;
      link.href = data;
      link.click();
      showToast(`${paint.name} · studio image saved`);
    } catch {
      showToast(`${paint.name} · configuration saved`);
    }
    // On phones the configurator is a sheet. Saving is the end of the task,
    // so get it out of the way and reveal the car.
    if (window.innerWidth <= 1024) closeMobileConfig();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.infoOpen) closeInfo();
      else if (state.configOpen) closeMobileConfig();
      return;
    }
    if (state.infoOpen) return;
    if (event.target instanceof HTMLElement) {
      const tag = event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.key >= "1" && event.key <= "9") || event.key === "0") {
      const order = [
        "hero",
        "profile",
        "rear",
        "front",
        "back",
        "top",
        "wheel",
        "cabin",
        "under",
        "night",
      ];
      const name = order[event.key === "0" ? 9 : Number(event.key) - 1];
      if (name) goToView(name);
    } else if (event.key.toLowerCase() === "r") {
      goToView("hero");
    } else if (event.key.toLowerCase() === "a") {
      $("#toggle-rotate")?.click();
    } else if (event.key.toLowerCase() === "v") {
      goToView("village");
    }
  });
}

/* -------------------------------------------------------------------------- */
/*  Window                                                                    */
/* -------------------------------------------------------------------------- */

let lastMobile = window.innerWidth <= 1024;

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.4 : 1.5)
  );
  renderer.setSize(w, h, false);
  composer?.setPixelRatio(renderer.getPixelRatio());
  composer?.setSize(w, h);
  const mobile = w <= 1024;
  if (mobile !== lastMobile) {
    lastMobile = mobile;
    if (mobile) closeMobileConfig();
    else openMobileConfig();
  }
  updateProjection();
  if (cameraTween) {
    const view = resolveView(state.view);
    cameraTween.toPos.copy(view.pos);
    cameraTween.toTarget.copy(view.target);
    cameraTween.toFov = view.fov;
  }
  requestRender();
}

window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);

/* -------------------------------------------------------------------------- */
/*  Animation                                                                 */
/* -------------------------------------------------------------------------- */

const clock = new THREE.Clock();
let frameCount = 0;
let motionTime = 0;
let wheelAngle = 0;
let frozen = false;
let renderQueued = false;
let renderEnabled = false;

/**
 * The studio is rendered on demand. A continuous 60 fps loop kept the GPU and
 * compositor busy even while the car was standing still, which made hovering
 * the DOM interface flicker on laptops. Every action that changes the studio
 * now schedules a frame; damping, camera tweens, lights and wheel motion keep
 * the loop alive only for as long as they are actually moving.
 */
function requestRender() {
  if (!renderEnabled || frozen || renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(renderFrame);
}

let dashExterior = null;

/**
 * The upper dash is visible through the windscreen from outside and reads as a
 * black shelf over the bonnet. It is still needed in the cabin view, so keep
 * it only while the camera is actually inside the greenhouse.
 */
function syncDashVisibility() {
  if (!dashExterior) dashExterior = scene.getObjectByName("DashExterior");
  if (!dashExterior) return;
  const p = camera.position;
  const inCabin =
    p.x > -2.1 && p.x < 1.15 && Math.abs(p.z) < 1.35 && p.y > 1.05 && p.y < 2.25;
  if (dashExterior.visible !== inCabin) dashExterior.visible = inCabin;
}

function frameOnce() {
  updateProjection();
  syncDashVisibility();
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

function renderFrame() {
  renderQueued = false;
  if (frozen) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const tokyoActive = stage?.kind === "tokyo";
  const tokyoDriving = tokyoActive && tokyoDrive.on;
  const parked = tokyoActive && !tokyoDriving;
  const driveSpeed = tokyoDriving
    ? Math.abs(tokyoDrive.speed)
    : stage && !tokyoActive
      ? state.driveSpeed / 3.6
      : 0; // m/s
  ambience.update(dt, driveSpeed);

  updateCameraTween(dt);

  const controlsMoved =
    missionDirector?.active || tokyoDriving ? false : controls.update();
  if (missionDirector?.active) missionDirector.update(dt, elapsed);
  if (cameraTween) {
    camera.updateProjectionMatrix();
  }

  let sceneMoving = false;
  const driving = !tokyoActive && (Boolean(stage) || state.motion);
  const rolling = tokyoDriving
    ? driveSpeed > 0.02
    : stage && !tokyoActive
      ? driveSpeed > 0.02
      : state.motion && !parked;
  const movingStage = tokyoDriving || (Boolean(stage) && !tokyoActive);

  if (tokyoDriving) {
    sceneMoving = true;
    updateTokyoDrive(dt);
    steerAngle = tokyoDrive.steer;
    steerWheelAngle = tokyoDrive.steer * 7.4;
    // The car's visual roll and pitch are solved below; this branch owns the
    // heading, position and wheel spin.
  } else if (driving) {
    sceneMoving = true;
    motionTime += dt;
    const speed = stage ? driveSpeed : 7.6; // m/s
    const distance = speed * dt;
    const isVillage = stage?.kind === "village";
    const laneBase = isVillage ? VILLAGE_LANE_Z : 0;

    if (rolling) {
      wheelAngle += distance;
      for (const wheel of wheels?.wheels ?? []) {
        const sign = wheel.side > 0 ? -1 : 1;
        wheel.spin.rotation.z += (sign * distance) / wheel.radius;
      }

      // A slow weave down the road. The input is a sum of two sines so the
      // wheel never looks like a metronome, and the amplitude shrinks with
      // speed: a real car needs far less lock at 200 km/h than at 35.
      const speedT = stage ? Math.min(1, driveSpeed / 56.1) : 0.2;

      // Nearby traffic makes the car ease away from the lane it occupies. The
      // stage scrolls under the car, so the same information that moves the AI
      // cars can bias the player's steering without any extra raycasts.
      let trafficBias = 0;
      if (stage) {
        const vehicles = stage.module.traffic ?? stage.module.roadActors;
        if (vehicles?.length) {
          const groupZ = stage.module.group.position.z;
          for (const item of vehicles) {
            const object = item.object;
            if (!object) continue;
            const ahead = object.position.x;
            if (Math.abs(ahead) > 18) continue;
            const laneZ = item.laneZ ?? object.position.z;
            const dz = laneZ + groupZ - carGroup.position.z;
            if (Math.abs(dz) > 1.9) continue;
            const closeness = 1 - Math.abs(ahead) / 18;
            trafficBias += (dz >= 0 ? -1 : 1) * closeness * 0.075;
          }
          trafficBias = THREE.MathUtils.clamp(trafficBias, -0.1, 0.1);
        }
      }

      // Gentle lane wander, damped so the car never snaps sideways. The car
      // itself shifts a few centimetres in world space and yaws into the
      // movement; the wheels and steering wheel follow the same command.
      laneShiftTimer -= dt;
      if (laneShiftTimer <= 0) {
        laneShiftTimer = 7 + Math.random() * 5;
        laneOffsetTarget = isVillage ? 0 : (Math.random() - 0.5) * 0.46;
      }
      const previousOffset = laneOffset;
      // The village car stays planted in the middle of its lane. A wander of
      // even a few centimetres reads as "drifting onto the verge" from the
      // low chase camera, especially with the hedge so close on the right.
      const desiredOffset = isVillage
        ? 0
        : laneOffsetTarget + trafficBias * 1.5;
      laneOffset = damp(laneOffset, desiredOffset, 1.2, dt);
      const lateralVelocity = (laneOffset - previousOffset) / Math.max(dt, 0.001);
      const bodyYaw = THREE.MathUtils.clamp(
        -Math.atan2(lateralVelocity, Math.max(6, driveSpeed)) * 0.9,
        -0.05,
        0.05
      );
      carGroup.rotation.y = damp(carGroup.rotation.y, bodyYaw, 3.2, dt);
      carGroup.position.z = laneBase + laneOffset;

      const steerInput =
        Math.sin(elapsed * 0.43) * 0.68 +
        Math.sin(elapsed * 0.17 + 1.2) * 0.32 +
        trafficBias * 1.4 +
        lateralVelocity * 0.06;
      const steerAmplitude = stage ? 0.11 - 0.042 * speedT : 0.13;
      steerAngle = THREE.MathUtils.clamp(
        steerInput * steerAmplitude,
        -0.16,
        0.16
      );
      // The wheel turns several times further than the road wheels, which is
      // what makes the movement readable from the cabin camera.
      steerWheelAngle = steerAngle * 7.4;

      wheels?.wheels.forEach((wheel) => {
        if (wheel.name === "FL" || wheel.name === "FR") {
          wheel.pivot.rotation.y = steerAngle;
        }
      });
    } else {
      steerAngle = damp(steerAngle, 0, 5, dt);
      steerWheelAngle = damp(steerWheelAngle, 0, 5, dt);
      laneOffset = damp(laneOffset, 0, 4, dt);
      carGroup.position.z = laneBase + laneOffset;
      carGroup.rotation.y = damp(carGroup.rotation.y, 0, 4, dt);
      wheels?.wheels.forEach((wheel) => {
        if (wheel.name === "FL" || wheel.name === "FR") {
          wheel.pivot.rotation.y = steerAngle;
        }
      });
    }

    const bobScale = stage ? Math.min(1, driveSpeed / 3) : 1;
    carGroup.position.y = stage
      ? Math.sin(elapsed * 7.1) * 0.0012 * bobScale
      : Math.sin(elapsed * 8.4) * 0.0015;
  } else {
    steerAngle = damp(steerAngle, 0, 6, dt);
    steerWheelAngle = damp(steerWheelAngle, 0, 6, dt);
    if (!parked) {
      laneOffset = damp(laneOffset, 0, 5, dt);
      carGroup.position.z = laneOffset;
      carGroup.rotation.y = damp(carGroup.rotation.y, 0, 5, dt);
      carGroup.position.y = damp(carGroup.position.y, 0, 6, dt);
      if (Math.abs(carGroup.position.y) > 0.0002) sceneMoving = true;
    } else {
      // Tokyo parks the car wherever the player left it. Hold that pose exactly
      // so the studio's lane weave and idle bob never leak into the street.
      carGroup.position.set(tokyoDrive.position.x, 0, tokyoDrive.position.z);
      carGroup.rotation.set(0, tokyoDrive.heading, 0);
    }
    wheels?.wheels.forEach((wheel) => {
      wheel.pivot.rotation.y = damp(wheel.pivot.rotation.y, 0, 6, dt);
      if (Math.abs(wheel.pivot.rotation.y) > 0.0005) sceneMoving = true;
    });
  }

  // Subtle body motion. The car is a rigid prop, so without this it glides
  // like a hovercraft; a little roll into the steering and pitch under braking
  // makes the drive read as a heavy vehicle on real tyres.
  const accel = tokyoDriving
    ? tokyoDrive.accel
    : movingStage
      ? (state.driveSpeed - lastDriveSpeed) / Math.max(dt, 0.001)
      : 0;
  lastDriveSpeed = state.driveSpeed;
  const speedK = tokyoDriving
    ? clamp01(Math.abs(tokyoDrive.speed) / 26)
    : clamp01(state.driveSpeed / 80);
  const rollTarget = movingStage ? -steerAngle * 0.055 * speedK : 0;
  const pitchTarget = movingStage
    ? -Math.max(tokyoDriving ? -18 : -55, Math.min(tokyoDriving ? 18 : 55, accel)) *
      (tokyoDriving ? 0.004 : 0.00075)
    : 0;
  bodyRoll = damp(bodyRoll, rollTarget, 4.5, dt);
  bodyPitch = damp(bodyPitch, pitchTarget, 3.2, dt);
  if (!parked) {
    carGroup.rotation.x = bodyRoll;
    carGroup.rotation.z = bodyPitch;
  }

  if (steeringWheel) steeringWheel.rotation.z = steerWheelAngle;

  // The driver is only aboard while the car is actually rolling through a
  // stage. Hands are solved onto the live steering angle, so the wheel and the
  // arms stay locked together through the whole weave. Scripted experiences
  // can keep him aboard while the car is parked.
  if (driver) {
    const showDriver =
      (Boolean(stage) && !parked && driveSpeed > 0.35) ||
      Boolean(missionDirector?.driverAboard);
    if (driver.group.visible !== showDriver) driver.group.visible = showDriver;
    if (cabinLight && cabinLight.visible !== showDriver) cabinLight.visible = showDriver;
    if (showDriver) driver.update(dt, driveSpeed, steerWheelAngle, elapsed);
  }

  // Flush handles present themselves when the car is parked, then retract as
  // soon as it pulls away. Four groups, so this is effectively free.
  const handleTarget = stage && !parked && driveSpeed > 0.35 ? 0 : 1;
  const previousHandle = handlePhase;
  handlePhase = damp(handlePhase, handleTarget, 7.5, dt);
  if (doorHandles.length && Math.abs(handlePhase - previousHandle) > 0.00002) {
    for (const handle of doorHandles) {
      const { side, baseZ, blade, chrome } = handle.userData;
      blade.position.z = baseZ + side * (0.0035 + handlePhase * 0.018);
      chrome.position.z = baseZ + side * (0.0055 + handlePhase * 0.018);
    }
    sceneMoving = true;
  }

  if (stage) {
    let playerObstacle = null;
    if (tokyoDriving) {
      playerObstacle = {
        x: tokyoDrive.position.x,
        z: tokyoDrive.position.z,
        heading: tokyoDrive.heading,
        halfLength: TOKYO_CAR.halfLength,
        halfWidth: TOKYO_CAR.halfWidth,
      };
    } else if (stage.kind === "village") {
      playerObstacle = {
        x: carGroup.position.x,
        z: carGroup.position.z,
        heading: carGroup.rotation.y,
        halfLength: TOKYO_CAR.halfLength,
        halfWidth: TOKYO_CAR.halfWidth,
      };
    }
    stage.module.update(
      dt,
      elapsed,
      driveSpeed,
      camera,
      tokyoActive ? carGroup.position.x : 0,
      playerObstacle
    );
    sceneMoving = true;
  }

  const lightsMoving = animateLights(dt);
  const musicMoving = animateMusicLights(dt);
  syncDashVisibility();

  if (composer) composer.render();
  else renderer.render(scene, camera);

  frameCount++;
  if (!window.__XEV_READY__) window.__XEV_READY__ = true;

  if (
    cameraTween ||
    controlsMoved ||
    controls.autoRotate ||
    state.motion ||
    stage ||
    sceneMoving ||
    lightsMoving ||
    musicMoving
  ) {
    requestRender();
  }
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                      */
/* -------------------------------------------------------------------------- */

function wireUI() {
  buildSwatches();
  setupLightingControls();
  setupMusicControls();
  setupDriveControls();
  setupTokyoControls();
  setupViewControls();
  setupOverlays();
  syncLightUI();
  syncPaintUI(PAINTS[0]);

  // Browsers only allow Web Audio after a gesture. Unlock on the first one and
  // immediately restore the current stage/rain mix so the ambience never starts
  // late or with the wrong bed.
  const unlockAmbience = () => {
    ambience.ensure();
    ambience.setStage(state.stage);
    ambience.setRain(state.rain);
    ambience.setMuted(state.audioMuted);
  };
  window.addEventListener("pointerdown", unlockAmbience, {
    once: true,
    passive: true,
  });
  window.addEventListener("keydown", unlockAmbience, { once: true });

  // The panel first reveals itself once the car is ready on small screens.
  if (window.innerWidth > 1024) {
    state.configOpen = true;
    document.body.classList.add("config-open");
    $("#open-config")?.setAttribute("aria-expanded", "true");
  } else {
    state.configOpen = false;
    document.body.classList.remove("config-open");
  }
}

async function boot() {
  try {
    wireUI();

    // Diagnostic: render only the DOM interface on a flat studio background.
    // This isolates a browser/compositor fault from anything drawn by WebGL.
    if (params.has("static")) {
      canvas.style.display = "none";
      document.body.classList.add("is-ready");
      loader?.classList.add("is-hidden");
      $("#orbit-hint")?.classList.add("is-hidden");
      return;
    }

    await build();
    renderEnabled = true;
    requestRender();
  } catch (error) {
    console.error("XEV 9e failed to build:", error);
    if (loaderStatus) {
      loaderStatus.textContent = "Unable to start the 3D studio";
      loaderStatus.style.color = "#8f2b25";
    }
    if (loaderPct) loaderPct.textContent = "—";
    if (loaderBar) loaderBar.style.background = "#8f2b25";
    // Keep the loader visible so the failure is not silent.
  }
}

boot();

/* -------------------------------------------------------------------------- */
/*  Debug / QA API                                                            */
/* -------------------------------------------------------------------------- */

window.__XEV = {
  THREE,
  get ready() {
    return window.__XEV_READY__ === true;
  },
  get scene() {
    return scene;
  },
  camera,
  renderer,
  controls,
  get car() {
    return carGroup;
  },
  get materials() {
    return materials;
  },
  get composer() {
    return composer;
  },
  get wheels() {
    return wheels;
  },
  get nightCity() {
    return nightCity;
  },
  get village() {
    return village;
  },
  get alps() {
    return alps;
  },
  get tokyo() {
    return tokyo;
  },
  get tokyoDrive() {
    return {
      on: tokyoDrive.on,
      x: +tokyoDrive.position.x.toFixed(2),
      z: +tokyoDrive.position.z.toFixed(2),
      heading: +tokyoDrive.heading.toFixed(3),
      speed: +tokyoDrive.speed.toFixed(2),
      steer: +tokyoDrive.steer.toFixed(3),
    };
  },
  setTokyoDrive(value) {
    setTokyoDrive(Boolean(value));
  },
  setTokyoPose(x, z, heading = 0) {
    tokyoDrive.position.set(x, 0, z);
    tokyoDrive.heading = heading;
    tokyoDrive.speed = 0;
    tokyoDrive.steer = 0;
    tokyoDrive.accel = 0;
    tokyoDrive.distance = 0;
    tokyoDrive.impact = 0;
    tokyoDrive.keys.clear();
    if (stage?.kind === "tokyo" && !tokyoDrive.on) {
      carGroup.position.set(x, 0, z);
      carGroup.rotation.set(0, heading, 0);
    }
    requestRender();
  },
  stepTokyoDrive(seconds = 1, dt = 1 / 60, keys = []) {
    if (!tokyoDrive.on) return null;
    tokyoDrive.keys = new Set(keys);
    const steps = Math.max(1, Math.min(900, Math.round(seconds / dt)));
    for (let i = 0; i < steps; i++) updateTokyoDrive(dt);
    tokyoDrive.keys.clear();
    return {
      x: +tokyoDrive.position.x.toFixed(2),
      z: +tokyoDrive.position.z.toFixed(2),
      heading: +tokyoDrive.heading.toFixed(3),
      speed: +tokyoDrive.speed.toFixed(2),
      steer: +tokyoDrive.steer.toFixed(3),
    };
  },
  // Deterministic village tick used by the QA scripts. The live loop is too
  // slow under headless WebGL to close a traffic gap in reasonable wall time.
  stepVillage(seconds = 1, dt = 1 / 60) {
    if (stage?.kind !== "village") return null;
    const steps = Math.max(1, Math.min(1800, Math.round(seconds / dt)));
    const speed = state.driveSpeed / 3.6;
    const player = {
      x: carGroup.position.x,
      z: carGroup.position.z,
      heading: carGroup.rotation.y,
      halfLength: TOKYO_CAR.halfLength,
      halfWidth: TOKYO_CAR.halfWidth,
    };
    const start = clock.elapsedTime;
    for (let i = 0; i < steps; i++) {
      stage.module.update(dt, start + i * dt, speed, camera, 0, player);
    }
    return {
      player,
      actors: stage.module.roadActors.map((actor) => ({
        type: actor.type,
        x: +actor.object.position.x.toFixed(2),
        z: +actor.object.position.z.toFixed(2),
        dir: actor.dir,
        length: actor.length,
        width: actor.width,
      })),
    };
  },
  // Deterministic stage tick used by the QA scripts. Headless WebGL runs the
  // render loop slowly, so traffic needs to be advanced explicitly when the
  // player is parked and we want to test vehicle avoidance.
  stepTokyo(seconds = 1, dt = 1 / 60) {
    if (stage?.kind !== "tokyo") return null;
    const steps = Math.max(1, Math.min(1800, Math.round(seconds / dt)));
    const player = tokyoDrive.on
      ? {
          x: tokyoDrive.position.x,
          z: tokyoDrive.position.z,
          heading: tokyoDrive.heading,
          halfLength: TOKYO_CAR.halfLength,
          halfWidth: TOKYO_CAR.halfWidth,
        }
      : null;
    const focus = tokyoDrive.on ? tokyoDrive.position.x : carGroup.position.x;
    const start = clock.elapsedTime;
    for (let i = 0; i < steps; i++) {
      stage.module.update(dt, start + i * dt, 0, camera, focus, player);
    }
    return {
      player,
      traffic: stage.module.traffic.map((vehicle) => ({
        x: +vehicle.object.position.x.toFixed(2),
        z: +vehicle.object.position.z.toFixed(2),
      })),
    };
  },
  get mission() {
    return missionDirector;
  },
  get nightActive() {
    return stage?.kind === "night";
  },
  get stage() {
    return stage?.kind ?? null;
  },
  music,
  ambience,
  parseYouTubeId,
  setNight(value) {
    goToView(value ? "night" : "hero", { instant: true });
  },
  setVillage(value) {
    goToView(value ? "village" : "hero", { instant: true });
  },
  setAlps(value) {
    goToView(value ? "alps" : "hero", { instant: true });
  },
  setRain(value) {
    applyRain(value);
  },
  setDriveSpeed(value) {
    const next = THREE.MathUtils.clamp(Number(value) || 0, 0, 202);
    state.driveSpeed = next;
    syncDriveUI();
    requestRender();
  },
  previewMusicLights(value = true) {
    state.musicPreview = Boolean(value);
    if (state.musicPreview) music.patternTime = 0;
    requestRender();
  },
  setMusicLights(value) {
    state.musicLights = Boolean(value);
    const input = $("#music-lights");
    if (input) input.checked = state.musicLights;
    requestRender();
  },
  loadMusicTrack,
  setView(name, instant = true) {
    goToView(name, { instant });
  },
  setPaint(id, announce = false) {
    const paint = PAINTS.find((item) => item.id === id);
    if (paint) setPaint(paint, announce);
  },
  setLightMode(mode) {
    if (!LIGHT_MODES[mode]) return;
    state.light = mode;
    syncLightUI();
  },
  setMotion(value) {
    state.motion = value;
    $("#toggle-motion")?.setAttribute("aria-pressed", value ? "true" : "false");
    requestRender();
  },
  setAutoRotate(value) {
    state.autoRotate = value;
    controls.autoRotate = value;
    $("#toggle-rotate")?.setAttribute("aria-pressed", value ? "true" : "false");
    requestRender();
  },
  freeze() {
    frozen = true;
    if (composer) composer.render();
    else renderer.render(scene, camera);
  },
  unfreeze() {
    if (!frozen) return;
    frozen = false;
    requestRender();
  },
  state,
};
