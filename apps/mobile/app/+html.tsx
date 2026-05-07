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
  html, body { margin: 0; padding: 0; height: 100%; background: #050d1a; }
  .device-stage { min-height: 100vh; }

  /* ─── Phone frame (desktop only) ────────────────── */
  @media (min-width: 600px) {
    .device-stage {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 15% 20%, #12355a66 0, transparent 40%),
        radial-gradient(circle at 85% 80%, #3f2a5d66 0, transparent 35%),
        #040a16;
    }

    .device-shell {
      height: min(932px, calc(100vh - 48px));
      aspect-ratio: 430 / 932;
      max-width: calc(100vw - 60px);
      border-radius: 46px;
      padding: 10px;
      background: linear-gradient(160deg, #2b344f 0%, #161d30 55%, #0f1526 100%);
      overflow: hidden;
      box-shadow:
        inset 0 0 0 1px #4e587a,
        inset 0 0 0 3px #111827,
        0 30px 80px #00000088,
        0 6px 16px #00000055;
      position: relative;
    }

    .device-screen {
      width: 100%;
      height: 100%;
      border-radius: 36px;
      overflow: hidden;
      background: #000;
      position: relative;
    }

    .device-camera {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 126px;
      height: 30px;
      background: #0a0f1d;
      border-radius: 0 0 18px 18px;
      z-index: 9999;
      box-shadow: 0 1px 0 #2b344f;
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
