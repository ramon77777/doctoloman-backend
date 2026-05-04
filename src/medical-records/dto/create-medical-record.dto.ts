import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalRecordType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMedicalRecordDto {
  @ApiProperty({
    example: 'Ordonnance consultation générale',
  })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({
    enum: MedicalRecordType,
    default: MedicalRecordType.OTHER,
  })
  @IsOptional()
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({
    example: 'Ordonnance remise après consultation.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}