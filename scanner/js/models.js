// Загрузка нейросетей. Всё работает прямо на телефоне, кадры никуда не уходят.

const MP_VERSION = '0.10.35';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const FACEAPI_VERSION = '1.7.15';
const FACEAPI_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACEAPI_VERSION}`;

// fetch с прогрессом: onProgress(0..1)
async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress && onProgress(1);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress && onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  onProgress && onProgress(1);
  return out;
}

let vision = null;
async function getVision() {
  if (!vision) vision = await import(`${MP_URL}/vision_bundle.mjs`);
  return vision;
}

async function createWithFallback(Klass, fileset, buffer, opts) {
  try {
    return await Klass.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buffer, delegate: 'GPU' }, ...opts,
    });
  } catch (e) {
    console.warn('GPU недоступен, переключаюсь на CPU', e);
    return await Klass.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buffer, delegate: 'CPU' }, ...opts,
    });
  }
}

// progress(key, value 0..1 | 'ok' | 'err')
export async function loadVision(progress) {
  const mp = await getVision();
  progress('runtime', 0.5);
  const fileset = await mp.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
  progress('runtime', 'ok');

  const [poseBuf, faceBuf] = await Promise.all([
    fetchBytes(POSE_MODEL, (p) => progress('pose', p)),
    fetchBytes(FACE_MODEL, (p) => progress('face', p)),
  ]);

  const pose = await createWithFallback(mp.PoseLandmarker, fileset, poseBuf, {
    runningMode: 'VIDEO',
    numPoses: 4,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  progress('pose', 'ok');

  const face = await createWithFallback(mp.FaceLandmarker, fileset, faceBuf, {
    runningMode: 'VIDEO',
    numFaces: 4,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  progress('face', 'ok');

  return {
    pose,
    face,
    POSE_CONNECTIONS: mp.PoseLandmarker.POSE_CONNECTIONS,
    FACE_TESSELATION: mp.FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    FACE_CONTOURS: mp.FaceLandmarker.FACE_LANDMARKS_CONTOURS,
  };
}

// Нейросеть возраста (face-api / AgeGenderNet). Грузится после основных,
// чтобы камера запускалась быстрее.
export async function loadAge(progress) {
  progress('age', 0.2);
  const faceapi = await import(`${FACEAPI_URL}/dist/face-api.esm.js`);
  try {
    await faceapi.tf.setBackend('webgl');
  } catch (e) {
    await faceapi.tf.setBackend('cpu');
  }
  await faceapi.tf.ready();
  progress('age', 0.6);
  await faceapi.nets.ageGenderNet.loadFromUri(`${FACEAPI_URL}/model`);
  progress('age', 'ok');
  return faceapi;
}
