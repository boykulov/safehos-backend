import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DomainDecision } from './domain.entity';
import { ModeratorAction } from '../decision/decision.entity';
import { DomainService } from './domain.service';
import { DomainController } from './domain.controller';
import { ExternalFeedsService } from './external-feeds.service';
import { AllowlistService } from './allowlist.service';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([DomainDecision, ModeratorAction]), GatewayModule],
  providers: [DomainService, ExternalFeedsService, AllowlistService],
  controllers: [DomainController],
  exports: [DomainService, AllowlistService],
})
export class DomainModule {}
