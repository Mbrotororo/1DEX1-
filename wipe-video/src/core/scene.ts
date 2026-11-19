import type React from 'react';
import type * as THREE from 'three';
import type {CameraState} from './camera';
import type {Skin} from './chars/skins';

// Каркас сцены. Сцена — это камера (чистая функция времени), 3D-мир и плоский слой интерфейса.

export type Assets = {
	// скин героя 1DEX1 (public/skin.png, тонкие руки)
	skin: Skin;
	// логотип HolyWorld: текстура для 3D и адрес картинки для DOM (<img src>)
	holyworld: THREE.Texture;
	holyworldUrl: string;
};

export type SceneProps = {
	// локальное время сцены, секунды (0 … duration)
	t: number;
	// камера этого кадра (то, что вернула scene.camera(t))
	cam: CameraState;
	assets: Assets;
	// длительность сцены, секунды
	duration: number;
};

export type SceneDef = {
	// id сцены: как в timeline.ts ('s1-hook', ...). Только латиница, цифры и дефис.
	id: string;
	// длительность — только для сцен вне таймлайна (демо); у остальных берётся из timeline.ts
	duration?: number;
	// камера: чистая функция локального времени (включая fov)
	camera: (t: number) => CameraState;
	// 3D-содержимое (рисуется внутри общего ThreeCanvas)
	World: React.FC<SceneProps>;
	// плоский слой поверх 3D (DOM, координаты 1920x1080)
	Overlay?: React.FC<SceneProps>;
};

// Построить тяжёлое один раз при первом обращении (мир, геометрии): const getWorld = once(() => build());
// Результат живёт до конца рендера и общий для всех сцен, которые вызывают один и тот же геттер.
export const once = <T,>(make: () => T): (() => T) => {
	let value: T | undefined;
	let done = false;
	return () => {
		if (!done) {
			value = make();
			done = true;
		}
		return value as T;
	};
};
