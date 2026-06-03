import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

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

  @Get()
  @ApiOperation({
    summary:
      'Lister les rendez-vous selon le rôle connecté : patient, professionnel ou admin',
  })
  @ApiQuery({ name: 'practitionerId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  listForCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Query('practitionerId') practitionerId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.appointmentsService.listForCurrentUser(user, {
      practitionerId,
      status,
      from,
      to,
      page,
      pageSize,
    });
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

  @Get('availability')
  @ApiOperation({
    summary:
      'Lister les créneaux disponibles d’un professionnel pour une date et un motif',
  })
  @ApiQuery({ name: 'professionalId', required: true })
  @ApiQuery({ name: 'day', required: true })
  @ApiQuery({ name: 'reason', required: true })
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Query('professionalId') professionalId: string,
    @Query('day') day: string,
    @Query('reason') reason: string,
  ) {
    return this.appointmentsService.getAvailableSlots(user, {
      professionalId,
      day,
      reason,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer le détail d’un rendez-vous selon le rôle connecté',
  })
  getById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointmentsService.getByIdForCurrentUser(user, id);
  }

  @Patch(':id/reschedule')
  @ApiOperation({
    summary:
      'Reprogrammer un rendez-vous côté patient et repasser la demande en attente',
  })
  reschedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: { day?: string; slot?: string },
  ) {
    return this.appointmentsService.reschedule(user, id, body);
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
