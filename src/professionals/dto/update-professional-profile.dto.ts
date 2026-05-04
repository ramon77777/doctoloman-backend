import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProfessionalProfileDto {
  @ApiPropertyOptional({
    example: 'Dr Clark Zorel',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @ApiPropertyOptional({
    example: 'Médecin généraliste',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  specialty?: string;

  @ApiPropertyOptional({
    example: 'Cabinet Médical Sainte Grâce',
  })
  @IsOptional()
  @IsString()
  structureName?: string;

  @ApiPropertyOptional({
    example: '+2250700000002',
  })
  @IsOptional()
  @IsString()
  phone?: string;

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
    example: 'Rue des Jardins',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    example:
      'Médecin généraliste avec une pratique orientée suivi familial et prévention.',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    example: '10 000 - 15 000 FCFA',
  })
  @IsOptional()
  @IsString()
  consultationFeeLabel?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Durée par défaut utilisée comme valeur de secours.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  appointmentDurationMinutes?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'À garder plutôt côté admin en production. Conservé ici pour le MVP.',
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}