import { Injectable } from '@nestjs/common';

export type HealthStatus = {
  status: 'ok';
  app: string;
  version: string;
  environment: string;
  timestamp: string;
  uptimeSeconds: number;
};

@Injectable()
export class HealthService {
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      app: "Docto'Loman API",
      version: process.env.npm_package_version ?? '0.0.1',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}