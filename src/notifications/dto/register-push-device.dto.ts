import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PushDevicePlatform } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterPushDeviceDto {
  @ApiProperty({
    example: 'fcm_token_or_apns_token_here',
    description: 'Token push fourni par le téléphone.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;

  @ApiPropertyOptional({
    enum: PushDevicePlatform,
    example: PushDevicePlatform.ANDROID,
  })
  @IsOptional()
  @IsEnum(PushDevicePlatform)
  platform?: PushDevicePlatform;

  @ApiPropertyOptional({
    example: 'Pixel 7',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @ApiPropertyOptional({
    example: '1.0.0+1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  appVersion?: string;
}
