import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as util from 'util';
import * as Sentry from '@sentry/node';

// Global process-level handlers to capture unexpected rejections/exceptions
// Initialize Sentry if DSN is provided
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0) });
}

process.on('unhandledRejection', (reason) => {
  try {
    console.error('UNHANDLED_REJECTION', util.inspect(reason, { depth: 6 }));
    if (SENTRY_DSN) Sentry.captureException(reason);
  } catch (e) {
    console.error('UNHANDLED_REJECTION', reason);
  }
});
process.on('uncaughtException', (err) => {
  try {
    console.error('UNCAUGHT_EXCEPTION', util.inspect(err, { depth: 6 }));
    if (SENTRY_DSN) Sentry.captureException(err);
  } catch (e) {
    console.error('UNCAUGHT_EXCEPTION', err);
  }
});
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { MetricsService } from './common/metrics/metrics.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Request logging middleware for observability
  const metricsService = app.get(MetricsService);
  const loggingMiddleware = new RequestLoggingMiddleware(metricsService);
  app.use(loggingMiddleware.use.bind(loggingMiddleware));

  // Cookie parser to read HttpOnly refresh tokens
  app.use(cookieParser());

  // CORS
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow non-browser requests (Postman/mobile native) without Origin header.
      if (!origin) return callback(null, true);

      // In development, allow all origins to simplify Expo web/native testing.
      if (process.env.NODE_ENV !== 'production') return callback(null, true);

      if (configuredOrigins?.includes(origin)) return callback(null, true);

      return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  // Swagger (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Calorie AI VN API')
      .setDescription('API phân tích calo đồ ăn Việt Nam')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
