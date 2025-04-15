import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsModule } from '../projects/projects.module';
import { ScannerModule } from '../scanner/scanner.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { DependencyAnalysis } from './entities/dependency-analysis.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DependencyAnalysis]),
    ScannerModule,
    ProjectsModule,
  ],
  providers: [AnalysisService],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
