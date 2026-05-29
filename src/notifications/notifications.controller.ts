import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('push-devices')
  @ApiOperation({
    summary: 'Enregistrer ou mettre à jour le token push de l’appareil',
  })
  registerPushDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.notificationsService.registerPushDevice(user, dto);
  }

  @Post('push-devices/unregister')
  @ApiOperation({
    summary: 'Désactiver le token push de l’appareil',
  })
  unregisterPushDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UnregisterPushDeviceDto,
  ) {
    return this.notificationsService.unregisterPushDevice(user, dto);
  }

  @Get('push-devices/me')
  @ApiOperation({
    summary: 'Lister mes appareils push enregistrés',
  })
  listMyPushDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listMyPushDevices(user);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Lister mes notifications applicatives',
  })
  listMyNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listMyNotifications(user);
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Marquer une notification comme lue',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifiant de la notification',
  })
  markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markNotificationAsRead(user, id);
  }
}
