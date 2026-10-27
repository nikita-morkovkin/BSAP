import type { GreetingConfig } from '../types/greeting-config.type';
import type { VideoStyleConfig } from '../types/video-style.type';

export const greetingCompositeFilter = (
  config: GreetingConfig,
  style: VideoStyleConfig,
  duration: number,
): string => {
  const pip = config.pip;
  const size = Math.round((style.height * pip.sizePctOfHeight) / 200) * 2;
  const margin = Math.round((style.height * pip.marginPct) / 100);
  const x =
    pip.position === 'center'
      ? '(W-w)/2'
      : pip.position.endsWith('left')
        ? String(margin)
        : `W-w-${margin}`;
  const y =
    pip.position === 'center'
      ? '(H-h)/2'
      : pip.position.startsWith('top')
        ? String(margin)
        : `H-h-${margin}`;
  const fadeOut = Math.max(
    0,
    duration -
      (config.placement === 'intro_fullscreen'
        ? config.crossfadeSec
        : pip.fadeOutSec),
  );
  const fadeLength =
    config.placement === 'intro_fullscreen'
      ? config.crossfadeSec
      : pip.fadeOutSec;
  const fades = `${pip.fadeInSec > 0 ? `,fade=t=in:st=0:d=${pip.fadeInSec}:alpha=1` : ''}${fadeLength > 0 ? `,fade=t=out:st=${fadeOut}:d=${fadeLength}:alpha=1` : ''}`;

  if (config.placement === 'intro_fullscreen') {
    return `[1:v]scale=${style.width}:${style.height}:force_original_aspect_ratio=decrease,pad=${style.width}:${style.height}:(ow-iw)/2:(oh-ih)/2:color=0x061020,format=rgba${fades}[character];[0:v][character]overlay=0:0:eof_action=pass:repeatlast=0[out]`;
  }

  const radius = size / 2;
  const edge = Math.max(1, size * pip.feather);

  return `[1:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((${radius}-hypot(X-${radius},Y-${radius}))/${edge},0,1)'${fades}[character];[0:v][character]overlay=x=${x}:y=${y}:eof_action=pass:repeatlast=0[out]`;
};
