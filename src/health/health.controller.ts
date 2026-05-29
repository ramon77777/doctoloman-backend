import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { HealthStatus } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: "Vérifier l'état de l'API Docto'Loman",
  })
  @ApiOkResponse({
    description: 'API disponible.',
    schema: {
      example: {
        status: 'ok',
        app: "Docto'Loman API",
        version: '0.0.1',
        environment: 'development',
        timestamp: '2026-05-04T12:00:00.000Z',
        uptimeSeconds: 12,
      },
    },
  })
  getHealth(): HealthStatus {
    return this.healthService.getHealth();
  }
}
