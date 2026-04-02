import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('moderator_actions')
export class ModeratorAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  eventId: string;

  @Column({ type: 'text' })
  domain: string;

  @Column({ type: 'text' })
  companyId: string;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'text' })
  moderatorId: string;

  @Column({ type: 'boolean', default: false })
  isGlobal: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
