import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class GrantMedicalAccessDto {
  @ApiProperty({
    example: 'professional-profile-id',
  })
  @IsString()
  @MinLength(2)
  professionalId!: string;
}
