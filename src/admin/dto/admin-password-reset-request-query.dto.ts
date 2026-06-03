import { ApiPropertyOptional } from '@nestjs/swagger';
import { PasswordResetRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AdminPasswordResetRequestQueryDto {
  @ApiPropertyOptional({
    description: 'Recherche par nom, téléphone ou message.',
    example: 'Clara',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par statut.',
    enum: PasswordResetRequestStatus,
    example: PasswordResetRequestStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(PasswordResetRequestStatus)
  status?: PasswordResetRequestStatus;
}
