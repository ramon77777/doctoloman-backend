import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'Docto-123456-Temp',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    example: 'NouveauMotDePasse123!',
  })
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @ApiProperty({
    example: 'NouveauMotDePasse123!',
  })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
