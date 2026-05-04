import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PharmacySearchQueryDto {
  @ApiPropertyOptional({
    description: 'Recherche libre : nom, ville, quartier ou adresse.',
    example: 'pharmacie',
  })
  @IsOptional()
  @IsString()
  q?: string;

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
}