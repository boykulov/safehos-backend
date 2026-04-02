import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainDecision } from './domain.entity';
import { DomainService } from './domain.service';
import { DomainController } from './domain.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DomainDecision])],
  providers: [DomainService],
  controllers: [DomainController],
  exports: [DomainService],
})
export class DomainModule {}
