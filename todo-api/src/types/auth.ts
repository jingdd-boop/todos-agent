import type { Role } from "@prisma/client";

export interface AuthUser {
  id: number;
  role: Role;
}

export interface SafeUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}
