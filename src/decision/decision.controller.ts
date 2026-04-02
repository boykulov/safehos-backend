import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DecisionService } from './decision.service';
import { IsString, IsBoolean, IsOptional } from 'class-validator';

class MakeDecisionDto {
  @IsString()
  action: 'approved' | 'blocked';

  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  isGlobal?: boolean;
}

@Controller('decision')
@UseGuards(AuthGuard('jwt'))
export class DecisionController {
  constructor(private decisionService: DecisionService) {}

  @Post(':eventId')
  async decide(@Param('eventId') eventId: string, @Body() dto: MakeDecisionDto, @Request() req) {
    return this.decisionService.makeDecision(eventId, dto.action, dto.reason || '', req.user.id, req.user.companyId, dto.isGlobal || false);
  }

  @Get('history')
  async getHistory(@Request() req) {
    return this.decisionService.getHistory(req.user.companyId);
  }
}
