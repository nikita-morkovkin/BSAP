import { z } from 'zod';

export const artifactPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !/[\\:]/.test(value) &&
      [...value].every((character) => character.charCodeAt(0) >= 32) &&
      value
        .split('/')
        .every(
          (segment) => segment !== '' && segment !== '.' && segment !== '..',
        ),
    'Expected a project-relative artifact path without traversal',
  );
