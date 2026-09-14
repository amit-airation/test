import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateCompanyDto } from './dto/create-company.dto/create-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCompanyDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.name.trim() },
      });
      await tx.companyMembership.create({
        data: {
          userId,
          companyId: company.id,
        },
      });
      return company;
    });
  }

  listForUser(userId: string) {
    return this.prisma.company.findMany({
      where: {
        memberships: { some: { userId } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
