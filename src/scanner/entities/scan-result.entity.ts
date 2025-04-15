import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DependencyInfo } from './dependency-info.entity';
import { ScanJob } from './scan-job.entity';

@Entity()
export class ScanResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  path: string;

  @Column('bigint')
  size: number;

  @Column()
  lastAccessed: Date;

  @Column()
  lastModified: Date;

  @Column({ nullable: true })
  packageJsonPath: string;

  @Column({ nullable: true })
  projectName: string;

  @Column({ nullable: true })
  projectVersion: string;

  @Column()
  dependencyCount: number;

  @CreateDateColumn()
  scannedAt: Date;

  @ManyToOne(() => ScanJob, (scanJob) => scanJob.results)
  scanJob: ScanJob;

  @OneToMany(() => DependencyInfo, (dependency) => dependency.scanResult, {
    cascade: true,
  })
  dependencies: DependencyInfo[];
}
