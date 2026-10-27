import type { EffectDef } from '../types/effect.type';
import type { VideoStyleConfig } from '../types/video-style.type';

export const effectFilter = (
  effects: EffectDef[],
  style: VideoStyleConfig,
  base: string,
): string[] => {
  const filters: string[] = [];
  let label = base;

  for (const [index, effect] of effects.entries()) {
    const width = Math.round((style.width * effect.scale) / 2) * 2;
    const height = Math.round((style.height * effect.scale) / 2) * 2;
    const alpha = effect.blend === 'overlay_alpha';
    const opacity = alpha ? `,colorchannelmixer=aa=${effect.opacity}` : '';

    filters.push(
      `[${index + 1}:v]setpts=(PTS-STARTPTS)/${effect.speed},fps=${style.fps},scale=${width}:${height},crop=min(iw\\,${style.width}):min(ih\\,${style.height}),pad=${style.width}:${style.height}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,format=rgba,lutrgb=r='min(val,${effect.maxBrightness * 255})':g='min(val,${effect.maxBrightness * 255})':b='min(val,${effect.maxBrightness * 255})'${opacity},settb=AVTB[fx${index}]`,
    );
    filters.push(
      alpha
        ? `[${label}][fx${index}]overlay=shortest=1[blend${index}]`
        : `[${label}][fx${index}]blend=all_mode=${effect.blend === 'add' ? 'addition' : 'screen'}:all_opacity=${effect.opacity}:shortest=1[blend${index}]`,
    );

    label = `blend${index}`;
  }

  filters.push(
    `[${label}]${style.vignetteEnabled ? `vignette=angle=${style.vignetteAngle},` : ''}${style.antiBanding ? 'gradfun=strength=1.0:radius=16,noise=alls=2:allf=t,' : ''}format=yuv420p[outv]`,
  );

  return filters;
};
