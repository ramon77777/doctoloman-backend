import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ProfessionalSearchQueryDto {
  @ApiPropertyOptional({
    example: 'médecin',
    description: 'Recherche libre : nom, spécialité ou structure.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    example: 'Médecin généraliste',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

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