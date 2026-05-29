import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database.service';

@ApiTags('Database')
@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Vérifie la connexion à la base de données',
  })
  async getStatus() {
    return this.databaseService.getStatus();
  }
}
