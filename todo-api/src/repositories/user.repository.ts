import { prisma } from "../lib/prisma";
import type { Role } from "@prisma/client";

export const userRepository = {
  create(data: { name: string; email: string; password: string; role?: Role }) {
    return prisma.user.create({ data });
  },
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },
};
