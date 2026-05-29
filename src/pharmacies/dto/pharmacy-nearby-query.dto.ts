import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PharmacyNearbyQueryDto {
  @ApiPropertyOptional({
    description: 'Latitude de la position utilisateur',
    example: 5.3599517,
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiPropertyOptional({
    description: 'Longitude de la position utilisateur',
    example: -4.0082563,
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    description: 'Rayon de recherche en kilomètres',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(1)
  @Max(30)
  radiusKm?: number;
}
