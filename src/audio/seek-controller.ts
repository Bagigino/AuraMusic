export type SeekScrubState = {
  isScrubbing: boolean;
  scrubPosition: number | null;
};

export const idleSeekScrubState: SeekScrubState = {
  isScrubbing: false,
  scrubPosition: null,
};

export function clampSeekPosition(position: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) {
    return null;
  }
  return Math.min(duration, Math.max(0, position));
}

export function seekPositionFromOffset(offset: number, width: number, duration: number) {
  if (!Number.isFinite(width) || width <= 0) {
    return null;
  }
  return clampSeekPosition((offset / width) * duration, duration);
}

export function beginScrubbing(position: number, duration: number): SeekScrubState {
  const scrubPosition = clampSeekPosition(position, duration);
  return scrubPosition === null
    ? idleSeekScrubState
    : { isScrubbing: true, scrubPosition };
}

export function updateScrubbing(
  state: SeekScrubState,
  position: number,
  duration: number,
): SeekScrubState {
  if (!state.isScrubbing) {
    return state;
  }
  const scrubPosition = clampSeekPosition(position, duration);
  return scrubPosition === null ? idleSeekScrubState : { ...state, scrubPosition };
}

export function finishScrubbing(state: SeekScrubState, duration: number) {
  if (!state.isScrubbing || state.scrubPosition === null) {
    return null;
  }
  return clampSeekPosition(state.scrubPosition, duration);
}

export function getSeekDisplayPosition(
  playbackPosition: number,
  state: SeekScrubState,
  duration: number,
) {
  const candidate = state.isScrubbing && state.scrubPosition !== null
    ? state.scrubPosition
    : playbackPosition;
  return clampSeekPosition(candidate, duration) ?? 0;
}

export function getRelativeSeekPosition(
  playbackPosition: number,
  delta: number,
  duration: number,
) {
  return clampSeekPosition(playbackPosition + delta, duration);
}

export function getSeekResumePosition(
  playbackPosition: number,
  desiredSeekPosition: number | null,
) {
  return desiredSeekPosition !== null && Number.isFinite(desiredSeekPosition)
    ? desiredSeekPosition
    : playbackPosition;
}

export async function commitSeekPosition(
  position: number,
  duration: number,
  seekTo: (position: number) => void | Promise<void>,
) {
  const target = clampSeekPosition(position, duration);
  if (target === null) {
    return false;
  }
  await seekTo(target);
  return true;
}
