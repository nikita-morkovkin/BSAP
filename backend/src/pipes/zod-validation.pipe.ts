import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: z.ZodType) {}

  public transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const metatype = metadata.metatype;
    const schema =
      this.schema ??
      (metatype && 'schema' in metatype ? metatype.schema : undefined);

    if (!(schema instanceof z.ZodType)) {
      return value;
    }

    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues,
      });
    }

    return result.data;
  }
}
