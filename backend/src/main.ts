import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { parse } from 'yaml';
import { AppModule } from './app.module';
import { DatabaseService } from './database/database.service';
import { publicCacheControl } from './http/public-cache-headers.decorator';
import { uploadDir, uploadUrl } from './rooms/room-management';

const apiPrefix = 'api/v1';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const specPath = resolve(__dirname, '../../docs/api/openapi.yaml');
  const spec = parse(await readFile(specPath, 'utf8')) as OpenAPIObject;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false });

  try {
    await app.get(DatabaseService).checkConnection();

    // CSP выключен: сервер отдаёт JSON и Swagger UI со встроенными скриптами; CSP фронта задаёт Nginx.
    app.use(helmet({ contentSecurityPolicy: false }));
    // За обратным прокси ограничения частоты должны считаться по адресу клиента, а не прокси.
    const proxies = Number(process.env.TRUST_PROXY ?? 0);
    if (proxies > 0) app.set('trust proxy', proxies);
    const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    if (origins.length) app.enableCors({ origin: origins });
    app.useStaticAssets(uploadDir, { prefix: uploadUrl, index: false, immutable: true, maxAge: '365d' });

    app.setGlobalPrefix(apiPrefix);
    app.set('etag', 'weak');
    app.use(`/${apiPrefix}`, compression({
      threshold: 512,
      level: 4,
      filter: (request, response) => response.statusCode === 200
        && response.getHeader('Cache-Control') === publicCacheControl
        && compression.filter(request, response),
    }));

    SwaggerModule.setup('api/docs', app, {
      ...spec,
      servers: [{ url: `/${apiPrefix}` }],
    });

    app.enableShutdownHooks();
    await app.listen(port);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: Error) => {
  Logger.error(error.message, 'Bootstrap');
  process.exitCode = 1;
});
