import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProfessionalReasonItemDto {
  @ApiProperty({
    example: 'Consultation',
  })
  @IsString()
  @MinLength(2)
  label!: string;

  @ApiProperty({
    example: 30,
  })
  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes!: number;

  @ApiProperty({
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiProperty({
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProfessionalReasonsDto {
  @ApiProperty({
    type: [ProfessionalReasonItemDto],
    example: [
      {
        label: 'Consultation',
        durationMinutes: 30,
        position: 0,
        isActive: true,
      },
      {
        label: 'Suivi',
        durationMinutes: 20,
        position: 1,
        isActive: true,
      },
      {
        label: 'Renouvellement ordonnance',
        durationMinutes: 15,
        position: 2,
        isActive: true,
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProfessionalReasonItemDto)
  reasons!: ProfessionalReasonItemDto[];
}