import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Créer une demande de rendez-vous côté patient',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(user, dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Lister les rendez-vous du patient connecté',
  })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.listMine(user);
  }

  @Get('professional/me')
  @ApiOperation({
    summary: 'Lister les rendez-vous du professionnel connecté',
  })
  listProfessionalMine(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.listProfessionalMine(user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Modifier le statut d’un rendez-vous',
  })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointmentsService.updateStatus(user, id, dto);
  }
}