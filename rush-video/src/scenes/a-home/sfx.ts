import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Звуки сцены a-home: локальное время, имена — пути в ассетах Minecraft (npm run sounds -- --find <слово>).
const s = sfx();
s.add(BEATS.title, 'random/pop', 0.6);

export const events = s.events;
