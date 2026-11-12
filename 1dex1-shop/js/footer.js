// Подвал: большая надпись «1DEX1 SHOP» в 3D из множества маленьких блоков (буквы из шрифта сайта).
// Блоки светятся и приподнимаются под курсором, надпись чуть поворачивается за мышью.
// Клик ломает кучку блоков — они разлетаются кубиками и быстро вырастают снова.
// three.js загружается, только когда подвал близко к экрану.
import {CROSSHAIR} from './pixel.js';
import {burst, cellIndex, fontReady, rasterize, voxelState} from './voxelword.js';

const FLY = 0.75; // сколько секунд летят выбитые кубики
const PAD = 2; // поля вокруг надписи в блоках: место для наклона и разлёта
const ROWS = 10; // высота буквы в блоках

// цвет блока по свечению: тёмный -> фиолетовый -> голубой -> салатовый
const DARK = [34, 27, 58];
const PURPLE = [154, 107, 255];
const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);

export const initFootWord = (canvas, {on = () => {}, reducedMotion = false} = {}) => {
	const wideNow = () => canvas.clientWidth >= 560;
	// пока three.js не загрузился, держим примерную высоту, чтобы страница не прыгала
	const guessHeight = () => {
		const w = canvas.clientWidth;
		if (w && !canvas.dataset.ready) canvas.style.height = `${Math.round(w * (wideNow() ? 0.115 : 0.46))}px`;
	};
	guessHeight();
	addEventListener('resize', guessHeight);

	let started = false;
	const start = () => {
		if (started) return;
		started = true;
		Promise.all([import('../vendor/three.module.min.js'), fontReady()])
			.then(([THREE]) => run(THREE))
			.catch(() => {});
	};
	new IntersectionObserver(([e]) => e.isIntersecting && start(), {rootMargin: '700px 0px'}).observe(canvas);

	const run = (THREE) => {
		let renderer;
		try {
			renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
		} catch {
			return; // без WebGL подвал остаётся без надписи
		}
		canvas.dataset.ready = '1';
		renderer.setClearColor(0x000000, 0);
		const scene = new THREE.Scene();
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 200);
		camera.position.set(0, 0, 100);
		scene.add(new THREE.AmbientLight(0xcfc4ff, 1.45));
		const key = new THREE.DirectionalLight(0xffffff, 2.3);
		key.position.set(-0.45, 0.8, 1);
		scene.add(key);
		const group = new THREE.Group();
		scene.add(group);

		// блок: светлый, с тёмной рамкой и лёгким шумом — цвет задаётся каждому отдельно
		const tc = document.createElement('canvas');
		tc.width = tc.height = 16;
		const tg = tc.getContext('2d');
		for (let y = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++) {
				const edge = x === 0 || y === 0 || x === 15 || y === 15;
				const v = Math.round((edge ? 0.74 : 0.9 + ((x * 7 + y * 13) % 5) * 0.025) * 255);
				tg.fillStyle = `rgb(${v},${v},${v})`;
				tg.fillRect(x, y, 1, 1);
			}
		}
		const tex = new THREE.CanvasTexture(tc);
		tex.magFilter = THREE.NearestFilter;
		tex.colorSpace = THREE.SRGBColorSpace;
		const geo = new THREE.BoxGeometry(1, 1, 1.4);
		const mat = new THREE.MeshLambertMaterial({map: tex});
		// цвета свечения заранее, 64 ступени: тёмный -> фиолетовый, дальше по кругу цветов
		// через голубой к салатовому (напрямую получается серый)
		const PALETTE = Array.from({length: 64}, (_, i) => {
			const g = i / 63;
			if (g >= 0.5) {
				const k = (g - 0.5) * 2;
				return new THREE.Color().setHSL((263 - k * 181) / 360, 0.92 + k * 0.08, 0.66 - k * 0.04, THREE.SRGBColorSpace);
			}
			const [r, gg, b] = mix(DARK, PURPLE, g * 2);
			return new THREE.Color().setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace);
		});

		let mesh = null;
		let word = null;
		let list = [];
		let find = () => -1;
		let wide = null;
		let W = 1;
		let Hh = 1;
		const build = (isWide) => {
			if (wide === isWide) return;
			wide = isWide;
			word = rasterize(isWide ? ['1DEX1 SHOP'] : ['1DEX1', 'SHOP'], ROWS);
			find = cellIndex(word);
			list = word.cells.map((c) => ({...c, glow: 0, brokenAt: -1, regrowAt: 0, vx: 0, vy: 0, vz: 0, spin: 0, flyColor: 0}));
			if (mesh) {
				group.remove(mesh);
				mesh.dispose();
			}
			mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
			mesh.frustumCulled = false;
			list.forEach((_, i) => mesh.setColorAt(i, PALETTE[0]));
			group.add(mesh);
		};

		let width = 1;
		const resize = () => {
			const w = canvas.clientWidth;
			if (!w) return;
			build(w >= 560);
			W = word.width + PAD * 2;
			Hh = word.height + PAD * 2;
			const h = (w * Hh) / W;
			width = w;
			canvas.style.height = `${h.toFixed(1)}px`;
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(w, h, false);
			camera.left = -W / 2;
			camera.right = W / 2;
			camera.top = Hh / 2;
			camera.bottom = -Hh / 2;
			camera.updateProjectionMatrix();
		};

		// ---- курсор: точка на надписи (в блоках) ----
		const raycaster = new THREE.Raycaster();
		const ndc = new THREE.Vector2();
		const inv = new THREE.Matrix4();
		const o = new THREE.Vector3();
		const d = new THREE.Vector3();
		let pointer = null; // {nx, ny} — от -1 до 1 по холсту
		let aim = null; // {x, y} — точка на надписи
		const aimAt = () => {
			if (!pointer) return (aim = null);
			ndc.set(pointer.nx, pointer.ny);
			raycaster.setFromCamera(ndc, camera);
			group.updateMatrixWorld();
			inv.copy(group.matrixWorld).invert();
			o.copy(raycaster.ray.origin).applyMatrix4(inv);
			d.copy(raycaster.ray.origin).add(raycaster.ray.direction).applyMatrix4(inv).sub(o);
			if (Math.abs(d.z) < 1e-6) return (aim = null);
			const k = (0.7 - o.z) / d.z;
			aim = {x: o.x + d.x * k, y: o.y + d.y * k};
			return aim;
		};
		const local = (e) => {
			const r = canvas.getBoundingClientRect();
			return {nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -(((e.clientY - r.top) / r.height) * 2 - 1)};
		};
		canvas.addEventListener('pointermove', (e) => {
			pointer = local(e);
			const a = aimAt();
			canvas.style.cursor = a && find(list, a.x, a.y, 1) >= 0 ? CROSSHAIR : '';
		});
		canvas.addEventListener('pointerleave', () => {
			pointer = null;
			aim = null;
			canvas.style.cursor = '';
		});
		let downAt = null;
		canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
		canvas.addEventListener('pointerup', (e) => {
			if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
			pointer = local(e);
			const a = aimAt();
			if (!a || find(list, a.x, a.y, 1.2) < 0) return;
			const hit = burst(list, a.x, a.y, t, wide ? 3.4 : 3);
			for (const v of hit) {
				// кубики разлетаются от места удара и к зрителю
				const dx = v.x - a.x;
				const dy = v.y - a.y;
				const len = Math.hypot(dx, dy) || 1;
				const power = 5 + Math.random() * 6;
				v.vx = (dx / len) * power + (Math.random() - 0.5) * 3;
				v.vy = (dy / len) * power * 0.6 + 5 + Math.random() * 6;
				v.vz = 8 + Math.random() * 10;
				v.spin = (Math.random() - 0.5) * 16;
				v.flyColor = Math.max(32, Math.round(v.glow * 63));
			}
			if (hit.length) on('break');
			if (e.pointerType !== 'mouse') {
				pointer = null;
				aim = null;
			}
		});

		// ---- кадр ----
		const dummy = new THREE.Object3D();
		let t = 0;
		let tiltX = 0;
		let tiltY = 0;
		let visible = false;
		let last = performance.now();
		const frame = (now) => {
			requestAnimationFrame(frame);
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (!visible || !mesh) return;
			t += dt;
			// наклон за мышью, без мыши — лёгкое покачивание
			const tx = reducedMotion ? 0 : pointer ? pointer.ny * -0.2 : Math.sin(t * 0.45) * 0.05;
			const ty = reducedMotion ? 0 : pointer ? pointer.nx * 0.28 : Math.sin(t * 0.32) * 0.1;
			tiltX += (tx - tiltX) * (1 - Math.exp(-dt * 5));
			tiltY += (ty - tiltY) * (1 - Math.exp(-dt * 5));
			group.rotation.set(tiltX, tiltY, 0);
			if (pointer) aimAt();
			for (let i = 0; i < list.length; i++) {
				const v = list[i];
				let target = reducedMotion ? 0 : (Math.sin(t * 1.4 - v.x * 0.16) * 0.5 + 0.5) * 0.16;
				let lift = 0;
				if (aim) {
					const near = 1 - Math.min(1, Math.hypot(aim.x - v.x, aim.y - v.y) / 4.6);
					target = Math.max(target, near);
					lift = near;
				}
				v.glow += (target - v.glow) * (target > v.glow ? 0.35 : 0.06);
				const since = v.brokenAt >= 0 ? t - v.brokenAt : -1;
				if (since >= 0 && since < FLY) {
					// выбитый кубик летит, крутится и уменьшается
					const k = since / FLY;
					dummy.position.set(v.x + v.vx * since, v.y + v.vy * since - 16 * since * since, 0.7 + v.vz * since);
					dummy.rotation.set(v.spin * since, v.spin * since * 0.7, 0);
					dummy.scale.setScalar(Math.max(0.0001, 1 - k * 0.75));
					mesh.setColorAt(i, PALETTE[v.flyColor]);
				} else {
					const s = voxelState(v, t);
					dummy.position.set(v.x, v.y, lift * lift * 1.6);
					dummy.rotation.set(0, 0, 0);
					dummy.scale.setScalar(Math.max(0.0001, s) * (1 + lift * 0.08));
					mesh.setColorAt(i, PALETTE[Math.round(Math.min(1, v.glow) * 63)]);
				}
				dummy.updateMatrix();
				mesh.setMatrixAt(i, dummy.matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;
			renderer.render(scene, camera);
		};

		new ResizeObserver(resize).observe(canvas);
		new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
		resize();
		requestAnimationFrame(frame);
	};
};
