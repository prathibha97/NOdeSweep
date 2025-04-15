import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysisModule } from './analysis/analysis.module';
import { ApiModule } from './api/api.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { ProjectsModule } from './projects/projects.module';
import { ScannerModule } from './scanner/scanner.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'sqlite',
        database: configService.get('DATABASE_FILE', 'nodesweep.db'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // Set to false in production
      }),
    }),
    ScheduleModule.forRoot(),
    ScannerModule,
    ProjectsModule,
    CleanupModule,
    ApiModule,
    AnalysisModule,
  ],
})
export class AppModule {}
