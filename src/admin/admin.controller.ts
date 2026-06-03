import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AdminService } from './admin.service';

import { AdminProfessionalSearchQueryDto } from './dto/admin-professional-search-query.dto';
import { AdminAppointmentSearchQueryDto } from './dto/admin-appointment-search-query.dto';
import { AdminPatientSearchQueryDto } from './dto/admin-patient-search-query.dto';

import { AdminCreatePharmacyDto } from './dto/admin-create-pharmacy.dto';
import { AdminCreatePharmacyDutyPeriodDto } from './dto/admin-create-pharmacy-duty-period.dto';
import { AdminPharmacySearchQueryDto } from './dto/admin-pharmacy-search-query.dto';
import { AdminUpdatePharmacyDto } from './dto/admin-update-pharmacy.dto';
import { AdminPasswordResetRequestQueryDto } from './dto/admin-password-reset-request-query.dto';
import { AdminRejectPasswordResetRequestDto } from './dto/admin-reject-password-reset-request.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Récupérer les statistiques globales du tableau de bord admin',
  })
  dashboard(@CurrentUser() user: AuthenticatedUser | null) {
    this.ensureAdmin(user);

    return this.adminService.dashboard();
  }

  @Get('password-reset-requests')
  @ApiOperation({
    summary:
      'Lister les demandes de réinitialisation de mot de passe côté admin',
  })
  listPasswordResetRequests(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query() query: AdminPasswordResetRequestQueryDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.listPasswordResetRequests(query);
  }

  @Get('password-reset-requests/:id')
  @ApiOperation({
    summary: 'Récupérer le détail d’une demande de réinitialisation côté admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la demande',
  })
  getPasswordResetRequestDetail(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.getPasswordResetRequestDetail(id);
  }

  @Patch('password-reset-requests/:id/reject')
  @ApiOperation({
    summary: 'Rejeter une demande de réinitialisation de mot de passe',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la demande',
  })
  rejectPasswordResetRequest(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body() dto: AdminRejectPasswordResetRequestDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.rejectPasswordResetRequest(id, dto);
  }

  @Patch('password-reset-requests/:id/generate-temporary-password')
  @ApiOperation({
    summary: 'Générer un mot de passe temporaire pour une demande validée',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la demande',
  })
  generateTemporaryPasswordForResetRequest(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.generateTemporaryPasswordForResetRequest(id);
  }

  @Get('professionals')
  @ApiOperation({
    summary: 'Lister les professionnels côté admin',
  })
  listProfessionals(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query() query: AdminProfessionalSearchQueryDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.listProfessionals(query);
  }

  @Get('professionals/:id')
  @ApiOperation({
    summary: 'Récupérer le détail complet d’un professionnel côté admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant du profil professionnel',
  })
  getProfessionalDetail(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.getProfessionalDetail(id);
  }

  @Patch('professionals/:id/verify')
  @ApiOperation({
    summary: 'Valider un profil professionnel',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant du profil professionnel',
  })
  verifyProfessional(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.setProfessionalVerification(id, true);
  }

  @Patch('professionals/:id/unverify')
  @ApiOperation({
    summary: 'Retirer la validation d’un profil professionnel',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant du profil professionnel',
  })
  unverifyProfessional(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.setProfessionalVerification(id, false);
  }

  @Get('appointments')
  @ApiOperation({
    summary: 'Lister les rendez-vous côté admin',
  })
  listAppointments(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query() query: AdminAppointmentSearchQueryDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.listAppointments(query);
  }

  @Get('appointments/:id')
  @ApiOperation({
    summary: 'Récupérer le détail complet d’un rendez-vous côté admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant du rendez-vous',
  })
  getAppointmentDetail(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.getAppointmentDetail(id);
  }

  @Get('patients')
  @ApiOperation({
    summary: 'Lister les patients côté admin',
  })
  listPatients(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query() query: AdminPatientSearchQueryDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.listPatients(query);
  }

  @Get('patients/:id')
  @ApiOperation({
    summary: 'Récupérer le détail d’un patient côté admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant utilisateur du patient',
  })
  getPatientDetail(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.getPatientDetail(id);
  }

  @Get('pharmacies')
  @ApiOperation({
    summary: 'Lister les pharmacies locales côté admin',
  })
  listPharmacies(
    @CurrentUser() user: AuthenticatedUser | null,
    @Query() query: AdminPharmacySearchQueryDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.listPharmacies(query);
  }

  @Get('pharmacies/:id')
  @ApiOperation({
    summary: 'Récupérer le détail d’une pharmacie locale côté admin',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  getPharmacyDetail(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.getPharmacyDetail(id);
  }

  @Post('pharmacies')
  @ApiOperation({
    summary: 'Créer une pharmacie locale',
  })
  createPharmacy(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body() dto: AdminCreatePharmacyDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.createPharmacy(dto);
  }

  @Patch('pharmacies/:id')
  @ApiOperation({
    summary: 'Modifier une pharmacie locale',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  updatePharmacy(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body() dto: AdminUpdatePharmacyDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.updatePharmacy(id, dto);
  }

  @Patch('pharmacies/:id/activate')
  @ApiOperation({
    summary: 'Activer une pharmacie locale',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  activatePharmacy(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.setPharmacyActive(id, true);
  }

  @Patch('pharmacies/:id/deactivate')
  @ApiOperation({
    summary: 'Désactiver une pharmacie locale',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  deactivatePharmacy(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.setPharmacyActive(id, false);
  }

  @Post('pharmacies/:id/duty-periods')
  @ApiOperation({
    summary: 'Ajouter une période de garde à une pharmacie',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  createPharmacyDutyPeriod(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('id') id: string,
    @Body() dto: AdminCreatePharmacyDutyPeriodDto,
  ) {
    this.ensureAdmin(user);

    return this.adminService.createPharmacyDutyPeriod(id, dto);
  }

  @Delete('pharmacies/duty-periods/:dutyPeriodId')
  @ApiOperation({
    summary: 'Supprimer une période de garde',
  })
  @ApiParam({
    name: 'dutyPeriodId',
    description: 'Identifiant de la période de garde',
  })
  deletePharmacyDutyPeriod(
    @CurrentUser() user: AuthenticatedUser | null,
    @Param('dutyPeriodId') dutyPeriodId: string,
  ) {
    this.ensureAdmin(user);

    return this.adminService.deletePharmacyDutyPeriod(dutyPeriodId);
  }

  private ensureAdmin(user: AuthenticatedUser | null) {
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }
  }
}
