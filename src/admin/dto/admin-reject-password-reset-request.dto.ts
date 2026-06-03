import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AdminRejectPasswordResetRequestDto {
  @ApiPropertyOptional({
    example: 'Informations insuffisantes pour confirmer l’identité.',
  })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
