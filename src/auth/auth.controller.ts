import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { CreatePasswordResetRequestDto } from './dto/create-password-reset-request.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Créer un compte patient ou professionnel',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Se connecter avec téléphone et mot de passe',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Récupérer la session utilisateur courante',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  @Patch('me/password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Modifier mon mot de passe',
  })
  @UseGuards(JwtAuthGuard)
  changeMyPassword(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changeMyPassword(user, dto);
  }

  @Post('password-reset-requests')
  @ApiOperation({
    summary:
      'Créer une demande publique de réinitialisation de mot de passe patient/professionnel',
  })
  createPasswordResetRequest(@Body() dto: CreatePasswordResetRequestDto) {
    return this.authService.createPasswordResetRequest(dto);
  }
}
