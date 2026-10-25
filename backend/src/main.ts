import { NestFactory } from '@nestjs/core';
import { AppModule } from './core/app/app.module';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    exposedHeaders: [
      'Content-Disposition',
      'Content-Length',
      'Content-Range',
      'Accept-Ranges',
    ],
  });
  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(process.env.BACKEND_PORT ?? 3000);
}

void bootstrap();
