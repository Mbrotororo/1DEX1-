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
