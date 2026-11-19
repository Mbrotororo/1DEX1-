import {timelineComposition} from './core/player';
import {ALL_SCENES} from './scenes/registry';

// Весь ролик: один ThreeCanvas, сцены по timeline.ts, звуковая дорожка public/audio/soundtrack.wav
export const rushVideoComposition = () => timelineComposition('RushVideo', ALL_SCENES);
