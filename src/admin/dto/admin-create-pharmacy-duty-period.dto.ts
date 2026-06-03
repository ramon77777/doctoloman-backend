import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AdminCreatePharmacyDutyPeriodDto {
  @ApiProperty({
    description: 'Début de la période de garde.',
    example: '2026-06-08T20:00:00.000Z',
  })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({
    description: 'Fin de la période de garde.',
    example: '2026-06-09T08:00:00.000Z',
  })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({
    example: 'Garde de nuit validée par la commune.',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
