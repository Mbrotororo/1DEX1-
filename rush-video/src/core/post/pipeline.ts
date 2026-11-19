import * as THREE from 'three';
import {FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js';
import {hexToRgb} from '../anim';
import {HUD_ORDER} from '../hud/VoxelText';
import {BLOOM_DOWN, BLOOM_PREFILTER, BLOOM_UP, DOF_DILATE, DOF_DOWN, DOF_GATHER, DOF_TILE, FINAL, VERT} from './shaders';
import type {PostSettings} from './settings';

// Конвейер постобработки: мир -> буфер (цвет + глубина) -> [размытие по глубине на половинном разрешении]
// -> [свечение] -> финальный проход прямо на экран -> экранный 3D-слой (HudLayer) поверх, резко.
// Один объект на рендерер (на вкладку); буферы создаются лениво и переживают смену сцен.

// слой three для экранного 3D-слоя (HudLayer): рисуется после постобработки, поверх, без размытия
export const HUD_LAYER = 31;

// фон проигрывателя (#05081e) в линейном цвете — им заливается прозрачное
const BG = new THREE.Color('#05081e');

const BLOOM_LEVELS = 6;

type RT = THREE.WebGLRenderTarget;

const makeRT = (w: number, h: number, opts: {samples?: number; depthTexture?: boolean; nearest?: boolean; srgb8?: boolean} = {}): RT => {
	const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
		type: opts.srgb8 ? THREE.UnsignedByteType : THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		colorSpace: opts.srgb8 ? THREE.SRGBColorSpace : THREE.NoColorSpace,
		minFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
		magFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
		depthBuffer: !!opts.depthTexture,
		stencilBuffer: false,
		samples: opts.samples ?? 0,
		generateMipmaps: false,
	});
	rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
	if (opts.depthTexture) {
		const dt = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
		dt.type = THREE.UnsignedIntType;
		dt.minFilter = dt.magFilter = THREE.NearestFilter;
		rt.depthTexture = dt;
	}
	return rt;
};

const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
	new THREE.ShaderMaterial({vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false});

const dofUniforms = () => ({uFocus: {value: 5}, uRange: {value: 1}, uBlur: {value: 0}, uNearBlur: {value: 1}});

export class PostPipeline {
	private renderer: THREE.WebGLRenderer;
	private fxaa: boolean;
	private w = 0;
	private h = 0;
	private sceneRT!: RT;
	private halfA!: RT;
	private halfB!: RT;
	private tileA!: RT;
	private tileB!: RT;
	private down: RT[] = [];
	private up: RT[] = [];
	private quad = new FullScreenQuad();
	private size = new THREE.Vector2();
	private hudMarked = new Set<THREE.Object3D>();
	private finalKey = '';

	private mDown = mat(DOF_DOWN, {tColor: {value: null}, tDepth: {value: null}, uSrcSize: {value: new THREE.Vector2()}, uNear: {value: 0.1}, uFar: {value: 2000}});
	private mTile = mat(DOF_TILE, {tHalf: {value: null}, uHalfSize: {value: new THREE.Vector2()}, ...dofUniforms()});
	private mDilate = mat(DOF_DILATE, {tTile: {value: null}, uTileSize: {value: new THREE.Vector2()}});
	private mGather = mat(DOF_GATHER, {tHalf: {value: null}, tNear: {value: null}, uHalfSize: {value: new THREE.Vector2()}, ...dofUniforms()});
	private mPre = mat(BLOOM_PREFILTER, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uThreshold: {value: 0.8}, uKnee: {value: 0.2}});
	private mBDown = mat(BLOOM_DOWN, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}});
	private mBUp = mat(BLOOM_UP, {tPrev: {value: null}, tCur: {value: null}, uTexel: {value: new THREE.Vector2()}, uSpread: {value: 0.6}});
	private mFinal = mat(FINAL, {
		tBase: {value: null},
		tDepth: {value: null},
		tBlur: {value: null},
		tNear: {value: null},
		tBloom: {value: null},
		uRes: {value: new THREE.Vector2()},
		uHalfSize: {value: new THREE.Vector2()},
		uNear: {value: 0.1},
		uFar: {value: 2000},
		...dofUniforms(),
		uBloom: {value: 0},
		uGainRgb: {value: new THREE.Vector3(1, 1, 1)},
		uBg: {value: new THREE.Vector3(BG.r, BG.g, BG.b)},
		uContrast: {value: 1},
		uSaturation: {value: 1},
		uSplit: {value: 0},
		uLift: {value: 0},
		uGamma: {value: 1},
		uGain: {value: 1},
		uVignette: {value: 0},
		uVignetteSoft: {value: 0.6},
		uGrain: {value: 0},
		uSeed: {value: 0},
		uFlash: {value: 0},
		uFlashColor: {value: new THREE.Vector3(1, 1, 1)},
		uChroma: {value: 0},
		uSmear: {value: new THREE.Vector2()},
	});

	constructor(renderer: THREE.WebGLRenderer, antialias: boolean) {
		this.renderer = renderer;
		this.fxaa = antialias;
	}

	private ensure(w: number, h: number) {
		if (w === this.w && h === this.h && this.sceneRT) return;
		this.dispose();
		this.w = w;
		this.h = h;
		const hw = Math.ceil(w / 2);
		const hh = Math.ceil(h / 2);
		// кадр мира: 8 бит в sRGB (точность как у экрана) и текстура глубины. Без MSAA: в программном
		// WebGL MSAA-буфер стоит ~350 мс на кадр 1080p, края сглаживает FXAA в финальном проходе
		this.sceneRT = makeRT(w, h, {depthTexture: true, srgb8: true});
		this.halfA = makeRT(hw, hh);
		this.halfB = makeRT(hw, hh, {nearest: true});
		this.tileA = makeRT(Math.ceil(hw / 8), Math.ceil(hh / 8), {nearest: true});
		this.tileB = makeRT(Math.ceil(hw / 8), Math.ceil(hh / 8));
		this.down = [];
		this.up = [];
		for (let i = 0; i < BLOOM_LEVELS; i++) {
			const lw = Math.max(1, Math.ceil(w / 2 ** (i + 1)));
			const lh = Math.max(1, Math.ceil(h / 2 ** (i + 1)));
			this.down.push(makeRT(lw, lh));
			if (i < BLOOM_LEVELS - 1) this.up.push(makeRT(lw, lh));
		}
	}

	dispose() {
		for (const rt of [this.sceneRT, this.halfA, this.halfB, this.tileA, this.tileB, ...this.down, ...this.up]) {
			if (!rt) continue;
			rt.depthTexture?.dispose();
			rt.dispose();
		}
		this.down = [];
		this.up = [];
	}

	// Объекты экранного слоя (renderOrder >= HUD_ORDER) уводим на отдельный слой, свет видят оба слоя
	private markHud(scene: THREE.Scene): boolean {
		let any = false;
		scene.traverse((o) => {
			if ((o as THREE.Light).isLight) {
				o.layers.enable(HUD_LAYER);
				return;
			}
			if (o.renderOrder >= HUD_ORDER) {
				o.layers.set(HUD_LAYER);
				this.hudMarked.add(o);
				if (o.visible) any = true;
			}
		});
		return any;
	}

	// Вернуть объекты экранного слоя на обычный слой (когда постобработка выключается)
	restoreHud() {
		for (const o of this.hudMarked) o.layers.set(0);
		this.hudMarked.clear();
	}

	private pass(material: THREE.ShaderMaterial, target: RT | null) {
		this.renderer.setRenderTarget(target);
		this.quad.material = material;
		this.quad.render(this.renderer);
	}

	// Включённые части финального шейдера (#define); смена набора — другая (закэшированная) программа
	private setFinalDefines(flags: Record<string, boolean>) {
		const key = Object.keys(flags)
			.filter((k) => flags[k])
			.join(',');
		if (key === this.finalKey) return;
		this.finalKey = key;
		const defines: Record<string, string> = {};
		for (const k of Object.keys(flags)) if (flags[k]) defines[k] = '1';
		this.mFinal.defines = defines;
		this.mFinal.needsUpdate = true;
	}

	render(scene: THREE.Scene, camera: THREE.Camera, s: PostSettings, time: number) {
		const r = this.renderer;
		r.getDrawingBufferSize(this.size);
		const w = Math.max(1, Math.floor(this.size.x));
		const h = Math.max(1, Math.floor(this.size.y));
		this.ensure(w, h);
		const k = h / 1080;
		const cam = camera as THREE.PerspectiveCamera;
		const near = cam.near ?? 0.1;
		const far = cam.far ?? 2000;
		const prevAutoClear = r.autoClear;
		const prevMask = camera.layers.mask;
		const hw = this.halfA.width;
		const hh = this.halfA.height;

		const hasHud = this.markHud(scene);
		camera.layers.disable(HUD_LAYER);

		// 1. мир
		r.autoClear = true;
		r.setRenderTarget(this.sceneRT);
		r.render(scene, camera);

		// 2. размытие по глубине (половинное разрешение); сведение — в финальном проходе
		const blurFull = Math.max(0, s.dof) * k;
		const dofOn = blurFull > 0.3;
		if (dofOn) {
			const d = this.mDown.uniforms;
			d.tColor.value = this.sceneRT.texture;
			d.tDepth.value = this.sceneRT.depthTexture;
			d.uSrcSize.value.set(w, h);
			d.uNear.value = near;
			d.uFar.value = far;
			this.pass(this.mDown, this.halfA);

			// передний план: максимум по плиткам и расширение на соседей
			const tl = this.mTile.uniforms;
			tl.tHalf.value = this.halfA.texture;
			tl.uHalfSize.value.set(hw, hh);
			tl.uFocus.value = s.focus;
			tl.uRange.value = s.focusRange;
			tl.uBlur.value = blurFull / 2;
			tl.uNearBlur.value = s.nearBlur;
			this.pass(this.mTile, this.tileA);
			this.mDilate.uniforms.tTile.value = this.tileA.texture;
			this.mDilate.uniforms.uTileSize.value.set(this.tileA.width, this.tileA.height);
			this.pass(this.mDilate, this.tileB);

			const g = this.mGather.uniforms;
			g.tHalf.value = this.halfA.texture;
			g.tNear.value = this.tileB.texture;
			g.uHalfSize.value.set(hw, hh);
			g.uFocus.value = s.focus;
			g.uRange.value = s.focusRange;
			g.uBlur.value = blurFull / 2;
			g.uNearBlur.value = s.nearBlur;
			this.pass(this.mGather, this.halfB);
		}

		// 3. свечение (из резкого кадра: ореол всё равно мягкий)
		const bloomOn = s.bloom > 0.001;
		if (bloomOn) {
			const p = this.mPre.uniforms;
			p.tSrc.value = this.sceneRT.texture;
			p.uTexel.value.set(1 / w, 1 / h);
			p.uThreshold.value = s.bloomThreshold;
			p.uKnee.value = Math.max(0.05, s.bloomThreshold * 0.5);
			this.pass(this.mPre, this.down[0]);
			for (let i = 1; i < BLOOM_LEVELS; i++) {
				const src = this.down[i - 1];
				this.mBDown.uniforms.tSrc.value = src.texture;
				this.mBDown.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
				this.pass(this.mBDown, this.down[i]);
			}
			const spread = 0.35 + 0.5 * Math.min(1, Math.max(0, s.bloomRadius));
			for (let i = BLOOM_LEVELS - 2; i >= 0; i--) {
				const prev = i === BLOOM_LEVELS - 2 ? this.down[BLOOM_LEVELS - 1] : this.up[i + 1];
				const u = this.mBUp.uniforms;
				u.tPrev.value = prev.texture;
				u.tCur.value = this.down[i].texture;
				u.uTexel.value.set(1 / prev.width, 1 / prev.height);
				u.uSpread.value = spread;
				this.pass(this.mBUp, this.up[i]);
			}
		}

		// 4. финал на экран
		const chroma = Math.max(0, s.chroma) * k;
		const smear = Math.max(0, s.smear) * k;
		this.setFinalDefines({
			FXAA: this.fxaa,
			DOF: dofOn,
			BLOOM: bloomOn,
			CHROMA: chroma > 0.05,
			SMEAR: smear > 0.5,
			GRAIN: s.grain > 0.001,
			VIGNETTE: s.vignette > 0.001,
			GAMMA: Math.abs(s.gamma - 1) > 1e-4,
		});
		const f = this.mFinal.uniforms;
		f.tBase.value = this.sceneRT.texture;
		f.tDepth.value = this.sceneRT.depthTexture;
		f.tBlur.value = dofOn ? this.halfB.texture : null;
		f.tNear.value = dofOn ? this.tileB.texture : null;
		f.tBloom.value = bloomOn ? this.up[0].texture : null;
		f.uRes.value.set(w, h);
		f.uHalfSize.value.set(hw, hh);
		f.uNear.value = near;
		f.uFar.value = far;
		f.uFocus.value = s.focus;
		f.uRange.value = s.focusRange;
		f.uBlur.value = blurFull;
		f.uNearBlur.value = s.nearBlur;
		f.uBloom.value = s.bloom;
		const ev = Math.pow(2, s.exposure);
		const wr = 1 + 0.16 * s.warmth + 0.04 * s.tint;
		const wg = 1 + 0.03 * s.warmth - 0.08 * s.tint;
		const wb = 1 - 0.2 * s.warmth + 0.04 * s.tint;
		f.uGainRgb.value.set(ev * wr, ev * wg, ev * wb);
		f.uContrast.value = s.contrast;
		f.uSaturation.value = s.saturation;
		f.uSplit.value = Math.max(0, s.split);
		f.uLift.value = s.lift;
		f.uGamma.value = Math.max(0.05, s.gamma);
		f.uGain.value = s.gain;
		f.uVignette.value = Math.max(0, s.vignette);
		f.uVignetteSoft.value = Math.min(1, Math.max(0, s.vignetteSoft));
		f.uGrain.value = Math.max(0, s.grain);
		// зерно меняется от кадра к кадру, но только от времени: один кадр — одно зерно
		f.uSeed.value = (Math.round(time * 600) % 997) * 7.123;
		f.uFlash.value = Math.min(1, Math.max(0, s.flash));
		const fc = hexToRgb(s.flashColor);
		f.uFlashColor.value.set(fc[0], fc[1], fc[2]);
		f.uChroma.value = chroma;
		f.uSmear.value.set((Math.cos(s.smearAngle) * smear) / w, (Math.sin(s.smearAngle) * smear) / h);
		this.pass(this.mFinal, null);

		// 5. экранный 3D-слой — поверх готового кадра, резко (перед ним HudLayer сам чистит глубину)
		if (hasHud) {
			const bg = scene.background;
			scene.background = null;
			r.autoClear = false;
			camera.layers.set(HUD_LAYER);
			r.render(scene, camera);
			scene.background = bg;
		}

		r.autoClear = prevAutoClear;
		camera.layers.mask = prevMask;
	}
}

const pipelines = new WeakMap<THREE.WebGLRenderer, PostPipeline>();

// Конвейер для рендерера (один на вкладку)
export const getPipeline = (renderer: THREE.WebGLRenderer, antialias: boolean): PostPipeline => {
	let p = pipelines.get(renderer);
	if (!p) {
		p = new PostPipeline(renderer, antialias);
		pipelines.set(renderer, p);
	}
	return p;
};
