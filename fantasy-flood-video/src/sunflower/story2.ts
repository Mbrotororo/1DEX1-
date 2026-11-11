// «Не свети. Часть 2: Обмен» — герой первой части возвращается за Серёгой.
// Формат тот же, что в story.ts: ^жёлтый^, *красный*, label — надпись сверху.
import {Beat, buildStory} from './story';

export const BEATS2: Beat[] = [
	{scene: 'hook2', text: 'Через год я вернулся ^на это поле.^', sfx: [{src: 'hit', volume: 0.6}]},
	{scene: 'hook2', text: 'Чтобы *посветить.* ^Нарочно.^', pause: 0.6, sfx: [{src: 'click', at: 0.1}, {src: 'stinger', at: 0.9, volume: 0.8}]},

	{scene: 'dream', text: 'Каждую ночь мне снился ^первый ряд.^', label: 'ГОД СПУСТЯ'},
	{scene: 'dream', text: 'И один подсолнух, ^который не спал.^'},
	{scene: 'dream', text: 'Термос Серёги ^стоял у меня на полке.^', pause: 0.4},

	{scene: 'farmer', text: 'Фермер узнал меня ^сразу.^'},
	{scene: 'farmer', text: 'И сказал только: ^уезжай.^', pause: 0.3},
	{scene: 'farmerFace', text: 'Я не уехал.'},
	{scene: 'farmerFace', text: 'Тогда он рассказал ^правду.^', pause: 0.4},
	{scene: 'truth', text: 'Поле всегда держит ^сорок.^', label: 'ПРАВДА'},
	{scene: 'truth', text: 'Чтобы один вышел — *один должен встать.*', pause: 0.6, sfx: [{src: 'hit', at: 1.2, volume: 0.7}]},

	{scene: 'rule1b', text: 'Первое: найди его ^до двух ночи.^', label: 'ПРАВИЛО 1', sfx: [{src: 'click', at: 0.2}]},
	{scene: 'rule2b', text: 'Второе: позови по имени. ^Только его.^', label: 'ПРАВИЛО 2'},
	{scene: 'rule3b', text: 'Третье: когда он выйдет, ^пусть не оборачивается.^', label: 'ПРАВИЛО 3', pause: 0.5},

	{scene: 'walkIn', text: 'В полночь я включил фонарь', sfx: [{src: 'click', at: 0.3}]},
	{scene: 'walkIn', text: 'и пошёл ^в поле.^', sfx: [{src: 'rustle', at: 0}, {src: 'rustle', at: 1.2, rate: 0.9}]},
	{scene: 'faces', text: 'Я светил в каждый подсолнух.', sfx: [{src: 'rustle', at: 0.4, rate: 1.1}]},
	{scene: 'faces', text: '*У всех были лица.*', pause: 0.5, sfx: [{src: 'stinger', at: 0, volume: 0.7}]},

	{scene: 'thing', text: 'Оно шло рядом. ^За соседним рядом.^', sfx: [{src: 'steps', at: 0, rate: 0.7}]},
	{scene: 'thing', text: 'И звало меня. ^Голосом Серёги.^', sfx: [{src: 'whisper', at: 0.5, rate: 0.8}]},
	{scene: 'thing', text: '*Голосом мамы.*', sfx: [{src: 'whisper', at: 0, rate: 0.9}]},
	{scene: 'thing', text: '*Моим голосом.*', pause: 0.5, sfx: [{src: 'whisper', at: 0, rate: 0.7, volume: 1}, {src: 'heart', at: 0.4}]},

	{scene: 'found', text: 'Без восьми два'},
	{scene: 'found', text: 'я нашёл подсолнух ^в вязаной шапке.^', pause: 0.4},
	{scene: 'knitFace', text: 'Я позвал: ^«Серёга».^', sfx: [{src: 'whisper', at: 0.2, volume: 0.5, rate: 1.1}]},
	{scene: 'knitFace', text: 'Подсолнух ^поднял голову^', sfx: [{src: 'rustle', at: 0}]},
	{scene: 'knitFace', text: 'и сказал: *«Зачем ты пришёл?»*', pause: 0.6, sfx: [{src: 'whisper', at: 0.8, rate: 0.85}]},

	{scene: 'exchange', text: 'Ноги ушли ^в землю.^', sfx: [{src: 'rustle', at: 0, rate: 0.6}, {src: 'hit', at: 0.6, volume: 0.5}]},
	{scene: 'exchange', text: 'Стало тепло ^и очень тихо.^'},
	{scene: 'exchange', text: 'Серёга вышел из ряда.', sfx: [{src: 'steps', at: 0.2}]},
	{scene: 'exchange', text: 'Я сказал: ^«Иди. Не оборачивайся».^', pause: 0.8},

	{scene: 'dawn2', text: 'Утром Серёга сел ^в машину фермера.^', label: 'УТРО', sfx: [{src: 'birds', at: 0, volume: 0.6}]},
	{scene: 'dawn2', text: 'С термосом.'},
	{scene: 'dawn2', text: 'Он ^не обернулся.^'},
	{scene: 'dawn2', text: 'Как я и просил.', pause: 0.6},

	{scene: 'finalCount', text: 'Фермер пересчитал первый ряд.'},
	{scene: 'finalCount', text: '^Сорок.^ Как всегда.', pause: 0.3},
	{scene: 'hoodFace', text: 'Последний — ^в синем капюшоне.^', sfx: [{src: 'hit', volume: 0.7}]},
	{scene: 'hoodFace', text: '*Это я.*', pause: 0.8},
	{scene: 'end2', text: 'Если будешь в этом поле —'},
	{scene: 'end2', text: '^посчитай.^ *И не свети.*', pause: 2.4, sfx: [{src: 'whisper', at: 0, rate: 0.9}]},
];

export const PART2 = buildStory(BEATS2);
