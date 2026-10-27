import * as THREE from 'three';

/**
 * Kit para construir juguetes: geometrías y materiales compartidos (en caché) y texturas pintadas por código.
 * Las caras se pintan centradas en la textura: en una esfera ese centro queda mirando hacia +x (de frente).
 */
const cache = new Map();
const cached = (key, create) => {
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key);
};

// --- Geometrías ---------------------------------------------------------

export const G = {
  sphere: (r, w = 22, h = 16) => cached(`sphere:${r}:${w}`, () => new THREE.SphereGeometry(r, w, h)),
  hemi: (r) => cached(`hemi:${r}`, () => new THREE.SphereGeometry(r, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
  box: (w, h, d) => cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt, rb, h, seg = 18) => cached(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  capsule: (r, len) => cached(`capsule:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 16)),
  cone: (r, h, seg = 18) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r, t) => cached(`torus:${r}:${t}`, () => new THREE.TorusGeometry(r, t, 10, 24)),
  star: (r) => cached(`star:${r}`, () => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // de cara a +x
    return g;
  }),
};

// --- Materiales -----------------------------------------------------------

const material = (kind, color, map, extra) => cached(`${kind}:${color}:${map?.uuid ?? ''}`, () => new THREE.MeshStandardMaterial({ color, map: map ?? null, ...extra }));

export const M = {
  plastic: (color, map) => material('plastic', color, map, { roughness: 0.4, metalness: 0.05 }),
  matte: (color, map) => material('matte', color, map, { roughness: 0.85 }),
  rubber: (color, map) => material('rubber', color, map, { roughness: 0.65 }),
  metal: (color, map) => material('metal', color, map, { roughness: 0.35, metalness: 0.35 }), // poco metálico: sin reflejos alrededor, el metal puro sale casi negro
  fabric: (color, map) => material('fabric', color, map, { roughness: 1 }),
  glass: (color) => cached(`glass:${color}`, () => new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false })),
  glow: (color) => cached(`glow:${color}`, () => new THREE.MeshBasicMaterial({ color })),
};

// --- Texturas -------------------------------------------------------------

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

function texture(key, width, height, paint) {
  return cached(`tex:${key}`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
}

/** Pseudoaleatorio fijo para que las texturas salgan siempre iguales. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cara pintada (256×128). Opciones: skin, eyes ('dots'|'lashes'|'angry'|'happy'|'led'|'goggle'|'reptile'),
 * eyeColor, mouth ('smile'|'lips'|'grin'|'flat'|'grille'|'teeth'|'none'), blush, stubble, beard, patch, scar, brows.
 */
export function faceTexture(opts) {
  const o = { skin: 0xf2c9a0, eyes: 'dots', eyeColor: 0x2a1d14, mouth: 'smile', ...opts };
  return texture(`face:${JSON.stringify(o)}`, 256, 128, (g, w, h) => {
    const cx = w / 2;
    g.fillStyle = css(o.skin);
    g.fillRect(0, 0, w, h);
    if (o.stubble) {
      const rnd = seeded(7);
      g.fillStyle = 'rgba(40, 30, 25, 0.35)';
      for (let i = 0; i < 260; i++) g.fillRect(cx - 34 + rnd() * 68, 74 + rnd() * 26, 1.5, 1.5);
    }
    if (o.beard) {
      g.fillStyle = css(o.beard);
      g.beginPath();
      g.moveTo(cx - 40, 66);
      g.quadraticCurveTo(cx - 44, 118, cx, 124);
      g.quadraticCurveTo(cx + 44, 118, cx + 40, 66);
      g.quadraticCurveTo(cx, 90, cx - 40, 66);
      g.fill();
    }
    if (o.blush) {
      g.fillStyle = 'rgba(255, 110, 130, 0.45)';
      for (const dx of [-30, 30]) { g.beginPath(); g.ellipse(cx + dx, 74, 9, 6, 0, 0, Math.PI * 2); g.fill(); }
    }
    const eye = (dx) => {
      const x = cx + dx;
      const y = 56;
      g.fillStyle = css(o.eyeColor);
      switch (o.eyes) {
        case 'lashes':
          g.fillStyle = '#fff';
          g.beginPath(); g.ellipse(x, y, 8, 9, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = css(o.eyeColor === 0x2a1d14 ? 0x2f7fd8 : o.eyeColor);
          g.beginPath(); g.arc(x, y + 1, 5, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#1b1b1b'; g.lineWidth = 2.5;
          for (const a of [-0.9, -0.5, -0.1]) { g.beginPath(); g.moveTo(x + Math.cos(a - Math.PI / 2) * 8 * Math.sign(dx || 1), y - 8); g.lineTo(x + Math.sin(a) * 12 * Math.sign(dx || 1), y - 14); g.stroke(); }
          break;
        case 'angry':
          g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#2a1d14'; g.lineWidth = 5;
          g.beginPath(); g.moveTo(x - 9 * Math.sign(dx), y - 15); g.lineTo(x + 8 * Math.sign(dx), y - 9); g.stroke();
          break;
        case 'happy':
          g.strokeStyle = css(o.eyeColor); g.lineWidth = 4;
          g.beginPath(); g.arc(x, y + 3, 6, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
          break;
        case 'led':
          g.fillStyle = '#0d0d0d'; g.fillRect(x - 10, y - 8, 20, 16);
          g.fillStyle = css(o.eyeColor); g.shadowColor = css(o.eyeColor); g.shadowBlur = 10;
          g.fillRect(x - 7, y - 5, 14, 10); g.shadowBlur = 0;
          break;
        case 'reptile':
          g.fillStyle = css(0xffd23f); g.beginPath(); g.ellipse(x, y, 8, 7, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#111'; g.fillRect(x - 1.5, y - 6, 3, 12);
          break;
        default:
          g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 1.5, y - 1.5, 1.6, 0, Math.PI * 2); g.fill();
      }
      if (o.brows) {
        g.strokeStyle = css(o.brows); g.lineWidth = 4;
        g.beginPath(); g.moveTo(x - 8, y - 13); g.lineTo(x + 8, y - 14); g.stroke();
      }
    };
    if (o.eyes === 'goggle') {
      // Un solo ojo grande (el cristal de las gafas va aparte, en 3D).
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 52, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = css(0x7a4a24); g.beginPath(); g.arc(cx + 2, 54, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(cx + 2, 54, 4.5, 0, Math.PI * 2); g.fill();
    } else {
      eye(-22);
      if (o.patch) {
        g.fillStyle = '#111'; g.beginPath(); g.ellipse(cx + 22, 56, 11, 10, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 60, 36); g.lineTo(cx + 70, 66); g.stroke();
      } else eye(22);
    }
    if (o.scar) {
      g.strokeStyle = 'rgba(150, 60, 50, 0.8)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx - 32, 44); g.lineTo(cx - 18, 70); g.stroke();
    }
    g.strokeStyle = '#4a1f1a';
    g.fillStyle = '#4a1f1a';
    switch (o.mouth) {
      case 'smile': g.lineWidth = 4; g.beginPath(); g.arc(cx, 72, 13, Math.PI * 0.15, Math.PI * 0.85); g.stroke(); break;
      case 'grin': g.beginPath(); g.arc(cx, 76, 13, 0, Math.PI); g.fill(); g.fillStyle = '#fff'; g.fillRect(cx - 10, 76, 20, 4); break;
      case 'lips': g.fillStyle = css(0xd62d6b); g.beginPath(); g.ellipse(cx, 82, 9, 5, 0, 0, Math.PI * 2); g.fill(); break;
      case 'flat': g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 10, 84); g.lineTo(cx + 10, 82); g.stroke(); break;
      case 'grille': g.fillStyle = '#1b1b1b'; g.fillRect(cx - 18, 78, 36, 14); g.fillStyle = '#888'; for (let i = 0; i < 5; i++) g.fillRect(cx - 16 + i * 7.5, 80, 3, 10); break;
      case 'teeth': g.fillStyle = '#3a0d0d'; g.fillRect(cx - 30, 76, 60, 12); g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(cx - 30 + i * 7.5, 76); g.lineTo(cx - 26 + i * 7.5, 84); g.lineTo(cx - 22 + i * 7.5, 76); g.fill(); } break;
      default: break;
    }
  });
}

export function camoTexture(colors) {
  return texture(`camo:${colors}`, 256, 256, (g, w, h) => {
    const rnd = seeded(11);
    g.fillStyle = css(colors[0]); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = css(colors[1 + (i % (colors.length - 1))]);
      g.beginPath();
      const x = rnd() * w; const y = rnd() * h;
      g.ellipse(x, y, 10 + rnd() * 26, 6 + rnd() * 16, rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function stripesTexture(a, b, count = 8, vertical = false) {
  return texture(`stripes:${a}:${b}:${count}:${vertical}`, 128, 128, (g, w, h) => {
    const size = (vertical ? w : h) / count;
    for (let i = 0; i < count; i++) {
      g.fillStyle = css(i % 2 ? b : a);
      if (vertical) g.fillRect(i * size, 0, size, h); else g.fillRect(0, i * size, w, size);
    }
  });
}

export function checkerTexture(a, b, count = 8) {
  return texture(`checker:${a}:${b}:${count}`, 128, 128, (g, w) => {
    const s = w / count;
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
      g.fillStyle = css((x + y) % 2 ? a : b); g.fillRect(x * s, y * s, s, s);
    }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < count; i++) { g.fillRect(i * s + s / 2 - 1, 0, 2, w); g.fillRect(0, i * s + s / 2 - 1, w, 2); }
  });
}

export function dotsTexture(base, dot) {
  return texture(`dots:${base}:${dot}`, 128, 128, (g, w, h) => {
    g.fillStyle = css(base); g.fillRect(0, 0, w, h);
    g.fillStyle = css(dot);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      g.beginPath(); g.arc(x * 22 + (y % 2) * 11 + 6, y * 22 + 8, 4.5, 0, Math.PI * 2); g.fill();
    }
  });
}

export function denimTexture(base = 0x3b5ba5) {
  return texture(`denim:${base}`, 128, 128, (g, w, h) => {
    g.fillStyle = css(base); g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    for (let i = -h; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.strokeStyle = 'rgba(255, 200, 90, 0.8)'; g.setLineDash([4, 3]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(8, 0); g.lineTo(8, h); g.moveTo(w - 8, 0); g.lineTo(w - 8, h); g.stroke();
  });
}

export function furTexture(base, tip) {
  return texture(`fur:${base}:${tip}`, 256, 256, (g, w, h) => {
    const rnd = seeded(5);
    g.fillStyle = css(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.strokeStyle = rnd() < 0.5 ? css(tip) : 'rgba(0,0,0,0.25)';
      g.lineWidth = 1.2;
      const x = rnd() * w; const y = rnd() * h; const a = rnd() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke();
    }
  });
}

export function metalTexture(base) {
  return texture(`metal:${base}`, 128, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, css(base)); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, css(base));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.85; g.fillStyle = css(base); g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    g.strokeRect(4, 4, w - 8, h - 8); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10], [10, h / 2 - 8], [w - 10, h / 2 - 8]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  });
}

export function scalesTexture(base, spot) {
  return texture(`scales:${base}:${spot}`, 128, 128, (g, w, h) => {
    g.fillStyle = css(base); g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5;
    for (let y = 0; y < h + 10; y += 10) for (let x = 0; x < w + 10; x += 12) {
      g.beginPath(); g.arc(x + ((y / 10) % 2) * 6, y, 6, 0, Math.PI); g.stroke();
    }
    const rnd = seeded(3);
    g.fillStyle = css(spot);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 3 + rnd() * 5, 0, Math.PI * 2); g.fill(); }
  });
}

/** Frontal con dibujo (panel de botones, cruz, etc.): una franja centrada que en un cilindro o esfera queda delante. */
export function panelTexture(kind, base) {
  return texture(`panel:${kind}:${base}`, 256, 128, (g, w, h) => {
    const cx = w / 2;
    g.fillStyle = css(base); g.fillRect(0, 0, w, h);
    if (kind === 'space') {
      g.fillStyle = css(0x37b34a); g.fillRect(cx - 30, 22, 60, 64);
      g.fillStyle = css(0x7b3fb5); g.fillRect(cx - 34, 18, 68, 6);
      for (const [x, y, c] of [[-14, 40, 0xe63946], [0, 40, 0x1d7cf2], [14, 40, 0xf4b400], [-7, 62, 0xffffff], [7, 62, 0xffffff]]) {
        g.fillStyle = css(c); g.beginPath(); g.arc(cx + x, y, 5.5, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'robot') {
      g.fillStyle = '#222'; g.fillRect(cx - 34, 20, 68, 56);
      for (const [x, c] of [[-18, 0xff3b30], [0, 0x34c759], [18, 0x0a84ff]]) { g.fillStyle = css(c); g.beginPath(); g.arc(cx + x, 36, 6, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#9aa'; g.lineWidth = 3; g.beginPath(); g.arc(cx, 62, 9, Math.PI, Math.PI * 2.7); g.stroke();
    } else if (kind === 'cross') {
      g.fillStyle = css(0xd7263d); g.fillRect(cx - 34, 0, 68, h);
      g.fillStyle = css(0xf4d35e); g.fillRect(cx - 6, 18, 12, 70); g.fillRect(cx - 24, 36, 48, 12);
    } else if (kind === 'overalls') {
      g.fillStyle = css(0x3b5ba5); g.fillRect(cx - 40, 56, 80, 72);
      g.fillStyle = css(0x2a3f78); g.fillRect(cx - 18, 70, 36, 22);
      g.fillStyle = '#111'; for (const x of [-30, 30]) { g.beginPath(); g.arc(cx + x, 60, 4, 0, Math.PI * 2); g.fill(); }
    }
  });
}

export const FRONT_FACING_ROTATION = { cylinder: -Math.PI / 2 }; // cilindros y cápsulas: el centro de la textura mira a -z
