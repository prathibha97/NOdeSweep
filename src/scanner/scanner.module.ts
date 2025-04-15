import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanJob } from './entities/scan-job.entity';
import { ScanResult } from './entities/scan-result.entity';
import { FileSystemService } from './file-system.service';
import { ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';

@Module({
  imports: [TypeOrmModule.forFeature([ScanResult, ScanJob])],
  providers: [ScannerService, FileSystemService],
  controllers: [ScannerController],
  exports: [ScannerService],
})
export class ScannerModule {}
