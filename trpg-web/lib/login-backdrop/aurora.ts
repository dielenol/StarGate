/**
 * 로그인 배경의 분산광 오로라 레이어.
 * 로고의 프리즘이 흩뿌린 빛이 화면 좌상단 광원에서 우하단으로 흘러가는 모습을
 * 프래그먼트 셰이더 한 장으로 그린다. 출력은 premultiplied alpha 이므로 CSS 배경 위에
 * 그대로 합성되고, 테마는 uDark 유니폼으로 전환한다.
 */

const VERTEX_SHADER = `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uDark;
uniform float uAngle;

const vec3 SPECTRUM_0 = vec3(0.910, 0.012, 0.012);
const vec3 SPECTRUM_1 = vec3(0.953, 0.565, 0.055);
const vec3 SPECTRUM_2 = vec3(0.886, 0.973, 0.267);
const vec3 SPECTRUM_3 = vec3(0.400, 1.000, 0.180);
const vec3 SPECTRUM_4 = vec3(0.082, 0.110, 0.914);
const vec3 SPECTRUM_5 = vec3(0.525, 0.059, 0.941);
const vec3 SPECTRUM_6 = vec3(0.922, 0.000, 0.965);

vec3 spectrum(float t) {
  float s = clamp(t, 0.0, 1.0) * 6.0;
  vec3 color = SPECTRUM_0;
  color = mix(color, SPECTRUM_1, clamp(s, 0.0, 1.0));
  color = mix(color, SPECTRUM_2, clamp(s - 1.0, 0.0, 1.0));
  color = mix(color, SPECTRUM_3, clamp(s - 2.0, 0.0, 1.0));
  color = mix(color, SPECTRUM_4, clamp(s - 3.0, 0.0, 1.0));
  color = mix(color, SPECTRUM_5, clamp(s - 4.0, 0.0, 1.0));
  color = mix(color, SPECTRUM_6, clamp(s - 5.0, 0.0, 1.0));
  return color;
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float gradientNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 fade = local * local * (3.0 - 2.0 * local);
  float a = dot(hash2(cell), local);
  float b = dot(hash2(cell + vec2(1.0, 0.0)), local - vec2(1.0, 0.0));
  float c = dot(hash2(cell + vec2(0.0, 1.0)), local - vec2(0.0, 1.0));
  float d = dot(hash2(cell + vec2(1.0, 1.0)), local - vec2(1.0, 1.0));
  return mix(mix(a, b, fade.x), mix(c, d, fade.x), fade.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotateScale = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    value += amplitude * gradientNoise(p);
    p = rotateScale * p;
    amplitude *= 0.5;
  }
  return value;
}

// 띠 하나: rgb 는 straight color, a 는 세기(0~1).
vec4 ribbon(vec2 p, float t, float offset, float width, float speed, float seed) {
  vec2 drift = vec2(t * 0.085 * speed, 0.0);
  vec2 warp = vec2(
    fbm(p * 1.0 - drift + seed),
    fbm(p * 1.0 - drift * 0.6 + vec2(4.1, 2.3) + seed)
  );
  vec2 w = p + 0.3 * warp;
  float band = w.y - offset + 0.12 * sin(w.x * 1.7 - t * 0.25 * speed + seed);
  float envelope = exp(-pow(band * width, 2.0));
  float filaments = 0.5 + 0.5 * smoothstep(-0.2, 0.45, fbm(w * 2.2 + vec2(-t * 0.14 * speed, t * 0.03)));
  // 띠를 가로지르는 미세한 줄무늬로 분광 스펙트럼의 결을 암시한다.
  float stripes = 0.92 + 0.08 * sin(band * width * 9.0 + seed);
  // 광원에서 출발해 띠를 따라 흘러가는 밝은 광파.
  float wavePhase = fract(w.x * 0.22 - t * 0.05 * speed + seed * 0.1) - 0.5;
  float wave = exp(-wavePhase * wavePhase * 40.0);
  float pulse = 0.8 + 0.2 * sin(w.x * 1.6 - t * 0.6 * speed + seed) + 0.6 * wave;
  vec3 color = spectrum(0.5 - band * width * 0.42);
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, vec3(luma), 0.1);
  return vec4(color, envelope * filaments * stripes * pulse);
}

vec4 composite(vec4 under, vec4 over, float strength) {
  // 광파가 겹치는 순간 세기가 1 을 넘을 수 있으므로 premultiplied 합성 전에 잘라 둔다.
  float alpha = clamp(over.a * strength, 0.0, 1.0);
  return under * (1.0 - alpha) + vec4(over.rgb * alpha, alpha);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  // 세로 화면에서는 패널이 중앙을 가리므로 띠를 넓고 멀리 벌려 위아래로 드러낸다.
  float portrait = smoothstep(1.25, 0.6, aspect);
  float widthScale = mix(1.0, 0.72, portrait);
  float spread = mix(1.0, 1.5, portrait);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 p = mat2(ca, -sa, sa, ca) * uv;
  float t = uTime;

  vec4 back = ribbon(p, t, -0.42 * spread, 4.6 * widthScale, 1.15, 13.0);
  vec4 mid = ribbon(p, t, 0.36 * spread, 4.0 * widthScale, 0.85, 7.0);
  vec4 front = ribbon(p, t, 0.04, 3.6 * widthScale, 1.0, 0.0);

  // 라이트 테마는 파스텔 톤으로 종이 위에 비치는 느낌을 낸다.
  float pastel = 0.34 * (1.0 - uDark);
  back.rgb = mix(back.rgb, vec3(1.0), pastel);
  mid.rgb = mix(mid.rgb, vec3(1.0), pastel);
  front.rgb = mix(front.rgb, vec3(1.0), pastel);

  float master = mix(0.8, 1.0, uDark);
  vec4 acc = vec4(0.0);
  acc = composite(acc, back, 0.2 * master);
  acc = composite(acc, mid, 0.26 * master);
  acc = composite(acc, front, 0.68 * master * mix(1.0, 1.15, portrait));

  // 좌상단 광원: 빛이 들어오는 곳 근처에서는 띠가 하얗게 바래고, 다크 테마에선 광원이 빛난다.
  // 세로 화면은 광원이 콘텐츠와 가까워지므로 더 밖으로 밀고 바램도 줄인다.
  vec2 source = vec2(-0.5 * aspect - 0.2 * portrait, 0.42 + 0.15 * portrait);
  float sourceDistance = length(uv - source);
  float whiten = exp(-sourceDistance * 1.5);
  acc.rgb = mix(acc.rgb, vec3(acc.a), whiten * mix(0.55, 0.25, portrait));

  float glow = exp(-sourceDistance * 2.2) * (0.9 + 0.1 * sin(t * 0.7));
  float glowAlpha = glow * mix(0.42, 0.3, portrait) * uDark;
  acc = acc * (1.0 - glowAlpha) + vec4(vec3(0.84, 0.91, 1.0) * glowAlpha, glowAlpha);

  gl_FragColor = acc;
}
`;

export interface AuroraRenderer {
  resize(width: number, height: number): void;
  render(time: number, dark: boolean): void;
  destroy(): void;
}

interface CreateAuroraRendererOptions {
  /** GPU 컨텍스트를 잃었을 때 호출된다. 호출 측은 CSS 폴백으로 전환한다. */
  onContextLost?: () => void;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (program) gl.deleteProgram(program);
    return null;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function createAuroraRenderer(
  canvas: HTMLCanvasElement,
  { onContextLost }: CreateAuroraRendererOptions = {},
): AuroraRenderer | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;

  const program = createProgram(gl);
  if (!program) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // 화면 전체를 덮는 삼각형 하나로 충분하다.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  gl.useProgram(program);
  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uDark = gl.getUniformLocation(program, "uDark");
  const uAngle = gl.getUniformLocation(program, "uAngle");

  // 복구를 시도하지 않고 CSS 폴백으로 넘기므로 preventDefault 는 호출하지 않는다.
  const handleContextLost = () => {
    onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", handleContextLost);

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uResolution, width, height);
      // 띠는 화면 대각선을 따라 흐른다. 세로 화면일수록 가파르게 기울인다.
      gl.uniform1f(uAngle, -Math.atan2(height, width) * 0.85);
    },
    render(time, dark) {
      if (gl.isContextLost()) return;
      gl.uniform1f(uTime, time);
      gl.uniform1f(uDark, dark ? 1 : 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      if (gl.isContextLost()) return;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      // 같은 캔버스에 다시 붙을 수 있도록(StrictMode 의 이중 마운트 등) 컨텍스트는 잃게 하지 않는다.
    },
  };
}
