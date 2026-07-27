export {
  DEFAULT_ABSOLUTE_GAME_MINUTES,
  GAME_EPOCH_DAY,
  GAME_EPOCH_MONTH,
  GAME_EPOCH_YEAR,
  GAME_MINUTES_PER_REAL_SECOND,
  INITIAL_DAY_COUNT,
  INITIAL_MINUTE_OF_DAY,
  MINS_PER_DAY,
  REAL_SECONDS_PER_GAME_DAY,
  REAL_SECONDS_PER_GAME_MINUTE,
  advanceByRealSeconds,
  createDefaultGameTimeState,
  formatDateTime,
  formatMinuteOfDay,
  gameMinutesToRealSeconds,
  normalizeAbsoluteGameMinutes,
  normalizeGameTimeState,
  realSecondsToGameMinutes,
  setMinuteOfDay,
  toDateInfo,
  toDayCount,
  toMinuteOfDay,
} from '@timeplan-game/core/game/time';

export type {
  GameDateInfo,
  GameTimeState,
} from '@timeplan-game/core/game/time';
