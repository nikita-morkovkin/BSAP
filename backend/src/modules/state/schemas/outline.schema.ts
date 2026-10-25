import { z } from 'zod';

export const outlineSchema = z
  .strictObject({
    topic: z.string().trim().min(1),
    totalChapters: z.number().int().positive(),
    chapters: z
      .array(
        z.strictObject({
          chapterNumber: z.number().int().positive(),
          title: z.string().trim().min(1),
          keyScientificFacts: z.array(z.string().trim().min(1)),
          sensoryThemes: z.array(z.string().trim().min(1)),
          targetWordCount: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .refine(
    (outline) =>
      outline.totalChapters === outline.chapters.length &&
      outline.chapters.every(
        (chapter, index) => chapter.chapterNumber === index + 1,
      ),
    {
      message: 'Chapters must be sequential and match totalChapters',
      path: ['chapters'],
    },
  );
