import logoUrl from "@/assets/lingo-logo.gif";
import "./startup-splash.css";

export function StartupSplash() {
  return (
    <div className="harbor-splash-screen" aria-busy="true" aria-label="Loading">
      <div className="harbor-splash">
        <div className="harbor-splash-logo-block">
          <img
            src={logoUrl}
            alt="Lingo"
            className="harbor-splash-logo harbor-splash-logo--animated"
            draggable={false}
          />
        </div>
        <div className="harbor-splash-progress" role="progressbar" aria-valuetext="Loading">
          <div className="harbor-splash-progress-bar" />
        </div>
      </div>
    </div>
  );
}
