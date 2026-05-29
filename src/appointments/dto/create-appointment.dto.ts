import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({
    example: 'e64dff5b-acb7-4516-a3a1-783a0bf7503d',
    description: 'Identifiant du profil professionnel.',
  })
  @IsString()
  @MinLength(1)
  professionalId!: string;

  @ApiProperty({
    example: '2026-05-05',
    description: 'Date du rendez-vous au format YYYY-MM-DD.',
  })
  @IsDateString()
  day!: string;

  @ApiProperty({
    example: '08:00',
    description: 'Heure de début du créneau au format HH:mm.',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Le créneau doit être au format HH:mm. Exemple : 08:00.',
  })
  slot!: string;

  @ApiProperty({
    example: 'Consultation',
    description: 'Motif du rendez-vous.',
  })
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiPropertyOptional({
    example: 'Patient',
  })
  @IsOptional()
  @IsString()
  patientFirstName?: string;

  @ApiPropertyOptional({
    example: 'Test',
  })
  @IsOptional()
  @IsString()
  patientLastName?: string;

  @ApiPropertyOptional({
    example: '+2250700000001',
  })
  @IsOptional()
  @IsString()
  patientPhone?: string;

  @ApiProperty({
    example: true,
    description: 'Consentement du patient pour la demande de rendez-vous.',
  })
  @IsBoolean()
  consentAccepted!: boolean;

  @ApiPropertyOptional({
    example: 'dl-ci-consent-v1',
  })
  @IsOptional()
  @IsString()
  consentVersion?: string;
}
