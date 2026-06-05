import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function parseCorsOrigins(value?: string) {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const port = Number(configService.get<string>('PORT') ?? 3000);
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const corsOrigins = parseCorsOrigins(
    configService.get<string>('CORS_ORIGINS'),
  );

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin:
      corsOrigins.length > 0
        ? corsOrigins
        : nodeEnv === 'production'
          ? false
          : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Docto'Loman API")
    .setDescription(
      "API backend Docto'Loman : application mobile, application web et administration.",
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port, '0.0.0.0');

  console.log(
    `Docto'Loman API running on port ${port} with prefix /api/v1`,
  );
  console.log(`Swagger running on /docs`);
  console.log(`Environment: ${nodeEnv}`);
}

void bootstrap();