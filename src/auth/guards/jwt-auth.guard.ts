import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthenticatedUser;
    }>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token manquant.');
    }

    const token = authorization.replace('Bearer ', '').trim();

    if (!token) {
      throw new UnauthorizedException('Token invalide.');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthenticatedUser>(token);

      request.user = {
        id: payload.id,
        phone: payload.phone,
        name: payload.name,
        role: payload.role,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Session expirée ou invalide.');
    }
  }
}
