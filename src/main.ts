import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation pipes globally
  app.useGlobalPipes(new ValidationPipe());

  app.enableCors();

  // Set up Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('NOdeSweep API')
    .setDescription('API for managing and cleaning node_modules directories')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`NOdeSweep API is running on: http://localhost:${port}`);
}

bootstrap();
