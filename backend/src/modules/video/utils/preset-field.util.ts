export const presetField = (
  kind: string,
  seed: number,
  width: number,
  height: number,
): Buffer => {
  const pixels = Buffer.alloc(width * height);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;

    return state / 4294967296;
  };

  if (kind === 'light_rays') {
    const phase = random() * Math.PI * 2;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        pixels[y * width + x] = Math.round(
          75 *
            Math.pow(
              Math.max(
                0,
                Math.sin(2 * Math.PI * ((x / width) * 4 + y / height) + phase),
              ),
              12,
            ),
        );
      }
    }
  } else {
    const count =
      kind === 'marine_snow' ? 130 : kind === 'dust_motes' ? 70 : 40;

    for (let index = 0; index < count; index += 1) {
      const cx = random() * width;
      const cy = random() * height;
      const radius =
        kind === 'bubbles_rising' ? 2 + random() * 5 : 0.6 + random() * 1.2;
      const brightness = 70 + random() * 130;
      const extent = Math.ceil(radius + 2);

      for (let dy = -extent; dy <= extent; dy += 1) {
        for (let dx = -extent; dx <= extent; dx += 1) {
          const distance = Math.hypot(dx, dy);
          const weight =
            kind === 'bubbles_rising'
              ? Math.max(0, 1 - Math.abs(distance - radius))
              : Math.max(0, 1 - distance / radius);
          const x = (((Math.round(cx) + dx) % width) + width) % width;
          const y = (((Math.round(cy) + dy) % height) + height) % height;

          pixels[y * width + x] = Math.min(
            220,
            pixels[y * width + x] + Math.round(brightness * weight),
          );
        }
      }
    }
  }

  return Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`), pixels]);
};
