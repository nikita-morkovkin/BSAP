import { NestFactory } from '@nestjs/core';
import { AppModule } from './core/app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await app.listen(process.env.BACKEND_PORT ?? 3000);
}

void bootstrap();
