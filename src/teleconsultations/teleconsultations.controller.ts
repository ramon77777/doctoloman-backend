import { Controller, Get, Param, Patch, UseGuards, Body } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UpdateTeleconsultationStatusDto } from './dto/update-teleconsultation-status.dto';
import { TeleconsultationsService } from './teleconsultations.service';

@ApiTags('Teleconsultations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teleconsultations')
export class TeleconsultationsController {
  constructor(
    private readonly teleconsultationsService: TeleconsultationsService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Lister mes téléconsultations',
  })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.teleconsultationsService.listMine(user);
  }

  @Get(':id/room')
  @ApiOperation({
    summary: 'Récupérer la salle vidéo sécurisée d’une téléconsultation',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  getRoomForSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.teleconsultationsService.getRoomForSession(user, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer le détail d’une téléconsultation',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  getMineById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teleconsultationsService.getMineById(user, id);
  }

  @Patch(':id/consent')
  @ApiOperation({
    summary: 'Accepter le consentement téléconsultation côté patient',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  acceptConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.teleconsultationsService.acceptConsent(user, id);
  }

  @Patch(':id/waiting')
  @ApiOperation({
    summary: 'Marquer le patient comme en attente dans la salle',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  markWaiting(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teleconsultationsService.markWaiting(user, id);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Démarrer la téléconsultation côté professionnel',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teleconsultationsService.start(user, id);
  }

  @Patch(':id/end')
  @ApiOperation({
    summary: 'Terminer la téléconsultation côté professionnel',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  end(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teleconsultationsService.end(user, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Annuler une téléconsultation',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.teleconsultationsService.cancel(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Modifier manuellement le statut, réservé admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la téléconsultation',
  })
  updateStatusForAdmin(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeleconsultationStatusDto,
  ) {
    return this.teleconsultationsService.updateStatusForAdmin(
      user,
      id,
      dto.status,
    );
  }
}
