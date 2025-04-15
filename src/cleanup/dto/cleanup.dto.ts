import { CleanupStrategy } from '../entities/cleanup-job.entity';

export class CreateCleanupJobDto {
  strategy: CleanupStrategy;
  targetPaths: string[];
  olderThanDays?: number;
  dryRun?: boolean = false;
}
