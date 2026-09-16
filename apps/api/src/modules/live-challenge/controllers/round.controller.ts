import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../../../common/throttler/rate-limit.decorator.js';
import { RATE_LIMIT_POLICIES } from '../../../common/throttler/rate-limit.policies.js';
import { CreateRoundDto } from '../dto/create-round.dto.js';
import { DisqualifyParticipantDto } from '../dto/disqualify-participant.dto.js';
import { JoinRoundDto } from '../dto/join-round.dto.js';
import { RegisterRoundParticipantsDto } from '../dto/register-round-participants.dto.js';
import { ScheduleRoundDto } from '../dto/schedule-round.dto.js';
import { ScreenShareTokenDto } from '../dto/screen-share-token.dto/screen-share-token.dto.js';
import { CompetitionExceptionFilter } from '../filters/competition-exception/competition-exception.filter.js';
import { AdminKeyGuard } from '../guards/admin-key/admin-key.guard.js';
import { EventKeyGuard } from '../guards/event-key/event-key.guard.js';
import { RoundService } from '../services/round.service.js';

@Controller('competitions/:competitionId/rounds')
@UseFilters(CompetitionExceptionFilter)
@RateLimit(RATE_LIMIT_POLICIES.COMPETITION)
export class RoundController {
  constructor(private readonly roundService: RoundService) {}

  @Post()
  @UseGuards(AdminKeyGuard)
  create(
    @Param('competitionId', ParseUUIDPipe) competitionId: string,
    @Body() dto: CreateRoundDto,
  ) {
    return this.roundService.create(competitionId, dto);
  }

  @Get()
  @UseGuards(EventKeyGuard)
  findAll(@Param('competitionId', ParseUUIDPipe) competitionId: string) {
    return this.roundService.findAllForCompetition(competitionId);
  }

  @Get(':roundId')
  @UseGuards(EventKeyGuard)
  findOne(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.findOne(roundId);
  }

  @Post(':roundId/schedule')
  @UseGuards(AdminKeyGuard)
  schedule(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: ScheduleRoundDto,
  ) {
    return this.roundService.schedule(roundId, dto.scheduledStartAt);
  }

  @Post(':roundId/register')
  @UseGuards(AdminKeyGuard)
  register(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: RegisterRoundParticipantsDto,
  ) {
    return this.roundService.registerParticipants(roundId, dto.participants);
  }

  @Post(':roundId/start')
  @UseGuards(AdminKeyGuard)
  start(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.start(roundId);
  }

  @Post(':roundId/end')
  @UseGuards(AdminKeyGuard)
  end(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.end(roundId);
  }

  @Post(':roundId/finalize')
  @UseGuards(AdminKeyGuard)
  finalize(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.finalize(roundId);
  }

  @Post(':roundId/cancel')
  @UseGuards(AdminKeyGuard)
  cancel(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.cancel(roundId);
  }

  @Get(':roundId/leaderboard')
  @UseGuards(EventKeyGuard)
  leaderboard(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.getLeaderboard(roundId);
  }

  @Get(':roundId/participants')
  @UseGuards(EventKeyGuard)
  participants(@Param('roundId', ParseUUIDPipe) roundId: string) {
    return this.roundService.listParticipants(roundId);
  }

  /** Closed-roster join — mobile + competition PIN. Must be pre-registered. */
  @Post(':roundId/join')
  @UseGuards(EventKeyGuard)
  join(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: JoinRoundDto,
  ) {
    return this.roundService.join(roundId, dto);
  }

  /** Returns the calling participant's own score/rank. Identified by company_id query param. */
  @Get(':roundId/me')
  @UseGuards(EventKeyGuard)
  me(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Query('company_id') companyId: string,
  ) {
    return this.roundService.getMe(roundId, companyId);
  }

  @Post(':roundId/participants/:participantId/disqualify')
  @UseGuards(AdminKeyGuard)
  disqualify(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: DisqualifyParticipantDto,
  ) {
    return this.roundService.disqualifyParticipant(
      roundId,
      participantId,
      dto.reason,
    );
  }

  @Get(':roundId/screen-share')
  @UseGuards(EventKeyGuard)
  screenShareStatus() {
    return this.roundService.screenShareStatus();
  }

  @Post(':roundId/screen-share/token')
  @UseGuards(EventKeyGuard)
  screenShareToken(
    @Param('roundId', ParseUUIDPipe) roundId: string,
    @Body() dto: ScreenShareTokenDto,
  ) {
    return this.roundService.issueScreenShareToken(
      roundId,
      dto.companyId ?? null,
      dto.companyName ?? 'Observer',
      dto.intent,
    );
  }
}
