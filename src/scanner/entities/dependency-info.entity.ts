import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ScanResult } from './scan-result.entity';

@Entity()
export class DependencyInfo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  version: string;

  @Column('bigint')
  size: number;

  @Column({ default: false })
  isDev: boolean;

  @Column({ default: false })
  isOptional: boolean;

  @ManyToOne(() => ScanResult, (scanResult) => scanResult.dependencies)
  scanResult: ScanResult;
}
