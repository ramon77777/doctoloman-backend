import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminAppointmentSearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Recherche par patient, téléphone patient, professionnel, téléphone professionnel ou motif.',
    example: 'Clara',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut de rendez-vous.',
    enum: ['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
    example: 'CONFIRMED',
  })
  @IsOptional()
  @IsIn(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
  status?:
    | 'ALL'
    | 'PENDING'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'NO_SHOW'
    | 'CANCELLED';

  @ApiPropertyOptional({
    description: 'Filtrer par date de rendez-vous au format YYYY-MM-DD.',
    example: '2026-06-03',
  })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par ville du professionnel.',
    example: 'Abidjan',
  })
  @IsOptional()
  @IsString()
  city?: string;
}
