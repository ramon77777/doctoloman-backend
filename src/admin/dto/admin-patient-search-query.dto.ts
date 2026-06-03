import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminPatientSearchQueryDto {
  @ApiPropertyOptional({
    description: 'Recherche par nom, téléphone, ville, commune/quartier.',
    example: 'Clara',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut du compte.',
    enum: ['ALL', 'ACTIVE', 'INACTIVE'],
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsIn(['ALL', 'ACTIVE', 'INACTIVE'])
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    description: 'Filtrer par ville.',
    example: 'Abidjan',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par commune/quartier.',
    example: 'Cocody',
  })
  @IsOptional()
  @IsString()
  district?: string;
}
