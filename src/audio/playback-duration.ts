const MINIMUM_DURATION_TOLERANCE_SECONDS = 3;
const DURATION_TOLERANCE_RATIO = 0.05;

function validDuration(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function durationTolerance(metadataDuration: number) {
  return Math.max(
    MINIMUM_DURATION_TOLERANCE_SECONDS,
    metadataDuration * DURATION_TOLERANCE_RATIO,
  );
}

/**
 * YouTube metadata is used as the upper bound when an M4A container reports
 * an implausibly longer duration. This prevents a malformed trailing timeline
 * from appearing as playable silence while keeping normal codec rounding.
 */
export function getEffectivePlaybackDuration(
  mediaDuration: number | null | undefined,
  metadataDuration: number | null | undefined,
) {
  const hasMediaDuration = validDuration(mediaDuration);
  const hasMetadataDuration = validDuration(metadataDuration);

  if (!hasMediaDuration) {
    return hasMetadataDuration ? metadataDuration : 0;
  }
  if (!hasMetadataDuration) {
    return mediaDuration;
  }

  const media = mediaDuration;
  const metadata = metadataDuration;
  return media > metadata + durationTolerance(metadata) ? metadata : media;
}

export function hasExcessiveMediaTail(
  mediaDuration: number | null | undefined,
  metadataDuration: number | null | undefined,
) {
  if (!validDuration(mediaDuration) || !validDuration(metadataDuration)) {
    return false;
  }
  return mediaDuration > metadataDuration + durationTolerance(metadataDuration);
}

export function reachedEffectiveEnd(currentTime: number, effectiveDuration: number) {
  return Number.isFinite(currentTime) &&
    effectiveDuration > 0 &&
    currentTime >= effectiveDuration;
}
