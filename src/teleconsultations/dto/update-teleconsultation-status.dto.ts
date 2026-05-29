import { ApiProperty } from '@nestjs/swagger';
import { TeleconsultationStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTeleconsultationStatusDto {
  @ApiProperty({
    enum: TeleconsultationStatus,
    example: TeleconsultationStatus.WAITING,
  })
  @IsEnum(TeleconsultationStatus)
  status!: TeleconsultationStatus;
}
