import { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export function configurarBodyParsers(app: INestApplication): void {
  app.use(json({ limit: '1mb', inflate: false }));
  app.use(urlencoded({ extended: true, limit: '1mb', inflate: false }));
}
