import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { CleanupModule } from '../cleanup/cleanup.module';
import { ProjectsModule } from '../projects/projects.module';
import { ScannerModule } from '../scanner/scanner.module';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  imports: [ScannerModule, ProjectsModule, CleanupModule, AnalysisModule],
  controllers: [ApiController],
  providers: [ApiService],
})
export class ApiModule {}
