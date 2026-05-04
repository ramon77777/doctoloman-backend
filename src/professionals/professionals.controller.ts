import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ProfessionalSearchQueryDto } from './dto/professional-search-query.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { UpdateProfessionalReasonsDto } from './dto/update-professional-reasons.dto';
import { UpdateProfessionalSchedulesDto } from './dto/update-professional-schedules.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('Professionals')
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister les professionnels visibles côté patient',
  })
  listPublic(@Query() query: ProfessionalSearchQueryDto) {
    return this.professionalsService.listPublic(query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Récupérer mon profil professionnel',
  })
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.professionalsService.getMe(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Modifier mon profil professionnel',
  })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ) {
    return this.professionalsService.updateMe(user, dto);
  }

  @Patch('me/reasons')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remplacer mes motifs et durées de rendez-vous',
  })
  replaceMyReasons(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfessionalReasonsDto,
  ) {
    return this.professionalsService.replaceMyReasons(user, dto);
  }

  @Patch('me/schedules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remplacer mes disponibilités hebdomadaires',
  })
  replaceMySchedules(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfessionalSchedulesDto,
  ) {
    return this.professionalsService.replaceMySchedules(user, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer la fiche publique d’un professionnel',
  })
  getPublicById(@Param('id') id: string) {
    return this.professionalsService.getPublicById(id);
  }
}