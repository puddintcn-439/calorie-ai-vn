import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML shell for Expo web.
 * On desktop, wraps the app in a centered phone-frame sized like
 * iPhone 15 Pro Max (430x932) for realistic mobile testing.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#111a13" />
        <meta name="description" content="Calorie AI — trợ lý dinh dưỡng và vận động cá nhân hóa." />
        <title>Calorie AI</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: phoneFrameCSS }} />
      </head>
      <body>
        <div className="device-stage">
          <div className="device-shell">
            <div className="device-camera" />
            <div className="device-screen">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}

const phoneFrameCSS = `
  /* ─── Reset ─────────────────────────────────────── */
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #101711; }
  .device-stage { min-height: 100vh; }

  /* ─── Phone frame (desktop only) ────────────────── */
  @media (min-width: 600px) {
    .device-stage {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 28px;
      background:
        radial-gradient(circle at 18% 14%, rgba(183, 223, 114, .22) 0, transparent 34%),
        radial-gradient(circle at 84% 78%, rgba(83, 145, 130, .18) 0, transparent 36%),
        linear-gradient(145deg, #0b100c 0%, #172019 56%, #0e1510 100%);
      position: relative;
      overflow: hidden;
    }

    .device-stage::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: .16;
      background-image: linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: radial-gradient(circle at center, black, transparent 72%);
    }

    .device-shell {
      height: min(932px, calc(100vh - 48px));
      aspect-ratio: 430 / 932;
      max-width: calc(100vw - 60px);
      border-radius: 50px;
      padding: 9px;
      background: linear-gradient(150deg, #4f5c51 0%, #18211a 36%, #071009 100%);
      overflow: hidden;
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.2),
        inset 0 0 0 3px rgba(0,0,0,.55),
        0 42px 110px rgba(0,0,0,.52),
        0 10px 28px rgba(0,0,0,.42);
      position: relative;
      z-index: 1;
    }

    .device-screen {
      width: 100%;
      height: 100%;
      border-radius: 41px;
      overflow: hidden;
      background: #f7f8f2;
      position: relative;
    }

    .device-camera {
      position: absolute;
      top: 11px;
      left: 50%;
      transform: translateX(-50%);
      width: 126px;
      height: 30px;
      background: #070b08;
      border-radius: 0 0 18px 18px;
      z-index: 20;
      box-shadow: inset 0 -1px 0 rgba(255,255,255,.08);
      pointer-events: none;
    }
  }

  /* ─── Mobile: full screen, no frame ─────────────── */
  @media (max-width: 599px) {
    html, body { height: 100%; }
    .device-stage,
    .device-shell,
    .device-screen {
      min-height: 100vh;
      width: 100%;
      border-radius: 0;
      padding: 0;
      background: transparent;
      box-shadow: none;
    }

    .device-camera {
      display: none;
    }
  }
`;
