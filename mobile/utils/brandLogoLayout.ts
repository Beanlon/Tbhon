/** Responsive TBHON wordmark layout — matches landing page proportions. */
export function getBrandLogoLayout(
  windowHeight: number,
  windowWidth: number,
  horizontalPadding = 40,
) {
  const contentWidth = Math.max(0, windowWidth - horizontalPadding);
  const maxWidth = windowWidth >= 768 ? 240 : windowWidth >= 640 ? 216 : 192;
  const widthRatio = windowWidth >= 640 ? 0.46 : 0.52;

  return {
    topMargin: Math.max(24, Math.min(windowHeight * 0.07, 72)),
    bottomMargin: Math.max(12, Math.min(windowHeight * 0.025, 28)),
    boxWidth: Math.min(contentWidth * widthRatio, maxWidth),
  };
}
