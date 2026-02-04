/**
 * Countdown Timer Module
 * 
 * Provides an asynchronous countdown timer that updates every second,
 * independent of tick data, to keep the candlestick countdown label accurate.
 */

declare global {
    interface Window {
        candleInterval?: number | null;
        _countdownRefreshInterval?: ReturnType<typeof setInterval>;
        _countdownCharts: any[];
        _isMouseDragging?: boolean;  // Track if chart is being dragged
    }
}

/**
 * Initialize the countdown timer refresh system.
 * This sets up a global 1-second interval that triggers chart redraws
 * during market hours to keep the countdown timer updated.
 * 
 * Also sets up mouse event listeners to detect drag operations and
 * pause updates during drag to prevent interference.
 */
export function initCountdownTimer(): void {
    // Avoid duplicate initialization
    if (window._countdownRefreshInterval) {
        return;
    }

    window._countdownCharts = window._countdownCharts || [];
    window._isMouseDragging = false;

    // Setup global drag detection
    document.addEventListener('mousedown', () => {
        window._isMouseDragging = true;
    });
    document.addEventListener('mouseup', () => {
        window._isMouseDragging = false;
    });
    // Also detect if mouse leaves the window during drag
    document.addEventListener('mouseleave', () => {
        window._isMouseDragging = false;
    });

    // Start global 1-second interval
    window._countdownRefreshInterval = setInterval(() => {
        // Skip updates during mouse drag to prevent interference with pan/zoom
        if (window._isMouseDragging) {
            return;
        }

        // Check Market Hours (09:15 - 15:30 IST)
        const now = new Date();
        const totalMins = now.getHours() * 60 + now.getMinutes();
        const startMins = 9 * 60 + 15;  // 09:15
        const endMins = 15 * 60 + 30;   // 15:30

        if (totalMins >= startMins && totalMins < endMins && window.candleInterval) {
            // Trigger lightUpdate on all registered chart models
            (window._countdownCharts || []).forEach(model => {
                try {
                    if (model && typeof model._internal_lightUpdate === 'function') {
                        model._internal_lightUpdate();
                    }
                } catch (e) {
                    // Ignore errors from destroyed charts
                }
            });
        }
    }, 1000);
}

/**
 * Register a chart model for countdown timer updates.
 * @param model - The chart model to register
 */
export function registerChartForCountdown(model: any): void {
    if (!window._countdownCharts) {
        window._countdownCharts = [];
    }

    if (model && !window._countdownCharts.includes(model)) {
        window._countdownCharts.push(model);
    }

    // Also ensure the timer is initialized
    initCountdownTimer();
}

/**
 * Unregister a chart model from countdown timer updates.
 * @param model - The chart model to unregister
 */
export function unregisterChartFromCountdown(model: any): void {
    if (!window._countdownCharts) return;

    const idx = window._countdownCharts.indexOf(model);
    if (idx > -1) {
        window._countdownCharts.splice(idx, 1);
    }
}

/**
 * Stop the countdown timer completely.
 */
export function stopCountdownTimer(): void {
    if (window._countdownRefreshInterval) {
        clearInterval(window._countdownRefreshInterval);
        window._countdownRefreshInterval = undefined;
    }
    window._countdownCharts = [];
}
