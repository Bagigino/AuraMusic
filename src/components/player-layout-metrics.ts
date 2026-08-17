export const TAB_BAR_CONTENT_HEIGHT = 58;
export const MINI_PLAYER_HEIGHT = 68;
export const MINI_PLAYER_GAP = 8;
export const SCREEN_BOTTOM_GAP = 28;

export function getTabBarHeight(bottomSafeArea: number) {
  return TAB_BAR_CONTENT_HEIGHT + Math.max(0, bottomSafeArea);
}

export function getScreenBottomPadding(
  bottomSafeArea: number,
  miniPlayerVisible: boolean,
  fullPlayerRoute = false,
) {
  if (fullPlayerRoute) {
    return Math.max(24, bottomSafeArea + 16);
  }
  return (
    getTabBarHeight(bottomSafeArea) +
    SCREEN_BOTTOM_GAP +
    (miniPlayerVisible ? MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP : 0)
  );
}
