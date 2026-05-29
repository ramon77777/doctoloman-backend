import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterPushDeviceDto {
  @ApiProperty({
    example: 'fcm_token_or_apns_token_here',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;
}
