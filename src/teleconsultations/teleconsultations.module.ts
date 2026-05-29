import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeleconsultationsController } from './teleconsultations.controller';
import { TeleconsultationsService } from './teleconsultations.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [TeleconsultationsController],
  providers: [TeleconsultationsService],
  exports: [TeleconsultationsService],
})
export class TeleconsultationsModule {}
