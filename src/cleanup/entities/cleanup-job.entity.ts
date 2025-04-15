import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CleanupResult } from './cleanup-result.entity';

export type CleanupStrategy = 'all' | 'unused' | 'older-than' | 'specific';

@Entity()
export class CleanupJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  strategy: CleanupStrategy;

  @Column('simple-array')
  targetPaths: string[];

  @Column({ nullable: true })
  olderThanDays?: number;

  @Column({ default: false })
  dryRun: boolean;

  @Column({ default: 'pending' })
  status: 'pending' | 'active' | 'completed' | 'failed';

  @Column({ nullable: true })
  error?: string;

  @Column('bigint', { default: 0 })
  spaceReclaimed: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @OneToMany(() => CleanupResult, (result) => result.cleanupJob)
  results: CleanupResult[];
}
