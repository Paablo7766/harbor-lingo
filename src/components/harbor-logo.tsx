import { HarborMark } from "@/components/icons/harbor-mark";
import { useHarborLogo } from "@/lib/harbor-logo";

/** Sidebar / chrome mark — user upload, then theme preset, then built-in HarborMark. */
export function HarborLogoMark({
  className = "h-9 w-9 shrink-0",
  imgClassName,
  fallbackClassName,
}: {
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
}) {
  const { mark } = useHarborLogo();
  if (mark) {
    return (
      <img
        src={mark}
        alt=""
        draggable={false}
        className={imgClassName ?? `${className} object-contain`}
      />
    );
  }
  return <HarborMark className={fallbackClassName ?? className} />;
}

/** Wide wordmark beside the mark when the sidebar is expanded. */
export function HarborLogoWordmark({
  className = "h-8 w-auto shrink-0 object-contain",
}: {
  className?: string;
}) {
  const { wordmark } = useHarborLogo();
  if (!wordmark) return null;
  return <img src={wordmark} alt="" draggable={false} className={className} />;
}
