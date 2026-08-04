/**
 * Trodimenzionalni predmet u kupčevom prostoru — bez ijedne biblioteke.
 *
 * Uobičajen put je three.js: oko 600 kB koje telefon mora da preuzme pre nego
 * što išta vidi. Za nas to nema smisla iz dva razloga. Prvo, GLB koji ovde
 * učitavamo pravimo sami, pa mu znamo svaki bajt. Drugo — i važnije — predmet
 * treba da se pojavi DOK kupac skenira; svako preuzimanje u tom trenutku je
 * zastoj tačno tamo gde ga ne sme biti.
 *
 * Zato je ovde i čitač GLB-a i sam crtač, zajedno kraći od jedne slike.
 * Podržano je tačno ono što glTF traži za jedan predmet sa fotografijom kao
 * površinom: mreža, normale, koordinate slike, i jedna slika u istom fajlu.
 * Kad model ne odgovara tome — a to bi bio model sa tuđe grafičke kartice —
 * čitač uredno odustane i pozivalac vrati ravan izrezan predmet, koji već radi.
 */

/* ------------------------------------------------------------------ čitanje */

interface Part {
  pos: Float32Array;
  nrm: Float32Array | null;
  uv: Float32Array | null;
  idx: Uint32Array | Uint16Array;
}

export interface Model {
  parts: Part[];
  skin: HTMLImageElement | ImageBitmap | null;
  /** Središte i veličina okvira — po njima se predmet postavlja i meri. */
  centre: [number, number, number];
  size: [number, number, number];
}

const COMPONENT: Record<number, { array: any; bytes: number }> = {
  5120: { array: Int8Array, bytes: 1 },
  5121: { array: Uint8Array, bytes: 1 },
  5122: { array: Int16Array, bytes: 2 },
  5123: { array: Uint16Array, bytes: 2 },
  5125: { array: Uint32Array, bytes: 4 },
  5126: { array: Float32Array, bytes: 4 },
};

const PARTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Jedan niz brojeva iz GLB-a.
 *
 * `byteStride` postoji zato što glTF sme da isprepliće položaj, normalu i
 * koordinate slike u istom nizu. Naš pisač to ne radi, ali tuđi umeju, pa se
 * korak poštuje — bez toga bi takav model izašao kao klupko.
 */
function readAccessor(gltf: any, bin: ArrayBuffer, index: number): Float32Array | Uint32Array | null {
  const acc = gltf.accessors?.[index];
  if (!acc || acc.bufferView === undefined) return null;
  const view = gltf.bufferViews[acc.bufferView];
  const comp = COMPONENT[acc.componentType];
  const per = PARTS[acc.type];
  if (!comp || !per) return null;

  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? 0;
  const out = acc.componentType === 5126 ? new Float32Array(acc.count * per) : new Uint32Array(acc.count * per);

  if (!stride || stride === comp.bytes * per) {
    const src = new comp.array(bin, base, acc.count * per);
    out.set(src as any);
    return out;
  }
  for (let i = 0; i < acc.count; i++) {
    const src = new comp.array(bin, base + i * stride, per);
    out.set(src as any, i * per);
  }
  return out;
}

/**
 * Množenje 4×4 matrica, red po red. Treba samo ovde: čvorovi u glTF-u mogu da
 * nose sopstveni pomeraj i okret, pa se položaji odmah pri učitavanju prebace
 * u zajednički prostor. Posle toga crtač više ne mora ni da zna za čvorove.
 */
function mul(a: number[], b: number[]) {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  }
  return o;
}

function nodeMatrix(node: any): number[] {
  if (node.matrix) return node.matrix.slice();
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Učitaj GLB sa adrese. Vraća `null` kad fajl nije ono što očekujemo. */
export async function loadGlb(url: string): Promise<Model | null> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    buf = await res.arrayBuffer();
  } catch {
    return null;
  }
  try {
    return parseGlb(buf);
  } catch {
    return null;
  }
}

async function parseGlb(buf: ArrayBuffer): Promise<Model | null> {
  const dv = new DataView(buf);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return null;

  let at = 12;
  let gltf: any = null;
  let bin: ArrayBuffer | null = null;
  while (at + 8 <= dv.byteLength) {
    const len = dv.getUint32(at, true);
    const kind = dv.getUint32(at + 4, true);
    const body = buf.slice(at + 8, at + 8 + len);
    if (kind === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(body));
    else if (kind === 0x004e4942) bin = body;
    at += 8 + len + ((4 - ((at + 8 + len) % 4)) % 4);
  }
  if (!gltf || !bin) return null;

  // Čvorovi se obiđu jednom i njihov pomeraj se upiše u same položaje.
  const parts: Part[] = [];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots: number[] = scene?.nodes ?? gltf.nodes?.map((_: unknown, i: number) => i) ?? [];
  const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  const walk = (index: number, parent: number[]) => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const m = mul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = readAccessor(gltf, bin!, prim.attributes?.POSITION) as Float32Array | null;
        if (!pos) continue;
        const nrm = prim.attributes?.NORMAL !== undefined
          ? (readAccessor(gltf, bin!, prim.attributes.NORMAL) as Float32Array | null)
          : null;
        const uv = prim.attributes?.TEXCOORD_0 !== undefined
          ? (readAccessor(gltf, bin!, prim.attributes.TEXCOORD_0) as Float32Array | null)
          : null;
        const raw = prim.indices !== undefined ? readAccessor(gltf, bin!, prim.indices) : null;
        const idx = raw
          ? new Uint32Array(raw as any)
          : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);

        applyMatrix(pos, m);
        if (nrm) applyRotation(nrm, m);
        parts.push({ pos, nrm, uv, idx });
      }
    }
    for (const child of node.children ?? []) walk(child, m);
  };
  for (const r of roots) walk(r, ident);
  if (!parts.length) return null;

  // Slika je u istom fajlu (bufferView) ili kao data-adresa. Spoljne adrese
  // namerno ne pratimo: model mora da radi i kad je mreža loša.
  let skin: HTMLImageElement | ImageBitmap | null = null;
  const image = gltf.images?.[gltf.textures?.[0]?.source ?? 0];
  if (image) {
    let blob: Blob | null = null;
    if (image.bufferView !== undefined) {
      const v = gltf.bufferViews[image.bufferView];
      blob = new Blob([new Uint8Array(bin, v.byteOffset ?? 0, v.byteLength)], {
        type: image.mimeType ?? "image/png",
      });
    } else if (typeof image.uri === "string" && image.uri.startsWith("data:")) {
      blob = await (await fetch(image.uri)).blob();
    }
    if (blob) skin = await toImage(blob);
  }

  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < p.pos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p.pos[i + k] < lo[k]) lo[k] = p.pos[i + k];
        if (p.pos[i + k] > hi[k]) hi[k] = p.pos[i + k];
      }
    }
  }
  return {
    parts,
    skin,
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
  };
}

async function toImage(blob: Blob): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* stariji pregledač — ide preko <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((ok, no) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => no(new Error("slika modela"));
      el.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

function applyMatrix(v: Float32Array, m: number[]) {
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    v[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    v[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    v[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
}

function applyRotation(v: Float32Array, m: number[]) {
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    const nx = m[0] * x + m[4] * y + m[8] * z;
    const ny = m[1] * x + m[5] * y + m[9] * z;
    const nz = m[2] * x + m[6] * y + m[10] * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    v[i] = nx / len; v[i + 1] = ny / len; v[i + 2] = nz / len;
  }
}

/* ------------------------------------------------------------------ crtanje */

const VERT = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uRot;
varying vec3 vNrm;
varying vec2 vUv;
void main() {
  vNrm = normalize((uRot * vec4(aNrm, 0.0)).xyz);
  vUv = aUv;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

/**
 * Osvetljenje je namerno mirno: jedno glavno svetlo spreda-levo, pa nebo
 * odozgo i topao odsjaj poda odozdo. Fotografija proizvoda već nosi svoju
 * senku, pa jako svetlo ovde samo pravi dve senke na istom predmetu.
 */
const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform sampler2D uScene;
uniform bool uHasTex;
uniform bool uHasScene;
uniform vec2 uSize;
uniform float uPlaced;
uniform float uSlack;
uniform float uShade;
varying vec3 vNrm;
varying vec2 vUv;
void main() {
  vec4 base = uHasTex ? texture2D(uTex, vUv) : vec4(0.78, 0.76, 0.72, 1.0);
  if (base.a < 0.5) discard;

  // Šta je u sobi ISPRED predmeta, to predmet i zaklanja.
  //
  // Zazor nije ukras nego nužnost: pod tik ispred predmeta je uvek malo
  // bliži od njega samog, pa bi bez zazora predmet ostao bez nogu. Zaklanja
  // samo ono što je osetno bliže — fotelja, sto, dovratak.
  if (uHasScene) {
    vec2 look = vec2(gl_FragCoord.x / uSize.x, 1.0 - gl_FragCoord.y / uSize.y);
    if (texture2D(uScene, look).r > uPlaced + uSlack) discard;
  }

  vec3 n = normalize(vNrm);
  vec3 key = normalize(vec3(-0.35, 0.5, 0.8));
  float lit = max(dot(n, key), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(vec3(0.42, 0.40, 0.37), vec3(0.62, 0.63, 0.66), sky);
  vec3 colour = base.rgb * (ambient + 0.55 * lit);
  gl_FragColor = vec4(colour * uShade, 1.0);
}`;

export interface Placement {
  /** Središte predmeta na platnu, u CSS pikselima. */
  x: number;
  y: number;
  /** Koliko piksela ide na jednu jedinicu modela — odatle prava veličina. */
  scale: number;
  /** Okret oko uspravne ose i blagi nagib, u radijanima. */
  yaw: number;
  pitch: number;
  /** Zatamnjenje, da predmet ne bude svetliji od sobe u koju se stavlja. */
  shade: number;
  /**
   * Mapa dubine sobe iza predmeta, sivi bajtovi, i koliko je sam predmet
   * daleko (0–1, veće je bliže). Bez ovoga predmet stoji preko svega.
   */
  scene?: { grey: Uint8Array; w: number; h: number; placed: number; slack: number } | null;
}

/**
 * Platno na kome predmet stoji iznad fotografije ili iznad slike sa kamere.
 *
 * Projekcija je paralelna, ne perspektivna, i to namerno: predmet u sobi je
 * nekoliko metara daleko, pa mu se perspektiva jedva vidi, a paralelna
 * projekcija se ne svađa sa perspektivom same fotografije ispod. Nagib zida
 * koji je već procenjen iz slike ulazi kao okret predmeta, pa predmet stoji
 * po istom uglu kao zid.
 */
export class Stage {
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex = new WeakMap<object, WebGLTexture>();
  private sceneTex: WebGLTexture | null = null;
  private sceneKey: Uint8Array | null = null;
  private bufs = new WeakMap<object, { pos: WebGLBuffer; nrm: WebGLBuffer; uv: WebGLBuffer; idx: WebGLBuffer }[]>();
  private loc: Record<string, any> = {};
  private wide = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    // `preserveDrawingBuffer` nije sitnica: predmet se crta samo kad se
    // nešto promeni, a bez ovoga pregledač sme da obriše platno čim ga
    // jednom prikaže — predmet bi tada nestao iz sobe sam od sebe.
    const opts = {
      alpha: true, antialias: true, premultipliedAlpha: true,
      depth: true, preserveDrawingBuffer: true,
    };
    const gl = (canvas.getContext("webgl2", opts) ??
      canvas.getContext("webgl", opts)) as WebGLRenderingContext | null;
    if (!gl) return;
    this.gl = gl;
    // Naša mreža ume da pređe 65 536 tačaka, pa treba veliki brojač uglova.
    // WebGL 2 ga ima uvek, WebGL 1 samo uz dodatak; bez njega se crtaju
    // sitniji delovi i model i dalje izgleda kako treba.
    this.wide = "drawBuffers" in gl || !!gl.getExtension("OES_element_index_uint");

    const prog = gl.createProgram()!;
    for (const [kind, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
      const sh = gl.createShader(kind)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        this.gl = null;
        return;
      }
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.gl = null;
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);
    this.loc = {
      aPos: gl.getAttribLocation(prog, "aPos"),
      aNrm: gl.getAttribLocation(prog, "aNrm"),
      aUv: gl.getAttribLocation(prog, "aUv"),
      uMvp: gl.getUniformLocation(prog, "uMvp"),
      uRot: gl.getUniformLocation(prog, "uRot"),
      uTex: gl.getUniformLocation(prog, "uTex"),
      uScene: gl.getUniformLocation(prog, "uScene"),
      uHasTex: gl.getUniformLocation(prog, "uHasTex"),
      uHasScene: gl.getUniformLocation(prog, "uHasScene"),
      uSize: gl.getUniformLocation(prog, "uSize"),
      uPlaced: gl.getUniformLocation(prog, "uPlaced"),
      uSlack: gl.getUniformLocation(prog, "uSlack"),
      uShade: gl.getUniformLocation(prog, "uShade"),
    };
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  }

  get ok() {
    return !!this.gl;
  }

  /** Uskladi platno sa svojom veličinom na ekranu. Vraća CSS mere. */
  resize() {
    const gl = this.gl;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl?.viewport(0, 0, w, h);
    return { width: r.width || 1, height: r.height || 1, dpr };
  }

  clear() {
    const gl = this.gl;
    if (!gl) return;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  draw(model: Model, at: Placement) {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const { width, height } = this.resize();
    gl.useProgram(this.prog);

    const cy = Math.cos(at.yaw), sy = Math.sin(at.yaw);
    const cp = Math.cos(at.pitch), sp = Math.sin(at.pitch);
    // Okret oko uspravne ose, pa blagi nagib. Isti okret ide i na normale.
    const rot = [
      cy, sp * sy, -cp * sy, 0,
      0, cp, sp, 0,
      sy, -sp * cy, cp * cy, 0,
      0, 0, 0, 1,
    ];

    // Model → pikseli platna → prostor slike. Y se okreće jer ekran raste
    // nadole, a dubina ostaje u opsegu koji nijedan predmet ne prelazi.
    const s = at.scale;
    const [ox, oy, oz] = model.centre;
    const place = mul(
      [s, 0, 0, 0, 0, -s, 0, 0, 0, 0, s, 0, at.x, at.y, 0, 1],
      mul(rot, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -ox, -oy, -oz, 1]),
    );
    const depth = Math.max(1, s * Math.max(...model.size)) * 4;
    const ortho = [
      2 / width, 0, 0, 0,
      0, -2 / height, 0, 0,
      0, 0, -1 / depth, 0,
      -1, 1, 0, 1,
    ];
    gl.uniformMatrix4fv(this.loc.uMvp, false, new Float32Array(mul(ortho, place)));
    gl.uniformMatrix4fv(this.loc.uRot, false, new Float32Array(rot));
    gl.uniform1f(this.loc.uShade, at.shade);

    const skin = model.skin ? this.texture(model.skin) : null;
    gl.uniform1i(this.loc.uHasTex, skin ? 1 : 0);
    if (skin) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skin);
      gl.uniform1i(this.loc.uTex, 0);
    }

    const room = at.scene ? this.depth(at.scene) : null;
    gl.uniform1i(this.loc.uHasScene, room ? 1 : 0);
    gl.uniform2f(this.loc.uSize, this.canvas.width, this.canvas.height);
    if (room) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, room);
      gl.uniform1i(this.loc.uScene, 1);
      gl.uniform1f(this.loc.uPlaced, at.scene!.placed);
      gl.uniform1f(this.loc.uSlack, at.scene!.slack);
    }

    for (const [i, part] of model.parts.entries()) {
      const b = this.buffers(model)[i];
      bind(gl, b.pos, this.loc.aPos, 3);
      bind(gl, part.nrm ? b.nrm : b.pos, this.loc.aNrm, 3);
      bind(gl, part.uv ? b.uv : b.pos, this.loc.aUv, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      const big = part.idx instanceof Uint32Array && this.wide;
      gl.drawElements(gl.TRIANGLES, part.idx.length, big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    }
  }

  /** Oslobodi grafičku memoriju kad se prikaz zatvori. */
  dispose() {
    const gl = this.gl as any;
    gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    this.gl = null;
  }

  /**
   * Mapa dubine kao tekstura.
   *
   * Ista mapa važi dok se soba ne promeni, pa se šalje karti samo kad je
   * zaista nova — poređenje po nizu, ne po sadržaju, jer je niz isti objekat
   * dok god je ista fotografija.
   */
  private depth(scene: { grey: Uint8Array; w: number; h: number }) {
    const gl = this.gl!;
    if (this.sceneTex && this.sceneKey === scene.grey) return this.sceneTex;
    if (!this.sceneTex) this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, scene.w, scene.h, 0,
                  gl.LUMINANCE, gl.UNSIGNED_BYTE, scene.grey);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.sceneKey = scene.grey;
    return this.sceneTex;
  }

  private buffers(model: Model) {
    const gl = this.gl!;
    let list = this.bufs.get(model);
    if (list) return list;
    list = model.parts.map((p) => {
      const make = (data: ArrayBufferView, target: number) => {
        const b = gl.createBuffer()!;
        gl.bindBuffer(target, b);
        gl.bufferData(target, data as any, gl.STATIC_DRAW);
        return b;
      };
      const idx = this.wide || !(p.idx instanceof Uint32Array)
        ? p.idx
        : new Uint16Array(p.idx.length).map((_, i) => p.idx[i] & 0xffff);
      return {
        pos: make(p.pos, gl.ARRAY_BUFFER),
        nrm: make(p.nrm ?? p.pos, gl.ARRAY_BUFFER),
        uv: make(p.uv ?? new Float32Array((p.pos.length / 3) * 2), gl.ARRAY_BUFFER),
        idx: make(idx, gl.ELEMENT_ARRAY_BUFFER),
      };
    });
    this.bufs.set(model, list);
    return list;
  }

  private texture(img: HTMLImageElement | ImageBitmap) {
    const gl = this.gl!;
    let t = this.tex.get(img);
    if (t) return t;
    t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img as any);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Sitne slike bez međunivoa trepere kad je predmet mali na ekranu.
    // WebGL 2 ih pravi za svaku veličinu; WebGL 1 samo za stepen dvojke.
    const two = (n: number) => (n & (n - 1)) === 0;
    const w = (img as any).width, h = (img as any).height;
    if ("drawBuffers" in gl || (two(w) && two(h))) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.tex.set(img, t);
    return t;
  }
}

function bind(gl: WebGLRenderingContext, buf: WebGLBuffer, loc: number, size: number) {
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}
