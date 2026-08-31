import logoUrl from "@/assets/lingo-logo.gif";
import "@/components/startup-splash.css";

export type RouteLoadingScreenProps = {
  /** Extra classes on the full-screen shell (e.g. absolute overlay). */
  className?: string;
  /** Accessible label while content loads. */
  label?: string;
};

/** Full-screen startup-style loader — shared by app splash and lazy route transitions. */
export function RouteLoadingScreen({ className = "", label = "Loading" }: RouteLoadingScreenProps) {
  return (
    <div className={`harbor-splash-screen ${className}`.trim()} aria-busy="true" aria-label={label}>
      <div className="harbor-splash">
        <div className="harbor-splash-logo-block">
          <img
            src={logoUrl}
            alt="Lingo"
            className="harbor-splash-logo harbor-splash-logo--animated"
            draggable={false}
          />
        </div>
        <div className="harbor-splash-progress" role="progressbar" aria-valuetext={label}>
          <div className="harbor-splash-progress-bar" />
        </div>
      </div>
    </div>
  );
}
