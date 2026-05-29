import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DutyPharmacySearchQueryDto } from './dto/duty-pharmacy-search-query.dto';
import { PharmacyNearbyQueryDto } from './dto/pharmacy-nearby-query.dto';
import { PharmacySearchQueryDto } from './dto/pharmacy-search-query.dto';
import { PharmaciesService } from './pharmacies.service';

@ApiTags('Pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmaciesService: PharmaciesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lister les pharmacies visibles côté patient depuis la base locale',
  })
  list(@Query() query: PharmacySearchQueryDto) {
    return this.pharmaciesService.list(query);
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Rechercher les pharmacies autour de la position utilisateur',
  })
  listNearby(@Query() query: PharmacyNearbyQueryDto) {
    return this.pharmaciesService.listNearby(query);
  }

  @Get('on-duty')
  @ApiOperation({
    summary: 'Lister les pharmacies de garde enregistrées dans la base locale',
  })
  listOnDuty(@Query() query: DutyPharmacySearchQueryDto) {
    return this.pharmaciesService.listOnDuty(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer le détail d’une pharmacie',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la pharmacie',
  })
  findOne(@Param('id') id: string) {
    return this.pharmaciesService.findOne(id);
  }
}
