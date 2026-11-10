import {Config} from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCrf(17);
// 3D рендерится через WebGL — в headless-режиме нужен ANGLE
Config.setChromiumOpenGlRenderer('angle');
Config.setOverwriteOutput(true);
