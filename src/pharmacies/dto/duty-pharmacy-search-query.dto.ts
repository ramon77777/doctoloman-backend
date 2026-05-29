import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class DutyPharmacySearchQueryDto {
  @ApiPropertyOptional({
    example: 'Abidjan',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'Cocody',
  })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({
    description:
      'Date à vérifier. Si absent, le backend utilise la date/heure actuelle.',
    example: '2026-05-05T20:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  at?: string;
}
