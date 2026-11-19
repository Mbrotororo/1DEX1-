// Ядро ролика: всё, что нужно авторам сцен. Импорт: import {...} from '../../core';
// Описание — в CORE_API.md.

export * from './anim';
export * from './rng';
export * from './scene';
export * from './camera';
export * from './env';
export {Environment, type EnvironmentProps} from './Environment';
export {TEX, paintTexture, dataTexture, imageTexture} from './textures';

// воксели
export {B, BLOCKS, defineBlock, blockByName, blockName, type BlockDef, type BlockSpec, type BlockName} from './voxel/blocks';
export {defineTile, defineSpriteTile, tileIndex, tileData, shade, mixRgb, type Painter} from './voxel/tiles';
export {getAtlas} from './voxel/atlas';
export {VoxelWorld, makeBands, bandBlocks, defaultStrata, strata, type BlockInst, type Bands} from './voxel/world';
export {buildVoxelMeshes, collectLights, FACE_SHADE, FACE_SHADES, type BakedLight, type MeshOptions, type VoxelMeshes} from './voxel/mesher';
export {VoxelMesh, type VoxelMeshProps} from './voxel/VoxelMesh';
export {InstancedBlocks, type BlockAnim, type InstancedBlocksProps} from './voxel/InstancedBlocks';
export {BandWave, waveSplit, blockProgress, type BandWaveProps, type WaveMode} from './voxel/BandWave';
export {oakTree, birchTree, spruceTree, cherryTree, newYearTree, type NewYearTree, type TreeLight} from './voxel/builders';
export {WaterSurface, type WaterSurfaceProps} from './voxel/Water';

// персонажи и предметы
export {Humanoid, Humanoid as Player, headTop, PX, PLAYER_HEIGHT, EYE_HEIGHT, type HumanoidProps} from './chars/Humanoid';
export * from './chars/poses';
export {makePath, type Path, type PathKey, type PathState} from './chars/path';
export {getSkin, imageSkin, type Skin, type SkinName, type SkinBuild} from './chars/skins';
export {NameTag, BlobShadow, shadowFor, Glow, type NameTagProps} from './chars/extras';
export {Pig, Breeze, type PigProps, type BreezeProps} from './chars/mobs';
export {Torch, Lantern, TrialSpawner, Vault, Chest, Door, CopperGate, TreeLights, Mace, IceCube, flicker} from './props';
export {PixelItem, itemTexture, type PixelItemProps} from './items/PixelItem';
export {ART, potionArt, SPEED_POTION, type ItemArt, type ItemName} from './items/art';

// частицы и эффекты
export {Particles, Burst, Trail, Sparkles, PotionSwirl, PortalParticles, type ParticlesProps, type ParticleOut, type BurstProps, type TrailProps, type SparklesProps} from './fx/Particles';
export {Snowfall, FlakeStream, type SnowfallProps, type FlakeStreamProps, type FlakeSource} from './fx/Snow';
export {Poof, Shockwave, LightBeam, Rocket, Firework} from './fx/Effects';

// надписи и интерфейс
export {VoxelText, shadedBox, type VoxelTextProps} from './hud/VoxelText';
export {HudLayer, ExtrudedLogo} from './hud/HudLayer';
export {layoutText, textWidth, hasGlyph, FONT_CAP} from './hud/font';
export * from './hud/dom';
export {BADGE_AREA} from './player';
