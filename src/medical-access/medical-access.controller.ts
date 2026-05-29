import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { GrantMedicalAccessDto } from './dto/grant-medical-access.dto';
import { MedicalAccessService } from './medical-access.service';

@ApiTags('Medical access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('medical-access')
export class MedicalAccessController {
  constructor(private readonly medicalAccessService: MedicalAccessService) {}

  @Post('patient/grant')
  @ApiOperation({
    summary: 'Autoriser un professionnel à accéder à mon dossier médical',
  })
  grantAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantMedicalAccessDto,
  ) {
    return this.medicalAccessService.grantAccess(user, dto);
  }

  @Patch('patient/:id/revoke')
  @ApiOperation({
    summary: 'Révoquer une autorisation d’accès à mon dossier médical',
  })
  revokeAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.medicalAccessService.revokeAccess(user, id);
  }

  @Get('patient/me')
  @ApiOperation({
    summary: 'Lister les autorisations accordées par le patient connecté',
  })
  listForPatient(@CurrentUser() user: AuthenticatedUser) {
    return this.medicalAccessService.listForPatient(user);
  }

  @Get('professional/me')
  @ApiOperation({
    summary: 'Lister les patients ayant autorisé le professionnel connecté',
  })
  listForProfessional(@CurrentUser() user: AuthenticatedUser) {
    return this.medicalAccessService.listForProfessional(user);
  }

  @Get('patient/audit')
  @ApiOperation({
    summary: 'Lister l’historique des accès à mon dossier médical',
  })
  listAuditForPatient(@CurrentUser() user: AuthenticatedUser) {
    return this.medicalAccessService.listAuditForPatient(user);
  }
}
