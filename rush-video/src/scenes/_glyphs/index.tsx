import {ENV, Environment, HudLayer, PixelText, VoxelText, lookCam, type SceneDef} from '../../core';

// Проверка шрифта (не входит в ролик): все знаки объёмным (VoxelText) и плоским (PixelText) текстом.
// Смотреть: npm run shots -- --scene=glyphs --full 0.5

const LINES = [
	'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
	'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
	'abcdefghijklmnopqrstuvwxyz',
	'. , ! ? : ; - – — − · % + / ( ) « » … \' " = < > # *',
	'21 НОЯБРЯ · 13:00 МСК   УРОН БУЛАВЫ −50%',
	'ТГК: ЖИЗНЬ 1DEX1   mc.holyworld.ru',
	'СКОРОСТЬ III — УДАЛЕНО   ОБНОВЛЁННЫЙ ЗАМОК',
];

export const scene: SceneDef = {
	id: 'glyphs',
	duration: 2,
	camera: () => lookCam([0, 0, 10], [0, 0, 0]),
	World: ({t, cam}) => (
		<>
			<Environment env={ENV.night} cam={cam} t={t} />
			<HudLayer cam={cam}>
				{LINES.map((line, i) => (
					<VoxelText key={i} text={line} t={t} px={5.2} depth={1.6} top="#ffffff" bottom="#ffd86b" body="#5a2408" enter="none" wobble={0} position={[0, 470 - i * 68, 0]} />
				))}
			</HudLayer>
		</>
	),
	Overlay: () => (
		<>
			{LINES.map((line, i) => (
				<PixelText key={i} x={960} y={600 + i * 66} size={50} color="#ffffff" color2="#9fd0ff">
					{line}
				</PixelText>
			))}
		</>
	),
};
