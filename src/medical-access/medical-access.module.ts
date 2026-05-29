import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MedicalAccessController } from './medical-access.controller';
import { MedicalAccessService } from './medical-access.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MedicalAccessController],
  providers: [MedicalAccessService],
  exports: [MedicalAccessService],
})
export class MedicalAccessModule {}
