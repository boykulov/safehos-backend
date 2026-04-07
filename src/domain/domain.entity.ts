import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

// Типы списков (новая Default Deny модель)
// global_allow  → глобальный белый список (все компании)
// org_allow     → белый список конкретной организации
// global_block  → глобальный чёрный список (все компании)
// org_block     → чёрный список конкретной организации
// pending_review → неизвестный домен, ждёт решения модератора
// info          → мониторинг (низкий риск, оставлен для совместимости)

export type ListType =
  | 'global_allow'
  | 'org_allow'
  | 'global_block'
  | 'org_block'
  | 'pending_review'
  | 'info';

// Категории для логистических компаний
export type DomainCategory =
  | 'loadboard'
  | 'factoring'
  | 'broker'
  | 'carrier'
  | 'maps'
  | 'email'
  | 'eld'
  | 'tms'
  | 'document'
  | 'support'
  | 'auth'
  | 'cdn'
  | 'other';

@Entity('domain_decisions')
export class DomainDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  domain: string;

  @Column({ type: 'text', nullable: true })
  companyId: string;

  // Старое поле — оставляем для совместимости
  // Значения: 'pending' | 'approved' | 'blocked' | 'deferred' | 'info'
  @Column({ type: 'text' })
  decision: string;

  // НОВОЕ: тип списка в Default Deny модели
  @Column({ type: 'text', nullable: true })
  listType: string;

  // НОВОЕ: wildcard разрешение (*.domain.com)
  @Column({ type: 'boolean', default: false })
  isWildcard: boolean;

  // НОВОЕ: категория домена для логистики
  @Column({ type: 'text', nullable: true })
  category: string;

  // НОВОЕ: кто добавил в список (audit trail)
  @Column({ type: 'text', nullable: true })
  approvedBy: string;

  // НОВОЕ: заметки модератора
  @Column({ type: 'text', nullable: true })
  notes: string;

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
