import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminProfessionalSearchQueryDto {
  @ApiPropertyOptional({
    description:
      'Recherche par nom, spécialité, structure, téléphone ou ville.',
    example: 'Dermatologue',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut de vérification.',
    enum: ['ALL', 'VERIFIED', 'PENDING'],
    example: 'PENDING',
  })
  @IsOptional()
  @IsIn(['ALL', 'VERIFIED', 'PENDING'])
  verification?: 'ALL' | 'VERIFIED' | 'PENDING';

  @ApiPropertyOptional({
    description: 'Filtrer par ville.',
    example: 'Abidjan',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par spécialité.',
    example: 'Dermatologue',
  })
  @IsOptional()
  @IsString()
  specialty?: string;
}
