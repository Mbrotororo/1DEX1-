// Танцы под музыку. Сайт не может узнать, что играет в Spotify, YouTube или Яндекс Музыке:
// браузер не показывает страницам звук других приложений. Поэтому персонаж «слушает»
// музыку через микрофон — только после нажатия кнопки и разрешения браузера.
// Звук разбирается прямо в браузере: ищем удары баса, считаем темп и держим такт.
// Ничего не записывается и никуда не отправляется.
//
// createGroove() → {start, stop, playing, beat(), period}
//   playing — сейчас слышна музыка с ритмом (или включён режим «просто танцевать»)
//   beat()  — номер доли с дробной частью: 3.0 — третий удар, 3.5 — между третьим и четвёртым

const MIN_GAP = 0.23; // чаще ударов не бывает (~260 ударов в минуту)
const QUIET = 2.6; // секунд без ударов — музыка кончилась

export const createGroove = () => {
	let ctx = null;
	let stream = null;
	let analyser = null;
	let freq = null;
	let wave = null;
	let raf = 0;
	let manual = false; // микрофона нет — персонаж просто танцует в своём темпе
	let playing = false;
	let period = 0.5; // секунд на долю (120 ударов в минуту)
	let beatPos = 0;
	let lastT = 0;
	let prevLow = 0;
	let lastOnset = -9;
	const flux = [];
	const onsets = [];
	let lo = 2;
	let hi = 7;

	const now = () => performance.now() / 1000;

	// темп: интервалы между ударами приводим к 0,33–0,75 с (вдвое длиннее/короче — тот же темп)
	// и берём самый частый; play — интервалы правда похожи друг на друга (музыка, а не разговор)
	const tempo = () => {
		const iv = [];
		for (let i = 1; i < onsets.length; i++) {
			let d = onsets[i] - onsets[i - 1];
			if (d > 2) continue;
			while (d < 0.33) d *= 2;
			while (d > 0.75) d /= 2;
			iv.push(d);
		}
		if (iv.length < 3) return null;
		let best = null;
		for (const a of iv) {
			const near = iv.filter((b) => Math.abs(b - a) < 0.035);
			if (!best || near.length > best.length) best = near;
		}
		if (best.length < 3 || best.length < iv.length * 0.5) return null;
		return best.reduce((s, x) => s + x, 0) / best.length;
	};

	const tick = () => {
		raf = requestAnimationFrame(tick);
		const t = now();
		const dt = Math.min(0.1, t - lastT);
		lastT = t;
		beatPos += dt / period;
		if (manual || !analyser) return;
		analyser.getByteFrequencyData(freq);
		analyser.getByteTimeDomainData(wave);
		// бас (удар бочки) и общая громкость
		let low = 0;
		for (let i = lo; i <= hi; i++) low += freq[i];
		low /= hi - lo + 1;
		let rms = 0;
		for (let i = 0; i < wave.length; i++) rms += ((wave[i] - 128) / 128) ** 2;
		rms = Math.sqrt(rms / wave.length);
		// резкий рост баса — удар
		const f = Math.max(0, low - prevLow);
		prevLow = low;
		flux.push(f);
		if (flux.length > 45) flux.shift();
		const mean = flux.reduce((s, x) => s + x, 0) / flux.length;
		const sd = Math.sqrt(flux.reduce((s, x) => s + (x - mean) ** 2, 0) / flux.length);
		if (f > mean + 1.5 * sd && f > 8 && low > 70 && rms > 0.01 && t - lastOnset > MIN_GAP) {
			lastOnset = t;
			onsets.push(t);
			while (onsets.length && t - onsets[0] > 8) onsets.shift();
			const p = tempo();
			if (p) {
				period += (p - period) * 0.35;
				playing = true;
			}
			// подстраиваем такт под настоящий удар
			const err = Math.round(beatPos) - beatPos;
			if (Math.abs(err) < 0.4) beatPos += err * 0.4;
		}
		if (playing && t - lastOnset > QUIET) playing = false;
	};

	return {
		get playing() {
			return manual || playing;
		},
		get period() {
			return period;
		},
		get manual() {
			return manual;
		},
		beat: () => beatPos,
		// включить: 'mic' — микрофон разрешён, 'manual' — микрофона нет, танцует сам
		start: async () => {
			lastT = now();
			cancelAnimationFrame(raf);
			raf = requestAnimationFrame(tick);
			try {
				if (!navigator.mediaDevices?.getUserMedia) throw new Error('nomic');
				stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
				ctx = new (window.AudioContext || window.webkitAudioContext)();
				if (ctx.state === 'suspended') await ctx.resume();
				const src = ctx.createMediaStreamSource(stream);
				analyser = ctx.createAnalyser();
				analyser.fftSize = 2048;
				analyser.smoothingTimeConstant = 0;
				analyser.minDecibels = -90;
				analyser.maxDecibels = -15;
				src.connect(analyser); // только слушаем: в динамики ничего не идёт
				freq = new Uint8Array(analyser.frequencyBinCount);
				wave = new Uint8Array(analyser.fftSize);
				const bin = ctx.sampleRate / analyser.fftSize;
				lo = Math.max(1, Math.round(45 / bin));
				hi = Math.max(lo + 1, Math.round(170 / bin));
				manual = false;
				return 'mic';
			} catch (err) {
				manual = true;
				period = 0.5;
				return err?.name === 'NotAllowedError' ? 'denied' : 'nomic';
			}
		},
		stop: () => {
			cancelAnimationFrame(raf);
			stream?.getTracks().forEach((tr) => tr.stop());
			ctx?.close().catch(() => {});
			stream = null;
			ctx = null;
			analyser = null;
			manual = false;
			playing = false;
			onsets.length = 0;
			flux.length = 0;
		},
	};
};
