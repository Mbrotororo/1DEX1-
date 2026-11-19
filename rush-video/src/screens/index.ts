// Экраны ПК: рабочий стол, Minecraft, Discord, OBS — чистые функции рисования на canvas + React-обёртки.
// Описание — src/screens/README.md.

export {UI_FONT, loadScreenAssets, screenAssets, useScreenAssets, type ScreenAssets} from './assets';
export {SW, SH, paintScreen, cursorAt, pressAt, drawCursor, drawRipples, greek, text, windowIn, type Ctx, type ScreenDraw, type CursorKey, type Click} from './draw';
export {drawPixelText, pixelWidth, type PixelTextOpts} from './pixelfont';
export {DESKTOP_ICONS, drawDesktop, drawTaskbar, drawAppIcon, type AppId, type DesktopState} from './desktop';
export {MC_MENU, MC_LIST, mcButton, drawMcLoading, drawMcMenu, drawMcServers, drawMcConnecting, drawMcGame, loadingCurve, type McListState} from './minecraft';
export {CHAT_VOICE_ROW, CHAT_TEXT_ROW, drawChat, speakingAt, type ChatState} from './discord';
export {OBS_REC_BUTTON, drawObs, recClock, type ObsState} from './obs';
export {renderGame, drawGame} from './game';
export {
	PC_TIMING,
	PC_SCRIPT,
	makePcScript,
	drawPcWith,
	drawPC,
	drawB3,
	drawB4,
	drawB6,
	pcScreenAt,
	pcGlowColor,
	pcPOV,
	type PcTiming,
	type PcScript,
	type PcScreen,
	type PovCamera,
} from './sequence';
export {useScreenTexture, ScreenQuad, ScreenPOV, type ScreenTextureOpts, type ScreenPOVProps} from './react';
