// Реквизит дома (блочные модели, 1 пиксель = 1/16 блока). Описание — src/sets/house/README.md.
export {FrontDoor, BedroomDoor, SwingDoor, slamOpen, type FrontDoorProps, type BedroomDoorProps, type SwingDoorProps} from './doors';
export {WallClock, CorkNote, CoatHooks, ShoeBench, Candle, Poster, Painting, type WallClockProps, type CorkNoteProps, type CoatHooksProps, type CandleProps, type PosterProps} from './wall';
export {Beanie, Backpack, Headphones, Book, type BeanieProps, type BackpackProps, type HeadphonesProps, type BookProps} from './wear';
export {Desk, Monitor, PcTower, Keyboard, Mouse, Mousepad, Microphone, DeskLamp, HeadphoneStand, rgbHue, DESK_TOP, SCREEN_W, SCREEN_H, SCREEN_Y, SCREEN_Z, STAND_TOP, STAND_HEADPHONES_Y, type DeskProps, type MonitorProps, type PcTowerProps, type KeyboardProps} from './pc';
export {GamingChair, chairSeat, SEAT_HEIGHT, SEAT_HIP, type GamingChairProps} from './chair';
export {CameraTripod, tripodLens, LENS, type CameraTripodProps} from './camera';
export {Banister, type BanisterProps} from './stairs';
export {Bed, BED_TOP, BookStack, Mug, Plant, type BedProps, type BookStackProps} from './decor';
export {placeholderScreen} from './screen';
