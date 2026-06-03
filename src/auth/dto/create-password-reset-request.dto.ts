import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePasswordResetRequestDto {
  @ApiProperty({
    description: 'Type de compte concerné par la demande.',
    enum: ['PATIENT', 'PROFESSIONAL'],
    example: 'PATIENT',
  })
  @IsIn(['PATIENT', 'PROFESSIONAL'])
  accountType!: 'PATIENT' | 'PROFESSIONAL';

  @ApiProperty({
    description: 'Nom complet utilisé lors de l’inscription.',
    example: 'Clara Zorel',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    description: 'Numéro de téléphone du compte.',
    example: '+2250700000001',
  })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Message facultatif pour aider l’administration.',
    example: 'Je n’arrive plus à me connecter depuis ce matin.',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
