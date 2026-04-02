import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModeratorAction } from './decision.entity';
import { DecisionService } from './decision.service';
import { DecisionController } from './decision.controller';
import { DomainModule } from '../domain/domain.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [TypeOrmModule.forFeature([ModeratorAction]), DomainModule, GatewayModule],
  providers: [DecisionService],
  controllers: [DecisionController],
})
export class DecisionModule {}
