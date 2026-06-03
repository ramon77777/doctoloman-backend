import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: '+2250700000001',
  })
  @IsString()
  phone!: string;

  @ApiProperty({
    example: 'Kouamé Aya',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    example: 'MotDePasse123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, {
    message: 'Le mot de passe doit contenir au moins 8 caractères.',
  })
  password!: string;

  @ApiPropertyOptional({
    enum: UserRole,
    default: UserRole.PATIENT,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    example: 'Médecin généraliste',
    description: 'Requis seulement pour un compte professionnel.',
  })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    example: 'Cabinet Médical Sainte Grâce',
  })
  @IsOptional()
  @IsString()
  structureName?: string;

  @ApiPropertyOptional({
    example: 'Abidjan',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'Cocody',
  })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({
    example: 'Rue des Jardins',
  })
  @IsOptional()
  @IsString()
  address?: string;
}
