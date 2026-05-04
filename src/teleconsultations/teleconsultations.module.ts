import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TeleconsultationsController } from './teleconsultations.controller';
import { TeleconsultationsService } from './teleconsultations.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TeleconsultationsController],
  providers: [TeleconsultationsService],
  exports: [TeleconsultationsService],
})
export class TeleconsultationsModule {}