import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicalAccessModule } from '../medical-access/medical-access.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';

@Module({
  imports: [PrismaModule, AuthModule, MedicalAccessModule],
  controllers: [MedicalRecordsController],
  providers: [MedicalRecordsService],
})
export class MedicalRecordsModule {}
