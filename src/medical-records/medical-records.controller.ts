import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import { MedicalRecordsService } from './medical-records.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

@ApiTags('Medical records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('medical-records')
export class MedicalRecordsController {
  constructor(private readonly medicalRecordsService: MedicalRecordsService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Uploader un document médical côté patient',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'file'],
      properties: {
        title: {
          type: 'string',
          example: 'Ordonnance consultation générale',
        },
        type: {
          type: 'string',
          enum: [
            'PRESCRIPTION',
            'LAB_RESULT',
            'IMAGING',
            'CERTIFICATE',
            'OTHER',
          ],
          example: 'PRESCRIPTION',
        },
        description: {
          type: 'string',
          example: 'Ordonnance remise après consultation.',
        },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, callback) => {
          const request = req as RequestWithUser;
          const patientId = request.user?.id?.trim() || 'unknown';

          const destination = join(
            process.cwd(),
            'uploads',
            'medical-records',
            patientId,
          );

          mkdirSync(destination, { recursive: true });
          callback(null, destination);
        },
        filename: (_req, file, callback) => {
          const extension = extname(file.originalname).toLowerCase();
          const storedName = `${randomUUID()}${extension}`;
          callback(null, storedName);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();

        const isAllowed =
          allowedMimeTypes.has(file.mimetype) &&
          allowedExtensions.has(extension);

        if (!isAllowed) {
          callback(
            new BadRequestException(
              'Type de fichier non autorisé. Formats acceptés : PDF, JPG, JPEG, PNG.',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMedicalRecordDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.medicalRecordsService.upload(user, dto, file);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Lister mes documents médicaux',
  })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.medicalRecordsService.listMine(user);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer le détail d’un document médical',
  })
  findMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.medicalRecordsService.findMine(user, id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Télécharger un document médical',
  })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const { record, absolutePath } =
      await this.medicalRecordsService.getDownloadInfo(user, id);

    response.setHeader('Content-Type', record.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(record.originalFileName)}"`,
    );

    return response.sendFile(absolutePath);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Supprimer un document médical',
  })
  deleteMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.medicalRecordsService.deleteMine(user, id);
  }
}