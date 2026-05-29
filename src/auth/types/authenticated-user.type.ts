import { UserRole } from '@prisma/client';

export type AuthenticatedUser = {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
};
