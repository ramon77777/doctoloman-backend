import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MedicalAccessModule } from './medical-access/medical-access.module';
import { MedicalRecordsModule } from './medical-records/medical-records.module';
import { NotificationsModule } from './notifications/notifications.module';
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
    AdminModule,
    ProfessionalsModule,
    PatientsModule,
    AppointmentsModule,
    TeleconsultationsModule,
    PharmaciesModule,
    MedicalRecordsModule,
    MedicalAccessModule,
    NotificationsModule,
  ],
})
export class AppModule {}
