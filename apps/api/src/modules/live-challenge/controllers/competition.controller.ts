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
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../../auth/auth.service.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth/jwt-auth.guard.js';
import { CreateCompetitionDto } from '../dto/create-competition.dto/create-competition.dto.js';
import { DisqualifyParticipantDto } from '../dto/disqualify-participant.dto.js';
import { JoinCompetitionDto } from '../dto/join-competition.dto/join-competition.dto.js';
import { QueryCompetitionEventsDto } from '../dto/query-competition-events.dto.js';
import { RegisterParticipantDto } from '../dto/register-participant.dto/register-participant.dto.js';
import { ScheduleCompetitionDto } from '../dto/schedule-competition.dto/schedule-competition.dto.js';
import { ScreenShareTokenDto } from '../dto/screen-share-token.dto/screen-share-token.dto.js';
import { CompetitionExceptionFilter } from '../filters/competition-exception/competition-exception.filter.js';
import { CompetitionAdminGuard } from '../guards/competition-admin/competition-admin.guard.js';
import { CompetitionObserverGuard } from '../guards/competition-observer/competition-observer.guard.js';
import { CompetitionParticipantGuard } from '../guards/competition-participant/competition-participant.guard.js';
import { CompetitionService } from '../services/competition.service.js';
import { ScreenShareService } from '../services/screen-share.service.js';

@Controller('competitions')
@UseFilters(CompetitionExceptionFilter)
@UseGuards(JwtAuthGuard)
@RateLimit(RATE_LIMIT_POLICIES.COMPETITION)
export class CompetitionController {
  constructor(
    private readonly competitionService: CompetitionService,
    private readonly screenShare: ScreenShareService,
  ) {}

  @Post()
  @UseGuards(CompetitionAdminGuard)
  create(
    @Body() dto: CreateCompetitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitionService.create(dto, user.id);
  }

  @Get(':id')
  @UseGuards(CompetitionObserverGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.findOne(id);
  }

  @Post(':id/schedule')
  @UseGuards(CompetitionAdminGuard)
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCompetitionDto,
  ) {
    return this.competitionService.schedule(id, dto.scheduledStartAt);
  }

  @Post(':id/register')
  @UseGuards(CompetitionAdminGuard)
  register(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterParticipantDto,
  ) {
    return this.competitionService.registerParticipant(id, dto);
  }

  @Post(':id/join')
  join(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: JoinCompetitionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitionService.join(id, user.id, dto);
  }

  @Post(':id/start')
  @UseGuards(CompetitionAdminGuard)
  start(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.start(id);
  }

  @Post(':id/end')
  @UseGuards(CompetitionAdminGuard)
  end(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.end(id);
  }

  @Post(':id/finalize')
  @UseGuards(CompetitionAdminGuard)
  finalize(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.finalize(id);
  }

  @Post(':id/cancel')
  @UseGuards(CompetitionAdminGuard)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.cancel(id);
  }

  @Get(':id/participants')
  @UseGuards(CompetitionObserverGuard)
  participants(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.listParticipants(id);
  }

  @Post(':id/participants/:participantId/disqualify')
  @UseGuards(CompetitionAdminGuard)
  disqualify(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: DisqualifyParticipantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitionService.disqualifyParticipant(
      id,
      participantId,
      dto.reason,
      user.id,
    );
  }

  @Get(':id/events')
  @UseGuards(CompetitionAdminGuard)
  events(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryCompetitionEventsDto,
  ) {
    return this.competitionService.listEvents(id, query);
  }

  @Get(':id/leaderboard')
  @UseGuards(CompetitionObserverGuard)
  leaderboard(@Param('id', ParseUUIDPipe) id: string) {
    return this.competitionService.getLeaderboard(id);
  }

  @Get(':id/me')
  @UseGuards(CompetitionParticipantGuard)
  me(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.competitionService.getMe(id, user.id);
  }

  @Get(':id/screen-share')
  @UseGuards(CompetitionObserverGuard)
  screenShareStatus() {
    return this.screenShare.getStatus();
  }

  @Post(':id/screen-share/token')
  @UseGuards(CompetitionObserverGuard)
  screenShareToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScreenShareTokenDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.screenShare.issueToken(id, user, dto.intent);
  }
}
