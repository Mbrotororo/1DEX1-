import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCrf(18);
// 3D рендерится через WebGL. 'swangle' — программный рендер, работает на любом
// компьютере. С видеокартой быстрее: npm run render -- --gl=angle-egl
Config.setChromiumOpenGlRenderer('swangle');
Config.setOverwriteOutput(true);
