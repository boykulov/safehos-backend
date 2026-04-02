import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('domain_decisions')
export class DomainDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  domain: string;

  @Column({ type: 'text', nullable: true })
  companyId: string;

  @Column({ type: 'text' })
  decision: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'integer', default: 0 })
  riskScore: number;

  @Column({ type: 'text', nullable: true })
  decidedBy: string;

  @Column({ type: 'boolean', default: false })
  isGlobal: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
