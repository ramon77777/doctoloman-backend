import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: '+2250700000001',
  })
  @IsString()
  phone!: string;

  @ApiProperty({
    example: 'MotDePasse123',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}