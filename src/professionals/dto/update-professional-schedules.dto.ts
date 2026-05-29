import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProfessionalScheduleSlotDto {
  @ApiProperty({
    example: '08:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({
    example: '12:00',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @ApiProperty({
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class ProfessionalScheduleDayDto {
  @ApiProperty({
    example: 1,
    description: '1 = lundi, 7 = dimanche.',
  })
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @ApiProperty({
    example: 'Lundi',
  })
  @IsString()
  label!: string;

  @ApiProperty({
    example: true,
  })
  @IsBoolean()
  isOpen!: boolean;

  @ApiProperty({
    type: [ProfessionalScheduleSlotDto],
    example: [
      {
        startTime: '08:00',
        endTime: '12:00',
        position: 0,
      },
      {
        startTime: '14:00',
        endTime: '17:00',
        position: 1,
      },
    ],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ProfessionalScheduleSlotDto)
  slots!: ProfessionalScheduleSlotDto[];
}

export class UpdateProfessionalSchedulesDto {
  @ApiProperty({
    type: [ProfessionalScheduleDayDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => ProfessionalScheduleDayDto)
  schedules!: ProfessionalScheduleDayDto[];
}
