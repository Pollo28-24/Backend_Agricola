import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit.service';
import { PasswordService } from '../common/services/password.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, PasswordService],
  exports: [PrismaService, AuditService, PasswordService],
})
export class PrismaModule {}
