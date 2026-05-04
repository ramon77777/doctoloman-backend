import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { PatientsService } from './patients.service';

@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Récupérer mon profil patient',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.me(user);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Modifier mon profil patient',
  })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientsService.updateMe(user, dto);
  }
}