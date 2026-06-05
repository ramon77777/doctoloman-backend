import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class BootstrapAdminDto {
  @ApiProperty({
    description: 'Secret de bootstrap défini dans les variables Render.',
    example: 'doctoloman-bootstrap-secret',
  })
  @IsString()
  @MinLength(12)
  secret!: string;

  @ApiProperty({
    example: 'Admin DoctoLoman',
  })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    example: '+2250700000099',
  })
  @IsString()
  phone!: string;

  @ApiProperty({
    example: 'AdminPassword123!',
  })
  @IsString()
  @MinLength(8)
  password!: string;
}