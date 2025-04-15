import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { CleanupJob } from './cleanup-job.entity';

@Entity()
export class CleanupResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string;

  @Column('bigint')
  sizeReclaimed: number;

  @Column()
  success: boolean;

  @Column({ nullable: true })
  error?: string;

  @CreateDateColumn()
  cleanedAt: Date;

  @ManyToOne(() => CleanupJob, (job) => job.results)
  cleanupJob: CleanupJob;
}
