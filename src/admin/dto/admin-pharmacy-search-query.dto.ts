import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminPharmacySearchQueryDto {
  @ApiPropertyOptional({
    description: 'Recherche par nom, téléphone, ville, quartier ou adresse.',
    example: 'Cocody',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut.',
    enum: ['ALL', 'ACTIVE', 'INACTIVE', 'ON_DUTY'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'INACTIVE', 'ON_DUTY'])
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ON_DUTY';

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
