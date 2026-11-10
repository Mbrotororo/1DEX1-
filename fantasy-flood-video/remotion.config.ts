import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCrf(17);
// 3D рендерится через WebGL. 'swangle' — программный рендер, работает на любом
// компьютере. Если есть видеокарта, можно ускорить: npm run render -- --gl=angle-egl
Config.setChromiumOpenGlRenderer('swangle');
Config.setOverwriteOutput(true);
