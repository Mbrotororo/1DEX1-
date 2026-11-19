import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

// Звуки сцены s3-wipe: локальное время, имена — пути в ассетах Minecraft (npm run sounds -- --find <слово>).
// Пока это заглушка: щелчок на появлении названия.
const s = sfx();
s.add(BEATS.title, 'random/pop', 0.6);
s.add(BEATS.title + 0.6, 'random/orb', 0.4);

export const events = s.events;
