import bcrypt from "bcrypt";
import { AppError } from "../errors/app-error";
import { userRepository } from "../repositories/user.repository";
import { signToken } from "../utils/jwt";
import type { SafeUser } from "../types/auth";

function safeUser(user: {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}): SafeUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export const authService = {
  async register(data: { name: string; email: string; password: string }) {
    if (await userRepository.findByEmail(data.email))
      throw new AppError("User already exists", 409, "USER_ALREADY_EXISTS");
    const user = await userRepository.create({
      ...data,
      password: await bcrypt.hash(data.password, 10),
    });
    return safeUser(user);
  },
  async login(data: { email: string; password: string }) {
    const user = await userRepository.findByEmail(data.email);
    if (!user || !(await bcrypt.compare(data.password, user.password))) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }
    return { token: signToken(user), user: safeUser(user) };
  },
  async createAdmin(data: { name: string; email: string; password: string }) {
    if (await userRepository.findByEmail(data.email))
      throw new AppError("User already exists", 409, "USER_ALREADY_EXISTS");
    const user = await userRepository.create({
      ...data,
      password: await bcrypt.hash(data.password, 10),
      role: "ADMIN",
    });
    return safeUser(user);
  },
};
