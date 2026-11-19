// Шейдеры постобработки (GLSL ES 3.0 через ShaderMaterial three: texture2D/gl_FragColor работают, texelFetch тоже).
// Кадр мира лежит в 8-битном буфере уже в sRGB (как на экране, смешивание прозрачного — как без постобработки);
// внутри проходов цвет переводится в линейный, в конце — обратно в sRGB.

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// sRGB <-> линейный
const SRGB = /* glsl */ `
vec3 toLinear(vec3 c) {
	return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045))));
}
vec3 toSRGB(vec3 v) {
	return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
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

// 1. Полный кадр -> половина: линейный цвет + глубина (самая дальняя из 2x2).
// Пиксели переднего плана на границе отбрасываются — фон за силуэтом размывается без ореола.
export const DOF_DOWN = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uSrcSize;
${SRGB}
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
	gl_FragColor = vec4(toLinear(c / max(1.0, w0 + w1 + w2 + w3)), zf);
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

// Ядро сбора: точки золотой спирали в единичном круге (x, y, расстояние от центра) — считаются один раз
const TAPS = 18;
const KERNEL = Array.from({length: TAPS}, (_, i) => {
	const fi = i + 0.5;
	const r = Math.sqrt(fi / TAPS);
	const a = fi * 2.3999632;
	return `vec3(${(Math.cos(a) * r).toFixed(5)}, ${(Math.sin(a) * r).toFixed(5)}, ${r.toFixed(5)})`;
}).join(', ');

// 2. Размытие на половинном разрешении: «рассеяние через сбор» по золотой спирали.
// Образец участвует, только если его собственный кружок дотягивается до центра; дальние
// образцы не налезают на ближние (резкий герой не размывается фоном, фон не тянет героя).
// Спираль поворачивается от положения пикселя (без времени): шум вместо «копий».
export const DOF_GATHER = /* glsl */ `
uniform sampler2D tHalf;
uniform sampler2D tNear;
uniform vec2 uHalfSize;
${COC}
varying vec2 vUv;
#define TAPS ${TAPS}
const vec3 K[TAPS] = vec3[TAPS](${KERNEL});
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
	float a0 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
	float ca = cos(a0);
	float sa = sin(a0);
	vec2 sx = vec2(ca, sa) * R / uHalfSize;
	vec2 sy = vec2(-sa, ca) * R / uHalfSize;
	for (int i = 0; i < TAPS; i++) {
		vec3 k = K[i];
		float rr = R * k.z;
		vec4 s = texture2D(tHalf, vUv + sx * k.x + sy * k.y);
		float sr = coc(s.a);
		if (s.a > z0) sr = min(sr, r0 * 2.0);
		float m = clamp(sr - rr + 0.5, 0.0, 1.0);
		acc += mix(acc / tot, s.rgb, m);
		tot += 1.0;
	}
	gl_FragColor = vec4(acc / tot, z0);
}
`;

// Свечение: выделение ярких мест сразу в четверть разрешения (4 билинейных образца = блок 4x4), мягкое колено
export const BLOOM_PREFILTER = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
${SRGB}
varying vec2 vUv;
void main() {
	vec3 c = toLinear(texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
	c += toLinear(texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb);
	c += toLinear(texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb);
	c += toLinear(texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb);
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
// тил-оранж, виньетка, аберрация, смаз, зерно, вспышка, сглаживание. Части включаются #define
// (FXAA, DOF, BLOOM, CHROMA, SMEAR, GRAIN, VIGNETTE, GAMMA, GRADE): без них шейдер их не считает вовсе.
// Дорогие выборки пропускаются там, где не нужны: FXAA — в полностью размытом, аберрация — в центре кадра.
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
${SRGB}
${LIN_DEPTH}
${COC}
varying vec2 vUv;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

// резкий кадр (sRGB) со сглаживанием краёв FXAA: мир рисуется в буфер без MSAA (в программном WebGL он дорогой)
vec4 sharpAt(vec2 uv) {
	vec4 m = texture2D(tBase, uv);
#ifdef FXAA
	vec2 px = 1.0 / uRes;
	const vec3 LW = vec3(0.299, 0.587, 0.114);
	float lM = dot(m.rgb, LW);
	float lNW = dot(texture2D(tBase, uv + vec2(-1.0, -1.0) * px).rgb, LW);
	float lNE = dot(texture2D(tBase, uv + vec2(1.0, -1.0) * px).rgb, LW);
	float lSW = dot(texture2D(tBase, uv + vec2(-1.0, 1.0) * px).rgb, LW);
	float lSE = dot(texture2D(tBase, uv + vec2(1.0, 1.0) * px).rgb, LW);
	float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
	float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
	if (lMax - lMin < max(0.04, lMax * 0.125)) return m;
	vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
	float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
	float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
	dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * px;
	vec3 a = 0.5 * (texture2D(tBase, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tBase, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
	vec3 b = a * 0.5 + 0.25 * (texture2D(tBase, uv - dir * 0.5).rgb + texture2D(tBase, uv + dir * 0.5).rgb);
	float lB = dot(b, LW);
	return vec4((lB < lMin || lB > lMax) ? a : b, m.a);
#else
	return m;
#endif
}

#ifdef DOF
// размытая половина -> полный размер с учётом глубины: берём только образцы своей глубины (нет каймы у силуэта)
vec3 blurAt(vec2 uv, float z) {
	float tol = z * 0.06 + 0.03;
	vec4 c = texture2D(tBlur, uv);
	if (abs(c.a - z) < tol * 0.25) return c.rgb;
	vec2 hp = uv * uHalfSize - 0.5;
	vec2 f = fract(hp);
	vec2 b = (floor(hp) + 0.5) / uHalfSize;
	vec2 tx = 1.0 / uHalfSize;
	vec4 s00 = texture2D(tBlur, b);
	vec4 s10 = texture2D(tBlur, b + vec2(tx.x, 0.0));
	vec4 s01 = texture2D(tBlur, b + vec2(0.0, tx.y));
	vec4 s11 = texture2D(tBlur, b + tx);
	vec4 dz = abs(vec4(s00.a, s10.a, s01.a, s11.a) - z) / tol;
	vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) / (1.0 + 16.0 * dz * dz) + 1e-5;
	return (s00.rgb * w.x + s10.rgb * w.y + s01.rgb * w.z + s11.rgb * w.w) / (w.x + w.y + w.z + w.w);
}
#endif

// доля размытия в точке uv (0 — резко)
float blurK(vec2 uv, out float z) {
	z = 0.0;
#ifdef DOF
	z = linDepth(texture2D(tDepth, uv).r);
	// tNear хранит радиус в пикселях половинного буфера
	float c = max(coc(z), texture2D(tNear, uv).r * 2.0);
	return smoothstep(0.6, 2.4, c);
#else
	return 0.0;
#endif
}

// кадр мира в точке uv, линейный цвет; a — непрозрачность
vec4 sceneAt(vec2 uv, out float k) {
	float z;
	k = blurK(uv, z);
#ifdef DOF
	if (k > 0.985) return vec4(blurAt(uv, z), 1.0);
	vec4 s = sharpAt(uv);
	vec3 lin = toLinear(s.rgb);
	if (k > 0.0) lin = mix(lin, blurAt(uv, z), k);
	return vec4(lin, s.a);
#else
	vec4 s = sharpAt(uv);
	return vec4(toLinear(s.rgb), s.a);
#endif
}

// дешёвый образец (без FXAA и апсемпла с глубиной) — для сдвинутых каналов аберрации и смаза
vec3 sceneCheap(vec2 uv, float k) {
	vec3 c = toLinear(texture2D(tBase, uv).rgb);
#ifdef DOF
	if (k > 0.0) c = mix(c, texture2D(tBlur, uv).rgb, k);
#endif
	return c;
}

// один канал дешёвого образца (ch: 0 — красный, 2 — синий) — для аберрации
float channelCheap(vec2 uv, float k, int ch) {
	float v = texture2D(tBase, uv)[ch];
	v = v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
#ifdef DOF
	if (k > 0.0) v = mix(v, texture2D(tBlur, uv)[ch], k);
#endif
	return v;
}

void main() {
	float k;
#ifdef SMEAR
	// смаз «вжух»: 8 дешёвых образцов вдоль направления, со сдвигом от шума (без полос).
	// Аберрация здесь — «спектральная»: красный тянется к началу смаза, синий — к концу (без лишних выборок)
	float z;
	k = blurK(vUv, z);
	vec3 acc = vec3(0.0);
	vec3 wsum = vec3(0.0);
	float j = hash12(gl_FragCoord.xy) - 0.5;
#ifdef CHROMA
	float sp = clamp(uChroma * 0.25, 0.0, 0.8);
#else
	float sp = 0.0;
#endif
	for (int i = 0; i < 8; i++) {
		float f = (float(i) + 0.5 + j) / 8.0 - 0.5;
		vec3 w = vec3(1.0 - sp * 2.0 * f, 1.0, 1.0 + sp * 2.0 * f);
		acc += sceneCheap(vUv + uSmear * f, k) * w;
		wsum += w;
	}
	vec4 base = vec4(acc / wsum, 1.0);
#else
	vec4 base = sceneAt(vUv, k);
#endif
#if defined(CHROMA) && !defined(SMEAR)
	// аберрация растёт к краям; в центре кадра сдвиг меньше пикселя — не считаем
	vec2 cd = (vUv - 0.5) * 2.0 * uChroma / uRes;
	if (dot(cd * uRes, cd * uRes) > 0.09) {
		base.r = channelCheap(vUv - cd, k, 0);
		base.b = channelCheap(vUv + cd, k, 2);
	}
#endif
	vec3 c = base.rgb + uBg * (1.0 - base.a);
#ifdef BLOOM
	c += texture2D(tBloom, vUv).rgb * uBloom;
#endif
#ifdef GRADE
	c = max(c * uGainRgb, 0.0);
#endif
	vec3 d = toSRGB(c);
#ifdef GRADE
	d = (d - 0.5) * uContrast + 0.5;
	d = d * uGain + uLift * (1.0 - d);
#endif
#ifdef GAMMA
	d = pow(max(d, 0.0), vec3(1.0 / uGamma));
#endif
	float l = dot(d, vec3(0.2126, 0.7152, 0.0722));
#ifdef GRADE
	d = mix(vec3(l), d, uSaturation);
	d += uSplit * ((1.0 - smoothstep(0.04, 0.5, l)) * vec3(-0.035, 0.012, 0.05) + smoothstep(0.42, 0.95, l) * vec3(0.055, 0.012, -0.05));
#endif
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
