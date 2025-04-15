import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScannerModule } from '../scanner/scanner.module';
import { CleanupController } from './cleanup.controller';
import { CleanupService } from './cleanup.service';
import { CleanupJob } from './entities/cleanup-job.entity';
import { CleanupResult } from './entities/cleanup-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CleanupJob, CleanupResult]),
    ScannerModule,
  ],
  providers: [CleanupService],
  controllers: [CleanupController],
  exports: [CleanupService],
})
export class CleanupModule {}
