import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../../../common/throttler/rate-limit.decorator.js';
import { RATE_LIMIT_POLICIES } from '../../../common/throttler/rate-limit.policies.js';
import { CreateCompetitionDto } from '../dto/create-competition.dto/create-competition.dto.js';
import { QueryCompetitionEventsDto } from '../dto/query-competition-events.dto.js';
import { SetActiveRoundDto } from '../dto/set-active-round.dto.js';
import { UpdateJoinPinDto } from '../dto/update-join-pin.dto.js';
import { CompetitionExceptionFilter } from '../filters/competition-exception/competition-exception.filter.js';
import { AdminKeyGuard } from '../guards/admin-key/admin-key.guard.js';
import { EventKeyGuard } from '../guards/event-key/event-key.guard.js';
import { CompetitionService } from '../services/competition.service.js';

@Controller('competitions')
@UseFilters(CompetitionExceptionFilter)
@RateLimit(RATE_LIMIT_POLICIES.COMPETITION)
export class CompetitionController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Post()
  @UseGuards(AdminKeyGuard)
  create(@Body() dto: CreateCompetitionDto) {
    return this.competitionService.create(dto);
  }

  @Get()
  @UseGuards(AdminKeyGuard)
  findAll() {
    return this.competitionService.findAll();
  }

  @Get(':id/events')
  @UseGuards(AdminKeyGuard)
  listEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryCompetitionEventsDto,
  ) {
    return this.competitionService.listEvents(id, query);
  }

  @Patch(':id/join-pin')
  @UseGuards(AdminKeyGuard)
  updateJoinPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJoinPinDto,
  ) {
    return this.competitionService.updateJoinPin(id, dto.password);
  }

  @Get(':id')
  @UseGuards(EventKeyGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.findOne(id);
  }

  @Post(':id/cancel')
  @UseGuards(AdminKeyGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.cancel(id);
  }

  /** Admin controls which round observers see on the live display. */
  @Post(':id/active-round')
  @UseGuards(AdminKeyGuard)
  setActiveRound(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveRoundDto,
  ) {
    return this.competitionService.setActiveRound(id, dto.roundId ?? null);
  }

  @Get(':id/leaderboard')
  @UseGuards(EventKeyGuard)
  leaderboard(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.getLeaderboard(id);
  }
}
