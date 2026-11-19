// Шейдеры постобработки (GLSL ES 3.0 через ShaderMaterial three: texture2D/gl_FragColor работают, texelFetch тоже).

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// линейная глубина из буфера глубины перспективной камеры
const LIN_DEPTH = /* glsl */ `
uniform float uNear;
uniform float uFar;
float linDepth(float d) {
	return (uNear * uFar) / (uFar - d * (uFar - uNear));
}
`;

// размер кружка рассеяния (пиксели целевого буфера) для глубины z
const COC = /* glsl */ `
uniform float uFocus;
uniform float uRange;
uniform float uBlur;
uniform float uNearBlur;
float coc(float z) {
	float d = max(0.0, abs(z - uFocus) - uRange * 0.5) / max(z, 0.05);
	return uBlur * min(1.0, d) * (z < uFocus ? uNearBlur : 1.0);
}
`;

// 1. Полный кадр -> половина: цвет + линейная глубина (самая дальняя из 2x2).
// Пиксели переднего плана на границе отбрасываются — фон за силуэтом размывается без ореола.
export const DOF_DOWN = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSrcSize;
${LIN_DEPTH}
varying vec2 vUv;
void main() {
	ivec2 p = ivec2(gl_FragCoord.xy) * 2;
	ivec2 mx = ivec2(uSrcSize) - 1;
	ivec2 p0 = min(p, mx);
	ivec2 p1 = min(p + ivec2(1, 0), mx);
	ivec2 p2 = min(p + ivec2(0, 1), mx);
	ivec2 p3 = min(p + ivec2(1, 1), mx);
	float z0 = linDepth(texelFetch(tDepth, p0, 0).r);
	float z1 = linDepth(texelFetch(tDepth, p1, 0).r);
	float z2 = linDepth(texelFetch(tDepth, p2, 0).r);
	float z3 = linDepth(texelFetch(tDepth, p3, 0).r);
	float zf = max(max(z0, z1), max(z2, z3));
	float tol = zf * 0.08 + 0.02;
	float w0 = step(zf - z0, tol);
	float w1 = step(zf - z1, tol);
	float w2 = step(zf - z2, tol);
	float w3 = step(zf - z3, tol);
	vec3 c = texelFetch(tColor, p0, 0).rgb * w0 + texelFetch(tColor, p1, 0).rgb * w1 + texelFetch(tColor, p2, 0).rgb * w2 + texelFetch(tColor, p3, 0).rgb * w3;
	gl_FragColor = vec4(c / max(1.0, w0 + w1 + w2 + w3), zf);
}
`;

// 1б. Передний план: максимум кружка рассеяния ближних (z < фокуса) пикселей в плитке 8x8 половинного буфера
export const DOF_TILE = /* glsl */ `
uniform sampler2D tHalf;
uniform vec2 uHalfSize;
${COC}
varying vec2 vUv;
void main() {
	ivec2 b = ivec2(gl_FragCoord.xy) * 8;
	ivec2 mx = ivec2(uHalfSize) - 1;
	float m = 0.0;
	for (int y = 0; y < 8; y++) {
		for (int x = 0; x < 8; x++) {
			float z = texelFetch(tHalf, min(b + ivec2(x, y), mx), 0).a;
			if (z < uFocus) m = max(m, coc(z));
		}
	}
	gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
}
`;

// 1в. Расширение плиток на соседей (3x3): размытый передний план «наплывает» на резкий фон
export const DOF_DILATE = /* glsl */ `
uniform sampler2D tTile;
uniform vec2 uTileSize;
varying vec2 vUv;
void main() {
	ivec2 p = ivec2(gl_FragCoord.xy);
	ivec2 mx = ivec2(uTileSize) - 1;
	float m = 0.0;
	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			m = max(m, texelFetch(tTile, clamp(p + ivec2(x, y), ivec2(0), mx), 0).r);
		}
	}
	gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
}
`;

// 2. Размытие на половинном разрешении: «рассеяние через сбор» по золотой спирали.
// Образец участвует, только если его собственный кружок дотягивается до центра; дальние
// образцы не налезают на ближние (резкий герой не размывается фоном, фон не тянет героя).
export const DOF_GATHER = /* glsl */ `
uniform sampler2D tHalf;
uniform sampler2D tNear;
uniform vec2 uHalfSize;
${COC}
varying vec2 vUv;
#define TAPS 20
void main() {
	vec4 c0 = texture2D(tHalf, vUv);
	float z0 = c0.a;
	float r0 = coc(z0);
	// радиус сбора: свой кружок или наплыв переднего плана из соседних плиток
	float R = max(r0, texture2D(tNear, vUv).r);
	if (R < 0.4) {
		gl_FragColor = c0;
		return;
	}
	vec3 acc = c0.rgb;
	float tot = 1.0;
	// поворот спирали от положения пикселя (без времени): шум вместо «копий»
	float a0 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
	for (int i = 0; i < TAPS; i++) {
		float fi = float(i) + 0.5;
		float rr = R * sqrt(fi / float(TAPS));
		float a = a0 + fi * 2.3999632;
		vec4 s = texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * rr / uHalfSize);
		float sr = coc(s.a);
		if (s.a > z0) sr = min(sr, r0 * 2.0);
		float m = smoothstep(rr - 0.5, rr + 0.5, sr);
		acc += mix(acc / tot, s.rgb, m);
		tot += 1.0;
	}
	gl_FragColor = vec4(acc / tot, z0);
}
`;

// Свечение: выделение ярких мест (половина разрешения, мягкое колено)
export const BLOOM_PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
	vec3 c = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
	c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
	c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
	c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
	c *= 0.25;
	float br = max(c.r, max(c.g, c.b));
	float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
	rq = rq * rq / (4.0 * uKnee + 1e-4);
	float w = max(rq, br - uThreshold) / max(br, 1e-4);
	gl_FragColor = vec4(c * w, 1.0);
}
`;

// Свечение: уменьшение (двойной фильтр Кавасе)
export const BLOOM_DOWN = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
	vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
	c += texture2D(tSrc, vUv - uTexel).rgb;
	c += texture2D(tSrc, vUv + uTexel).rgb;
	c += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
	c += texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
	gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

// Свечение: увеличение с подмешиванием своего уровня (uSpread — доля широких уровней)
export const BLOOM_UP = /* glsl */ `
uniform sampler2D tPrev;
uniform sampler2D tCur;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;
void main() {
	vec2 h = uTexel;
	vec3 u = texture2D(tPrev, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
	u += texture2D(tPrev, vUv + vec2(h.x * 2.0, 0.0)).rgb;
	u += texture2D(tPrev, vUv + vec2(0.0, -h.y * 2.0)).rgb;
	u += texture2D(tPrev, vUv + vec2(0.0, h.y * 2.0)).rgb;
	u += texture2D(tPrev, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
	u += texture2D(tPrev, vUv + vec2(h.x, -h.y)).rgb * 2.0;
	u += texture2D(tPrev, vUv + vec2(-h.x, h.y)).rgb * 2.0;
	u += texture2D(tPrev, vUv + vec2(h.x, h.y)).rgb * 2.0;
	u /= 12.0;
	vec3 c = texture2D(tCur, vUv).rgb;
	gl_FragColor = vec4(mix(c, u, uSpread), 1.0);
}
`;

// Финал (один проход на полном разрешении): сведение резкого кадра с размытой половиной (апсемпл с учётом
// глубины — без каймы у силуэта), свечение, экспозиция, баланс белого, sRGB, контраст, LGG, насыщенность,
// тил-оранж, виньетка, аберрация, смаз, зерно, вспышка, сглаживание. Тяжёлые части включаются #define
// (FXAA, DOF, BLOOM, CHROMA, SMEAR, GRAIN, VIGNETTE, GAMMA), без них шейдер их не считает вовсе.
export const FINAL = /* glsl */ `
uniform sampler2D tBase;
uniform sampler2D tDepth;
uniform sampler2D tBlur;
uniform sampler2D tNear;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform vec2 uHalfSize;
uniform float uBloom;
uniform vec3 uGainRgb;
uniform vec3 uBg;
uniform float uContrast;
uniform float uSaturation;
uniform float uSplit;
uniform float uLift;
uniform float uGamma;
uniform float uGain;
uniform float uVignette;
uniform float uVignetteSoft;
uniform float uGrain;
uniform float uSeed;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uChroma;
uniform vec2 uSmear;
${LIN_DEPTH}
${COC}
varying vec2 vUv;

vec3 toSRGB(vec3 v) {
	return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
}
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// сглаживание краёв (FXAA): мир рисуется в буфер без MSAA (в программном WebGL MSAA-буфер очень дорогой)
vec4 sharpAt(vec2 uv) {
	vec4 m = texture2D(tBase, uv);
#ifdef FXAA
	vec2 px = 1.0 / uRes;
	const vec3 LW = vec3(0.299, 0.587, 0.114);
	// яркость по «экранной» шкале (буфер хранит линейный цвет)
	float lM = sqrt(dot(m.rgb, LW));
	float lNW = sqrt(dot(texture2D(tBase, uv + vec2(-1.0, -1.0) * px).rgb, LW));
	float lNE = sqrt(dot(texture2D(tBase, uv + vec2(1.0, -1.0) * px).rgb, LW));
	float lSW = sqrt(dot(texture2D(tBase, uv + vec2(-1.0, 1.0) * px).rgb, LW));
	float lSE = sqrt(dot(texture2D(tBase, uv + vec2(1.0, 1.0) * px).rgb, LW));
	float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
	float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
	if (lMax - lMin < max(0.04, lMax * 0.125)) return m;
	vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
	float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
	float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
	dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * px;
	vec3 a = 0.5 * (texture2D(tBase, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tBase, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
	vec3 b = a * 0.5 + 0.25 * (texture2D(tBase, uv - dir * 0.5).rgb + texture2D(tBase, uv + dir * 0.5).rgb);
	float lB = sqrt(dot(b, LW));
	return vec4((lB < lMin || lB > lMax) ? a : b, m.a);
#else
	return m;
#endif
}

// кадр мира в точке uv (с размытием по глубине, если оно включено); k — доля размытия
vec4 scene(vec2 uv, out float k) {
	k = 0.0;
	vec4 sharp = sharpAt(uv);
#ifdef DOF
	float z = linDepth(texture2D(tDepth, uv).r);
	// tNear хранит радиус в пикселях половинного буфера
	float c = max(coc(z), texture2D(tNear, uv).r * 2.0);
	if (c < 0.6) return sharp;
	vec2 hp = uv * uHalfSize - 0.5;
	vec2 f = fract(hp);
	vec2 b = (floor(hp) + 0.5) / uHalfSize;
	vec2 tx = 1.0 / uHalfSize;
	vec4 s00 = texture2D(tBlur, b);
	vec4 s10 = texture2D(tBlur, b + vec2(tx.x, 0.0));
	vec4 s01 = texture2D(tBlur, b + vec2(0.0, tx.y));
	vec4 s11 = texture2D(tBlur, b + tx);
	float tol = z * 0.06 + 0.03;
	vec4 dz = abs(vec4(s00.a, s10.a, s01.a, s11.a) - z) / tol;
	vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) / (1.0 + 16.0 * dz * dz) + 1e-5;
	vec3 blur = (s00.rgb * w.x + s10.rgb * w.y + s01.rgb * w.z + s11.rgb * w.w) / (w.x + w.y + w.z + w.w);
	k = smoothstep(0.6, 2.4, c);
	return vec4(mix(sharp.rgb, blur, k), sharp.a);
#else
	return sharp;
#endif
}

// дешёвый образец для сдвинутых каналов аберрации: резкий кадр + размытая половина с долей центра
vec3 sceneCheap(vec2 uv, float k) {
	vec3 c = texture2D(tBase, uv).rgb;
#ifdef DOF
	c = mix(c, texture2D(tBlur, uv).rgb, k);
#endif
	return c;
}

vec4 fetch(vec2 uv) {
	float k;
	vec4 g = scene(uv, k);
#ifdef CHROMA
	vec2 d = (uv - 0.5) * 2.0 * uChroma / uRes;
	return vec4(sceneCheap(uv - d, k).r, g.g, sceneCheap(uv + d, k).b, g.a);
#else
	return g;
#endif
}

void main() {
#ifdef SMEAR
	vec4 base = vec4(0.0);
	for (int i = 0; i < 10; i++) {
		float k = (float(i) + 0.5) / 10.0 - 0.5;
		base += fetch(vUv + uSmear * k);
	}
	base /= 10.0;
#else
	vec4 base = fetch(vUv);
#endif
	vec3 c = base.rgb + uBg * (1.0 - base.a);
#ifdef BLOOM
	c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
	c = max(c * uGainRgb, 0.0);
	vec3 d = toSRGB(c);
	d = (d - 0.5) * uContrast + 0.5;
	d = d * uGain + uLift * (1.0 - d);
#ifdef GAMMA
	d = pow(max(d, 0.0), vec3(1.0 / uGamma));
#endif
	float l = dot(d, vec3(0.2126, 0.7152, 0.0722));
	d = mix(vec3(l), d, uSaturation);
	d += uSplit * ((1.0 - smoothstep(0.04, 0.5, l)) * vec3(-0.035, 0.012, 0.05) + smoothstep(0.42, 0.95, l) * vec3(0.055, 0.012, -0.05));
#ifdef VIGNETTE
	vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
	float r = length(q) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
	d *= 1.0 - uVignette * smoothstep(mix(0.85, 0.15, uVignetteSoft), 1.08, r);
#endif
#ifdef GRAIN
	vec2 p = floor(gl_FragCoord.xy);
	float n = hash12(p + uSeed) + hash12(p * 1.37 + uSeed * 1.7 + 11.0) - 1.0;
	d += n * uGrain * 0.075 * (1.0 - 0.55 * clamp(l, 0.0, 1.0));
#endif
	d = mix(d, uFlashColor, uFlash);
	gl_FragColor = vec4(clamp(d, 0.0, 1.0), 1.0);
}
`;
