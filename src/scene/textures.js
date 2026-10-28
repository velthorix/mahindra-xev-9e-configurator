import * as THREE from "three";

function canvasTexture(w, h, draw, { srgb = true, repeat = null } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/* -------------------------------------------------------------------------- */
/*  Sculpted nose texture                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The XEV's closed nose is body colour, not gloss black. Its surface is covered
 * with a very fine diamond/rib lattice that catches the light without looking
 * like a sticker. Keep the contrast low so it reads as milled metal under the
 * clearcoat, not as film grain.
 */
export function makeNoseMaps() {
  const size = 1024;
  const bump = canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, w, h);

      const step = 20;
      ctx.lineCap = "round";
      for (let x = -w; x < w * 2; x += step) {
        ctx.strokeStyle = "#bdbdbd";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();

        ctx.strokeStyle = "#525252";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(x + 2.5, 0);
        ctx.lineTo(x + h + 2.5, h);
        ctx.stroke();
      }
      for (let x = -w; x < w * 2; x += step) {
        ctx.strokeStyle = "#b2b2b2";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + h, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        ctx.strokeStyle = "#585858";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + h + 2, 0);
        ctx.lineTo(x + 2, h);
        ctx.stroke();
      }
    },
    { srgb: false }
  );
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(7, 3.2);
  bump.anisotropy = 8;

  // A very faint colour lattice. Bump alone disappears under the broad studio
  // softboxes; this keeps the milled texture legible while multiplying with
  // whatever paint colour is selected.
  const pattern = canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      const step = 20;
      ctx.lineCap = "round";
      for (let x = -w; x < w * 2; x += step) {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + h, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    },
    { srgb: true }
  );
  pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping;
  pattern.repeat.set(4, 2);
  pattern.anisotropy = 8;

  const rough = canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = "#9a9a9a";
      ctx.fillRect(0, 0, w, h);
      // A slight vertical polish variation. This is deliberately subtle: a
      // high-frequency roughness map produces the dirty, dotted paint that the
      // previous revision showed under the studio lights.
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0.08)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.02)");
      grad.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    },
    { srgb: false }
  );
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  rough.repeat.set(3, 1.5);

  return { bump, pattern, rough };
}

/* -------------------------------------------------------------------------- */
/*  Text decals                                                               */
/* -------------------------------------------------------------------------- */

export function makeTextTexture(
  text,
  {
    width = 1024,
    height = 256,
    color = "#f2f4f5",
    font = "600 130px 'DM Sans', sans-serif",
    letterSpacing = 0,
    align = "center",
    weight = "",
  } = {}
) {
  return canvasTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = font;
    if (letterSpacing && "letterSpacing" in ctx) {
      ctx.letterSpacing = `${letterSpacing}px`;
    } else if (letterSpacing) {
      // manual spacing fallback
      const chars = [...text];
      const widths = chars.map((c) => ctx.measureText(c).width + letterSpacing);
      const total = widths.reduce((a, b) => a + b, 0) - letterSpacing;
      let x = (w - total) / 2;
      chars.forEach((c, i) => {
        ctx.textAlign = "left";
        ctx.fillText(c, x, h / 2);
        x += widths[i];
      });
      return;
    }
    ctx.fillText(text, w / 2, h / 2);
  });
}

export function makePlateTexture(text = "XEV 9e") {
  return canvasTexture(900, 240, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#121416");
    g.addColorStop(1, "#050607");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#32363a";
    ctx.lineWidth = 10;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.fillStyle = "#e8ecef";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "500 132px 'DM Sans', sans-serif";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "12px";
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
}

/* -------------------------------------------------------------------------- */
/*  Screens                                                                   */
/* -------------------------------------------------------------------------- */

function screenBase(ctx, w, h, accent = "#7ce7e1") {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0a0f12");
  g.addColorStop(0.55, "#0b1115");
  g.addColorStop(1, "#070a0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.strokeRect(16 + i * 2, 16 + i * 2, w - 32 - i * 4, h - 32 - i * 4);
  }
  return accent;
}

export function makeDriverScreenTexture() {
  return canvasTexture(1024, 560, (ctx, w, h) => {
    const accent = screenBase(ctx, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = "500 26px 'DM Sans', sans-serif";
    ctx.fillText("RANGE", 64, 86);
    ctx.fillText("BATTERY", 64, 420);
    ctx.fillStyle = "#eef7f6";
    ctx.font = "300 196px 'DM Sans', sans-serif";
    ctx.fillText("656", 58, 260);
    ctx.font = "400 40px 'DM Sans', sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("km", 430, 255);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(620, 80);
    ctx.lineTo(620, 480);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "500 92px 'DM Sans', sans-serif";
    ctx.fillText("D", 684, 205);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "400 31px 'DM Sans', sans-serif";
    ctx.fillText("NORMAL", 680, 262);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText("24°C   •   12:42", 680, 320);
    // battery arc
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(500, 452, 64, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(500, 452, 64, Math.PI * 0.8, Math.PI * 1.82);
    ctx.stroke();
    ctx.fillStyle = "#e9f3f2";
    ctx.font = "500 45px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("82%", 500, 468);
    ctx.textAlign = "left";
    // speed tick marks
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.8 + (i / 13) * Math.PI * 0.9;
      ctx.beginPath();
      ctx.moveTo(500 + Math.cos(a) * 78, 452 + Math.sin(a) * 78);
      ctx.lineTo(500 + Math.cos(a) * (i % 2 ? 84 : 92), 452 + Math.sin(a) * (i % 2 ? 84 : 92));
      ctx.stroke();
    }
  });
}

export function makeCenterScreenTexture() {
  return canvasTexture(1280, 800, (ctx, w, h) => {
    const accent = screenBase(ctx, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "500 24px 'DM Sans', sans-serif";
    ctx.fillText("NAVIGATION", 58, 70);
    // map blocks
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(48, 96, 760, 636, 26);
    ctx.clip();
    ctx.fillStyle = "#0a1418";
    ctx.fillRect(48, 96, 760, 636);
    ctx.strokeStyle = "rgba(124,231,225,0.13)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(50 + i * 58, 90);
      ctx.lineTo(180 + i * 42, 735);
      ctx.stroke();
    }
    for (let i = 0; i < 13; i++) {
      ctx.beginPath();
      ctx.moveTo(40, 120 + i * 52);
      ctx.lineTo(815, 180 + i * 44);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(180, 720);
    ctx.bezierCurveTo(280, 560, 360, 600, 430, 450);
    ctx.bezierCurveTo(500, 300, 620, 310, 690, 150);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(240, 710);
    ctx.bezierCurveTo(340, 570, 400, 580, 465, 440);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(470, 435, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(48, 96, 760, 636, 26);
    ctx.stroke();

    // right column - now playing
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = "500 22px 'DM Sans', sans-serif";
    ctx.fillText("MEDIA", 856, 70);
    const grad = ctx.createLinearGradient(856, 100, 1190, 400);
    grad.addColorStop(0, "#254b4b");
    grad.addColorStop(0.5, "#1b3536");
    grad.addColorStop(1, "#0d1719");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(856, 100, 370, 286, 22);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(1041, 243, 76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(1041, 243, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f0f8f7";
    ctx.font = "500 34px 'DM Sans', sans-serif";
    ctx.fillText("Silent Shores", 858, 448);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = "400 24px 'DM Sans', sans-serif";
    ctx.fillText("Aeon Drift", 858, 486);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(858, 540);
    ctx.lineTo(1220, 540);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(858, 540);
    ctx.lineTo(1050, 540);
    ctx.stroke();
    // climate strip
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = "500 21px 'DM Sans', sans-serif";
    ctx.fillText("CLIMATE", 858, 620);
    ctx.fillStyle = "#e6f1f0";
    ctx.font = "300 74px 'DM Sans', sans-serif";
    ctx.fillText("22°", 856, 706);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "400 22px 'DM Sans', sans-serif";
    ctx.fillText("AUTO", 1000, 690);
    ctx.fillText("SYNC", 1100, 690);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText("SEAT VENTILATION", 858, 764);
  });
}

export function makePassengerScreenTexture() {
  return canvasTexture(960, 620, (ctx, w, h) => {
    const accent = screenBase(ctx, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "500 22px 'DM Sans', sans-serif";
    ctx.fillText("PROFILE", 56, 66);
    ctx.fillStyle = "#eaf5f3";
    ctx.font = "300 64px 'DM Sans', sans-serif";
    ctx.fillText("Good evening", 56, 160);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = "400 24px 'DM Sans', sans-serif";
    ctx.fillText("Aarav", 56, 210);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 260);
    ctx.lineTo(904, 260);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = "500 20px 'DM Sans', sans-serif";
    ctx.fillText("YOUR XEV 9e", 56, 320);
    ctx.fillStyle = "#eaf5f3";
    ctx.font = "300 46px 'DM Sans', sans-serif";
    ctx.fillText("Tango Red", 56, 382);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = "400 24px 'DM Sans', sans-serif";
    ctx.fillText("79 kWh  •  RWD  •  656 km", 56, 430);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.roundRect(56, 480, 848, 90, 16);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = "500 24px 'DM Sans', sans-serif";
    ctx.fillText("Precondition cabin", 82, 535);
    ctx.fillStyle = accent;
    ctx.font = "500 21px 'DM Sans', sans-serif";
    ctx.fillText("SCHEDULE", 720, 535);
  });
}

/* -------------------------------------------------------------------------- */
/*  Tyre sidewall / tread normal                                              */
/* -------------------------------------------------------------------------- */

export function makeTyreNormal() {
  const size = 512;
  return canvasTexture(
    size,
    size,
    (ctx, w, h) => {
      ctx.fillStyle = "#8080ff";
      ctx.fillRect(0, 0, w, h);
      // lateral sipes
      for (let i = 0; i < 44; i++) {
        const x = (i / 44) * w;
        ctx.strokeStyle = "#6060ff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 20, h);
        ctx.stroke();
        ctx.strokeStyle = "#a060ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 8, 0);
        ctx.lineTo(x + 28, h);
        ctx.stroke();
      }
      // circumferential grooves
      for (let i = 1; i < 5; i++) {
        ctx.fillStyle = "#3030ff";
        ctx.fillRect(0, (i / 5) * h - 4, w, 8);
      }
    },
    { srgb: false }
  );
}

/* -------------------------------------------------------------------------- */
/*  Floor                                                                     */
/* -------------------------------------------------------------------------- */

export function makeFloorTexture() {
  return canvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = "#b6b5b1";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18000; i++) {
        const v = 0.5 + Math.random() * 0.5;
        ctx.fillStyle = `rgba(${Math.round(120 * v)},${Math.round(119 * v)},${Math.round(116 * v)},0.06)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      for (let i = 0; i < 24; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.035)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, 0);
        ctx.lineTo(Math.random() * w, h);
        ctx.stroke();
      }
    },
    { repeat: [3, 3] }
  );
}
