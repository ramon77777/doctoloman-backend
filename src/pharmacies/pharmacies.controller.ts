import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { DutyPharmacySearchQueryDto } from './dto/duty-pharmacy-search-query.dto';
import { PharmacySearchQueryDto } from './dto/pharmacy-search-query.dto';
import { PharmaciesService } from './pharmacies.service';

@ApiTags('Pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmaciesService: PharmaciesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister les pharmacies visibles côté patient',
  })
  list(@Query() query: PharmacySearchQueryDto) {
    return this.pharmaciesService.list(query);
  }

  @Get('on-duty')
  @ApiOperation({
    summary: 'Lister les pharmacies de garde',
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