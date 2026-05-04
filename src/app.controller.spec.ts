import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = app.get<HealthController>(HealthController);
  });

  describe('getHealth', () => {
    it('should return API health status', () => {
      const result = controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.app).toBe("Docto'Loman API");
      expect(result.environment).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});