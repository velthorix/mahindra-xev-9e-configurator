import * as THREE from "three";

/**
 * Sharp line-segment rain.
 *
 * No sprite cards, no soft textures: every drop is a thin line whose slant
 * follows the relative airflow, so the shower leans back as the car picks up
 * speed. Wind arrives in gusts, streak length and brightness vary per drop, and
 * a small pool of sharp three-spoke splashes ticks off the ground. Per-vertex
 * alpha (RGBA colour) fades both streaks and splashes without any blending
 * tricks or screen-space blur.
 */
export function createRain({
  count = 1100,
  radius = 24,
  height = 17,
  color = 0xbcd4e8,
  opacity = 0.5,
  windX = 0.55,
  windZ = 0.18,
} = {}) {
  const rand = (() => {
    let seed = 0x9e3779b9;
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();

  const tint = new THREE.Color(color);
  const splashTint = new THREE.Color(0xdbe8f2);

  /* ------------------------------- streaks ------------------------------- */

  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 8);
  const drops = new Array(count);

  function respawn(drop, initial = false) {
    const angle = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    drop.x = Math.cos(angle) * r;
    drop.z = Math.sin(angle) * r;
    drop.y = initial ? 0.4 + rand() * height : height - rand() * 3;
    drop.length = 0.3 + rand() * 0.72;
    drop.speed = 14 + rand() * 13;
    drop.drift = 0.55 + rand() * 0.85;
    drop.bright = 0.18 + rand() * 0.72;
    drop.phase = rand() * Math.PI * 2;
  }

  for (let i = 0; i < count; i++) {
    const drop = {};
    respawn(drop, true);
    drops[i] = drop;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    vertexColors: true,
    depthWrite: false,
    fog: true,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "RainStreaks";
  lines.frustumCulled = false;
  lines.renderOrder = 12;

  /* ------------------------------- splashes ------------------------------ */

  const SPLASHES = Math.max(24, Math.min(160, Math.round(count * 0.11)));
  const splashPositions = new Float32Array(SPLASHES * 18);
  const splashColors = new Float32Array(SPLASHES * 24);
  const splashGeo = new THREE.BufferGeometry();
  splashGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(splashPositions, 3)
  );
  splashGeo.setAttribute("color", new THREE.BufferAttribute(splashColors, 4));

  const splashMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    vertexColors: true,
    depthWrite: false,
    fog: true,
  });
  const splashLines = new THREE.LineSegments(splashGeo, splashMat);
  splashLines.name = "RainSplashes";
  splashLines.frustumCulled = false;
  splashLines.renderOrder = 13;

  const splashes = new Array(SPLASHES);
  for (let i = 0; i < SPLASHES; i++) {
    splashes[i] = {
      x: 0,
      z: 0,
      life: 0,
      max: 0.26,
      angle: 0,
      scale: 1,
      bright: 0,
    };
  }
  let splashCursor = 0;

  function spawnSplash(x, z) {
    const splash = splashes[splashCursor];
    splashCursor = (splashCursor + 1) % SPLASHES;
    splash.x = x;
    splash.z = z;
    splash.max = 0.22 + rand() * 0.2;
    splash.life = splash.max;
    splash.angle = rand() * Math.PI * 2;
    splash.scale = 0.6 + rand() * 0.9;
    splash.bright = 0.35 + rand() * 0.55;
  }

  /* -------------------------------- group -------------------------------- */

  const group = new THREE.Group();
  group.name = "Rain";
  group.add(lines, splashLines);
  group.visible = false;

  let time = 0;

  function writeStreak(i, vx, vz, stretch, proximity = 1) {
    const drop = drops[i];
    const i6 = i * 6;
    const i8 = i * 8;
    const length = drop.length * stretch * (0.28 + proximity * 0.72);
    const topX = drop.x - (vx / drop.speed) * length;
    const topZ = drop.z - (vz / drop.speed) * length;

    positions[i6] = drop.x;
    positions[i6 + 1] = drop.y;
    positions[i6 + 2] = drop.z;
    positions[i6 + 3] = topX;
    positions[i6 + 4] = drop.y + length;
    positions[i6 + 5] = topZ;

    // Fade each drop independently. The head is bright, the top of the streak
    // is dimmer, which reads as motion rather than a solid stick. Drops close
    // to the lens also fade out: a one-metre streak two metres from the camera
    // covered a quarter of the screen and read as a long stray scratch.
    const a = drop.bright * proximity;
    colors[i8] = tint.r;
    colors[i8 + 1] = tint.g;
    colors[i8 + 2] = tint.b;
    colors[i8 + 3] = 0.1 + a * 0.72;
    colors[i8 + 4] = tint.r * 0.5;
    colors[i8 + 5] = tint.g * 0.5;
    colors[i8 + 6] = tint.b * 0.5;
    colors[i8 + 7] = 0.02 + a * 0.16;
  }

  const localCamera = new THREE.Vector3();

  function update(dt, speed = 0, camera = null) {
    if (!group.visible) return;
    time += dt;

    // Rain is parented to the stage, so bring the camera into the same space
    // once per frame rather than per drop.
    if (camera) {
      localCamera.copy(camera.position);
      group.worldToLocal(localCamera);
    }

    // Two slow sine layers make the wind rise and fall instead of blowing at a
    // constant rate. The gust also stretches the streaks a little.
    const gust =
      0.78 +
      Math.sin(time * 0.62) * 0.22 +
      Math.sin(time * 1.73 + 1.4) * 0.12;
    const gustClamped = THREE.MathUtils.clamp(gust, 0.42, 1.18);
    const gustX = windX * gustClamped;
    const gustZ = windZ * gustClamped;

    // Relative airflow: the world scrolls past the car, so rain leans back as
    // speed rises. Keep the factor below 1 so the streaks stay believable.
    const vx = gustX - speed * 0.75;
    const vz = gustZ - speed * 0.08;
    const stretch = 1 + Math.min(0.55, Math.abs(vx) * 0.028);

    for (let i = 0; i < count; i++) {
      const drop = drops[i];
      drop.x += vx * drop.drift * dt;
      drop.z += vz * drop.drift * dt;
      drop.y -= drop.speed * dt;
      drop.length = drop.length * 0.995 + (0.3 + drop.bright * 0.7) * 0.005;

      if (drop.y < 0.08) {
        // Only a fraction of drops spawn a splash; the pool then stays sparse
        // and sharp instead of turning the road into a white haze.
        if (rand() < 0.2) spawnSplash(drop.x, drop.z);
        respawn(drop);
      }

      if (drop.x > radius) drop.x -= radius * 2;
      else if (drop.x < -radius) drop.x += radius * 2;
      if (drop.z > radius) drop.z -= radius * 2;
      else if (drop.z < -radius) drop.z += radius * 2;

      let proximity = 1;
      if (camera) {
        const dx = drop.x - localCamera.x;
        const dy = drop.y - localCamera.y;
        const dz = drop.z - localCamera.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        proximity = THREE.MathUtils.smoothstep(dist, 1.4, 5.2);
      }

      writeStreak(
        i,
        vx * drop.drift * stretch,
        vz * drop.drift * stretch,
        stretch,
        proximity
      );
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;

    /* ------------------------------ splashes ----------------------------- */

    let anySplash = false;
    for (let i = 0; i < SPLASHES; i++) {
      const splash = splashes[i];
      const base = i * 18;
      const cbase = i * 24;

      if (splash.life <= 0) {
        for (let v = 0; v < 6; v++) {
          splashColors[cbase + v * 4 + 3] = 0;
        }
        continue;
      }

      anySplash = true;
      splash.life = Math.max(0, splash.life - dt);
      const t = splash.life / splash.max;
      const fade = t * t;
      const grow = 1 + (1 - t) * 1.6;
      const alpha = fade * splash.bright * 0.7;
      const reach = 0.13 * splash.scale * grow;
      const lift = 0.075 * splash.scale * (0.35 + (1 - t) * 0.65);

      for (let s = 0; s < 3; s++) {
        const angle = splash.angle + s * 2.094;
        const dx = Math.cos(angle) * reach;
        const dz = Math.sin(angle) * reach;
        const v = s * 6;
        splashPositions[base + v] = splash.x;
        splashPositions[base + v + 1] = 0.02;
        splashPositions[base + v + 2] = splash.z;
        splashPositions[base + v + 3] = splash.x + dx;
        splashPositions[base + v + 4] = 0.02 + lift;
        splashPositions[base + v + 5] = splash.z + dz;

        for (let e = 0; e < 2; e++) {
          const c = cbase + (s * 2 + e) * 4;
          splashColors[c] = splashTint.r;
          splashColors[c + 1] = splashTint.g;
          splashColors[c + 2] = splashTint.b;
          splashColors[c + 3] = e === 0 ? alpha : alpha * 0.25;
        }
      }
    }
    if (anySplash) {
      splashGeo.attributes.position.needsUpdate = true;
      splashGeo.attributes.color.needsUpdate = true;
    }
  }

  function setVisible(value) {
    group.visible = Boolean(value);
    if (!value) {
      // Clear the splash pool so the next shower starts clean.
      for (const splash of splashes) splash.life = 0;
      for (let i = 0; i < SPLASHES; i++) {
        for (let v = 0; v < 6; v++) splashColors[i * 24 + v * 4 + 3] = 0;
      }
      splashGeo.attributes.color.needsUpdate = true;
      return;
    }
    // Reposition the field when rain is switched back on so the first frame
    // already has a full column of drops around the car.
    update(0.016, 0);
  }

  function setStyle({ color: nextColor, opacity: nextOpacity } = {}) {
    if (nextColor !== undefined) {
      tint.set(nextColor);
      splashTint.set(nextColor).lerp(new THREE.Color(0xffffff), 0.35);
    }
    if (nextOpacity !== undefined) material.opacity = nextOpacity;
  }

  return { group, update, setVisible, setStyle };
}
