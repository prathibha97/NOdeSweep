import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ScanResult } from './scan-result.entity';

@Entity()
export class ScanJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('simple-array')
  basePaths: string[];

  @Column({ default: false })
  includeNodeModules: boolean;

  @Column({ default: false })
  includeGitFolders: boolean;

  @Column({ default: 'active' })
  status: 'pending' | 'active' | 'completed' | 'failed';

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ default: 0 })
  totalFilesScanned: number;

  @Column({ default: 0 })
  totalNodeModulesFound: number;

  @OneToMany(() => ScanResult, (scanResult) => scanResult.scanJob)
  results: ScanResult[];
}
