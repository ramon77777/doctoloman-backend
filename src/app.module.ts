import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { PatientsModule } from './patients/patients.module';
import { PharmaciesModule } from './pharmacies/pharmacies.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { TeleconsultationsModule } from './teleconsultations/teleconsultations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    DatabaseModule,
    AuthModule,
    ProfessionalsModule,
    PatientsModule,
    AppointmentsModule,
    TeleconsultationsModule,
    PharmaciesModule,
    MedicalRecordsModule,
  ],
})
export class AppModule {}