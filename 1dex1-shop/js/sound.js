// Звук ломания блока. Синтезируется прямо в браузере, файлов не нужно.
// Браузеры разрешают звук только после первого клика — ломание блока им и является.
let ctx;

export const breakSound = () => {
	try {
		ctx ||= new (window.AudioContext || window.webkitAudioContext)();
		if (ctx.state === 'suspended') ctx.resume();
		const dur = 0.17;
		const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
		const src = ctx.createBufferSource();
		src.buffer = buf;
		src.playbackRate.value = 0.8 + Math.random() * 0.5;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 1700;
		const gain = ctx.createGain();
		gain.gain.value = 0.32;
		src.connect(lp).connect(gain).connect(ctx.destination);
		src.start();
	} catch {
		// звук не обязателен
	}
};

// Удар по экрану: низкий «бум» и хруст стекла. kind: punchR / punchL / head / kick — разный тембр
export const punchSound = (kind = 'punchR') => {
	try {
		ctx ||= new (window.AudioContext || window.webkitAudioContext)();
		if (ctx.state === 'suspended') ctx.resume();
		const t0 = ctx.currentTime;
		const boom = ctx.createOscillator();
		const bg = ctx.createGain();
		boom.type = 'sine';
		boom.frequency.setValueAtTime(kind === 'head' ? 80 : kind === 'kick' ? 130 : 110, t0);
		boom.frequency.exponentialRampToValueAtTime(38, t0 + 0.35);
		const vol = kind === 'grab' ? 0.45 : 1; // хватается за край дыры — тише, чем удар
		bg.gain.setValueAtTime(0.55 * vol, t0);
		bg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
		boom.connect(bg).connect(ctx.destination);
		boom.start(t0);
		boom.stop(t0 + 0.5);
		// стекло: короткие высокие щелчки один за другим
		const dur = 0.6;
		const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
		const data = buf.getChannelData(0);
		for (let c = 0; c < 9; c++) {
			const at = Math.floor(ctx.sampleRate * (Math.random() * 0.35));
			const len = Math.floor(ctx.sampleRate * (0.01 + Math.random() * 0.04));
			for (let i = 0; i < len && at + i < data.length; i++) data[at + i] += (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (0.6 + Math.random() * 0.4);
		}
		const src = ctx.createBufferSource();
		src.buffer = buf;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 2400;
		const g = ctx.createGain();
		g.gain.value = 0.32 * vol;
		src.connect(hp).connect(g).connect(ctx.destination);
		src.start(t0 + 0.02);
	} catch {
		// звук не обязателен
	}
};

// Стекло лопнуло и посыпалось: громкий хруст, потом звон падающих осколков
export const shatterSound = () => {
	try {
		ctx ||= new (window.AudioContext || window.webkitAudioContext)();
		if (ctx.state === 'suspended') ctx.resume();
		const t0 = ctx.currentTime;
		const dur = 1.6;
		const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
		const data = buf.getChannelData(0);
		// хруст в начале
		for (let i = 0; i < ctx.sampleRate * 0.25; i++) data[i] += (Math.random() * 2 - 1) * Math.pow(1 - i / (ctx.sampleRate * 0.25), 2) * 0.9;
		// звон: короткие высокие «тинь» в случайные моменты
		for (let c = 0; c < 28; c++) {
			const at = Math.floor(ctx.sampleRate * (0.15 + Math.random() * 1.3));
			const f = 2500 + Math.random() * 4500;
			const len = Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.08));
			const amp = 0.25 + Math.random() * 0.35;
			for (let i = 0; i < len && at + i < data.length; i++) data[at + i] += Math.sin((2 * Math.PI * f * i) / ctx.sampleRate) * Math.exp(-i / (len * 0.25)) * amp;
		}
		const src = ctx.createBufferSource();
		src.buffer = buf;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 900;
		const gain = ctx.createGain();
		gain.gain.value = 0.35;
		src.connect(hp).connect(gain).connect(ctx.destination);
		src.start(t0);
	} catch {
		// звук не обязателен
	}
};
