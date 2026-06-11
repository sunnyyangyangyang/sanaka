import { useEffect, useMemo, useRef, useState } from 'react';
import RFB from '@novnc/novnc';
import { useT } from '../hooks/useT';

export type NoVncScaleMode = 'native' | 'fit' | 'stretch';

export type DisplayConnectionState =
  | 'waiting-runtime'
  | 'waiting-display'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'unavailable';

export function NoVncViewport({
  websocketPort,
  password = '',
  active,
  machineRunning = active,
  className = '',
  reconnectWindowMs = 15000,
  initialDelayMs = 0,
  onConnectionStateChange,
  scaleMode = 'fit'
}: {
  websocketPort?: number;
  password?: string;
  active: boolean;
  machineRunning?: boolean;
  className?: string;
  reconnectWindowMs?: number;
  initialDelayMs?: number;
  onConnectionStateChange?: (state: DisplayConnectionState) => void;
  scaleMode?: NoVncScaleMode;
}) {
  const t = useT();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RFB | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const originalAbsRef = useRef<{ x?: (x: number) => number; y?: (y: number) => number }>({});
  const reconnectTimerRef = useRef<number | null>(null);
  const initialDelayTimerRef = useRef<number | null>(null);
  const reconnectStartedAtRef = useRef<number | null>(null);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [displayReady, setDisplayReady] = useState(false);
  const [connectionState, setConnectionState] = useState<DisplayConnectionState>('waiting-runtime');

  const url = useMemo(() => {
    if (!websocketPort) {
      return null;
    }
    if (window.location.protocol === 'file:') {
      return `ws://127.0.0.1:${websocketPort}`;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/novnc?port=${encodeURIComponent(String(websocketPort))}`;
  }, [websocketPort]);

  function applyViewportScale(rfb: RFB) {
    const target = mountRef.current;
    if (!target) return;

    const display = (rfb as RFB & {
      _display?: {
        _viewportLoc?: { w: number; h: number; x: number; y: number };
        scale?: number;
        absX?: (x: number) => number;
        absY?: (y: number) => number;
        viewportChangeSize?: (w: number, h: number) => void;
        resize?: (w: number, h: number) => void;
      };
      _screen?: HTMLDivElement;
    })._display;
    const screen = (rfb as RFB & { _screen?: HTMLDivElement })._screen;

    if (!display?._viewportLoc) return;
    originalAbsRef.current.x ??= display.absX;
    originalAbsRef.current.y ??= display.absY;

    const rect = target.getBoundingClientRect();
    const viewportWidth = display._viewportLoc.w || 0;
    const viewportHeight = display._viewportLoc.h || 0;

    if (viewportWidth <= 0 || viewportHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const scaleX = rect.width / viewportWidth;
    const scaleY = rect.height / viewportHeight;

    if (scaleMode === 'fit') {
      rfb.scaleViewport = true;
      if (originalAbsRef.current.x) display.absX = originalAbsRef.current.x;
      if (originalAbsRef.current.y) display.absY = originalAbsRef.current.y;
      if (screen) {
        screen.style.alignItems = 'center';
        screen.style.justifyContent = 'center';
        screen.style.overflow = 'hidden';
      }
      return;
    }

    rfb.scaleViewport = false;

    const canvas = target.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    if (scaleMode === 'native') {
      if (originalAbsRef.current.x) display.absX = originalAbsRef.current.x;
      if (originalAbsRef.current.y) display.absY = originalAbsRef.current.y;
      display.scale = 1;
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      if (screen) {
        screen.style.alignItems = 'center';
        screen.style.justifyContent = 'center';
        screen.style.overflow = 'auto';
      }
      return;
    }

    display.scale = scaleX;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    display.absX = (x: number) => Math.trunc(x / scaleX + (display._viewportLoc?.x ?? 0));
    display.absY = (y: number) => Math.trunc(y / scaleY + (display._viewportLoc?.y ?? 0));
    if (screen) {
      screen.style.alignItems = 'stretch';
      screen.style.justifyContent = 'stretch';
      screen.style.overflow = 'hidden';
    }
  }

  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  useEffect(() => {
    onConnectionStateChangeRef.current?.(connectionState);
  }, [connectionState]);

  useEffect(() => {
    setConnectionAttempt(0);
    setDisplayReady(false);
    reconnectStartedAtRef.current = null;

    if (initialDelayTimerRef.current != null) {
      window.clearTimeout(initialDelayTimerRef.current);
      initialDelayTimerRef.current = null;
    }

    if (!active || !machineRunning || !url) {
      setConnectionState(machineRunning ? 'waiting-display' : 'waiting-runtime');
      return;
    }

    setConnectionState(initialDelayMs > 0 ? 'waiting-display' : 'connecting');
    initialDelayTimerRef.current = window.setTimeout(() => {
      setDisplayReady(true);
    }, initialDelayMs);

    return () => {
      if (initialDelayTimerRef.current != null) {
        window.clearTimeout(initialDelayTimerRef.current);
        initialDelayTimerRef.current = null;
      }
    };
  }, [active, initialDelayMs, machineRunning, url]);

  useEffect(() => {
    const target = mountRef.current;
    if (!active || !machineRunning || !displayReady || !target || !url) {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
      return;
    }

    let disposed = false;
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    target.replaceChildren();
    setConnectionState(connectionAttempt > 0 ? 'reconnecting' : 'connecting');

    let rfb: RFB;
    try {
      rfb = new RFB(target, url, {
        credentials: password ? { password } : undefined,
        shared: true
      });
    } catch {
      setConnectionState('unavailable');
      return () => undefined;
    }
    rfb.viewOnly = false;
    rfb.scaleViewport = scaleMode === 'fit';
    rfb.resizeSession = false;
    rfb.background = getComputedStyle(document.documentElement).getPropertyValue('--console-surface').trim() || '#1c1724';
    rfb.clipViewport = false;
    rfb.qualityLevel = 6;
    rfb.compressionLevel = 2;
    rfbRef.current = rfb;

    const handleConnect = () => {
      if (disposed) return;
      reconnectStartedAtRef.current = null;
      applyViewportScale(rfb);
      setConnectionState('connected');
    };

    const handleDisconnect = (event: Event) => {
      if (disposed) return;
      const detail = (event as CustomEvent<{ clean?: boolean }>).detail;
      const now = Date.now();
      if (reconnectStartedAtRef.current == null) {
        reconnectStartedAtRef.current = now;
      }
      const elapsed = now - reconnectStartedAtRef.current;

      if (elapsed >= reconnectWindowMs) {
        setConnectionState('unavailable');
        return;
      }

      setConnectionState('reconnecting');
      reconnectTimerRef.current = window.setTimeout(() => {
        if (!disposed) {
          setConnectionAttempt((attempt) => attempt + 1);
        }
      }, detail?.clean ? 500 : 900);
    };

    const handleCredentialsRequired = () => {
      if (disposed) return;
      if (password) {
        rfb.sendCredentials({ password });
        return;
      }
      setConnectionState('unavailable');
    };

    const handleSecurityFailure = () => {
      if (disposed) return;
      setConnectionState('unavailable');
    };

    rfb.addEventListener('connect', handleConnect);
    rfb.addEventListener('disconnect', handleDisconnect);
    rfb.addEventListener('credentialsrequired', handleCredentialsRequired);
    rfb.addEventListener('securityfailure', handleSecurityFailure);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = new ResizeObserver(() => {
        applyViewportScale(rfb);
      });
      resizeObserverRef.current.observe(target);
    }

    return () => {
      disposed = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      rfb.removeEventListener('connect', handleConnect);
      rfb.removeEventListener('disconnect', handleDisconnect);
      rfb.removeEventListener('credentialsrequired', handleCredentialsRequired);
      rfb.removeEventListener('securityfailure', handleSecurityFailure);
      rfb.disconnect();
      if (rfbRef.current === rfb) {
        rfbRef.current = null;
      }
    };
  }, [active, connectionAttempt, displayReady, machineRunning, password, reconnectWindowMs, url]);

  // Apply scale mode to noVNC canvas
  useEffect(() => {
    const rfb = rfbRef.current;
    if (!rfb) return;
    rfb.scaleViewport = scaleMode === 'fit';
    rfb.resizeSession = false;
    applyViewportScale(rfb);
  }, [scaleMode]);

  return (
    <div className={['novnc-viewport', className, `novnc-viewport--${scaleMode}`].filter(Boolean).join(' ')}>
      <div ref={mountRef} className="novnc-viewport__mount" />
      {connectionState !== 'connected' && (
        <div className="novnc-viewport__overlay" data-state={connectionState}>
          <span className="novnc-viewport__status">
            {connectionState === 'waiting-runtime' || connectionState === 'waiting-display'
              ? t('console.waitingConnection')
              : connectionState === 'connecting'
                ? t('console.liveDisplayConnecting')
                : connectionState === 'reconnecting'
                  ? t('console.liveDisplayReconnecting')
                  : t('console.liveDisplayUnavailable')}
          </span>
        </div>
      )}
    </div>
  );
}
