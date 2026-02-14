import {
    MouseEventParams,
    Logical,
} from 'lightweight-charts';

import { Point, DiffPoint } from '../drawing/data-source';
import { InteractionState } from '../drawing/drawing';
import { DrawingOptions, defaultOptions } from '../drawing/options';
import { VolumeProfilePaneView } from './pane-view';
import { TwoPointDrawing } from '../drawing/two-point-drawing';


export interface VolumeProfileRow {
    priceTop: number;
    priceBottom: number;
    priceMid: number;
    upVolume: number;
    downVolume: number;
    totalVolume: number;
}

export interface VolumeProfileData {
    rows: VolumeProfileRow[];
    pocIndex: number; // index into rows with max volume
    maxVolume: number;
    priceHigh: number;
    priceLow: number;
}

export interface VolumeProfileOptions extends DrawingOptions {
    upColor: string;
    downColor: string;
    pocColor: string;
    backgroundTint: string;
    numRows: number;
}

const defaultVolumeProfileOptions: VolumeProfileOptions = {
    ...defaultOptions,
    lineColor: 'rgba(41, 98, 255, 0.3)',
    upColor: 'rgba(41, 98, 255, 0.50)',      // TradingView blue
    downColor: 'rgba(255, 235, 59, 0.50)',   // TradingView yellow
    pocColor: 'rgba(255, 82, 82, 0.80)',     // TradingView red
    backgroundTint: 'rgba(41, 98, 255, 0.06)',
    numRows: 24,
    width: 1,
};


export class VolumeProfile extends TwoPointDrawing {
    _type = "VolumeProfile";

    // Computed volume profile data (refreshed on every view update)
    _profileData: VolumeProfileData | null = null;

    constructor(
        p1: Point,
        p2: Point,
        options?: Partial<VolumeProfileOptions>
    ) {
        super(p1, p2, options);
        this._options = {
            ...defaultVolumeProfileOptions,
            ...options,
        };
        this._paneViews = [new VolumeProfilePaneView(this)];
    }

    get profileOptions(): VolumeProfileOptions {
        return this._options as VolumeProfileOptions;
    }

    /**
     * Compute volume profile data from the series bars between p1 and p2.
     * Called by the pane-view on each update.
     */
    computeProfile(): VolumeProfileData | null {
        if (!this.isAttached || !this.p1 || !this.p2) return null;

        const series = this.series;
        const logicalStart = Math.min(this.p1.logical, this.p2.logical);
        const logicalEnd = Math.max(this.p1.logical, this.p2.logical);

        // Find volume data stored on the handler object by Python
        let volData: Record<number, number> | null = null;
        try {
            const handlers = (window as any).allChartHandlers;
            if (handlers) {
                for (const h of handlers) {
                    if (h.chart === this.chart) {
                        volData = h._volData || null;
                        const count = volData ? Object.keys(volData).length : 0;
                        if (count === 0) {
                            console.log(`[VolumeProfile] handler found but _volData empty/missing. id=${h.id}`);
                        }
                        break;
                    }
                }
            }
        } catch (e) { console.log(`[VolumeProfile] Error finding volData:`, e); }

        // Clamp to last available bar
        let lastBarIdx = logicalEnd;
        for (let i = logicalEnd; i >= logicalStart; i--) {
            const d = series.dataByIndex(i as Logical);
            if (d) {
                lastBarIdx = i;
                break;
            }
        }

        // Gather OHLCV data
        interface BarData {
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }
        const bars: BarData[] = [];
        let priceHigh = -Infinity;
        let priceLow = Infinity;

        for (let i = logicalStart; i <= lastBarIdx; i++) {
            const d = series.dataByIndex(i as Logical) as any;
            if (!d) continue;

            const open = d.open ?? d.value ?? 0;
            const high = d.high ?? open;
            const low = d.low ?? open;
            const close = d.close ?? open;

            // Get volume from the global _volData_ object using bar's time
            let volume = 1; // fallback: treat each bar as equal weight
            const barTime = d.time;
            if (volData && barTime != null) {
                const v = volData[barTime];
                if (v != null && v > 0) {
                    volume = v;
                }
            }

            if (high > priceHigh) priceHigh = high;
            if (low < priceLow) priceLow = low;

            bars.push({ open, high, low, close, volume });
        }

        if (bars.length === 0 || priceHigh <= priceLow) return null;

        // Debug: log summary
        const totalVol = bars.reduce((s, b) => s + b.volume, 0);
        console.log(`[VolumeProfile] bars=${bars.length}, priceRange=${priceLow.toFixed(2)}-${priceHigh.toFixed(2)}, totalVol=${totalVol.toFixed(0)}, volDataKeys=${volData ? Object.keys(volData).length : 0}`);

        // --- Close-based binning (matching TradingView / Pine Script approach) ---
        // Each bar's ENTIRE volume goes to the bin whose midpoint is closest to bar.close
        const numRows = 30; // Match Pine Script's 30 bins
        const priceRange = priceHigh - priceLow;
        const rowHeight = priceRange / numRows;

        // Initialize rows
        const rows: VolumeProfileRow[] = [];
        for (let r = 0; r < numRows; r++) {
            const priceBottom = priceLow + r * rowHeight;
            const priceTop = priceBottom + rowHeight;
            rows.push({
                priceTop,
                priceBottom,
                priceMid: (priceTop + priceBottom) / 2,
                upVolume: 0,
                downVolume: 0,
                totalVolume: 0,
            });
        }

        // Distribute volume: assign each bar's volume to the closest bin by close price
        for (const bar of bars) {
            if (bar.volume <= 0) continue;
            const isUp = bar.close >= bar.open;

            // Find the bin whose midpoint is closest to the close price
            let bestRow = 0;
            let bestDist = Infinity;
            for (let r = 0; r < numRows; r++) {
                const dist = Math.abs(bar.close - rows[r].priceMid);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestRow = r;
                }
            }

            if (isUp) {
                rows[bestRow].upVolume += bar.volume;
            } else {
                rows[bestRow].downVolume += bar.volume;
            }
        }

        // Calculate totalVolume and find POC
        let maxVolume = 0;
        let pocIndex = 0;
        for (let r = 0; r < numRows; r++) {
            rows[r].totalVolume = rows[r].upVolume + rows[r].downVolume;
            if (rows[r].totalVolume > maxVolume) {
                maxVolume = rows[r].totalVolume;
                pocIndex = r;
            }
        }

        // Debug: log POC
        console.log(`[VolumeProfile] POC row[${pocIndex}]: price=${rows[pocIndex].priceMid.toFixed(2)}, vol=${maxVolume.toFixed(0)}`);

        this._profileData = {
            rows,
            pocIndex,
            maxVolume,
            priceHigh,
            priceLow,
        };

        return this._profileData;
    }

    _moveToState(state: InteractionState) {
        switch (state) {
            case InteractionState.NONE:
                document.body.style.cursor = "default";
                this._hovered = false;
                this.requestUpdate();
                this._unsubscribe("mousedown", this._handleMouseDownInteraction);
                break;

            case InteractionState.HOVERING:
                document.body.style.cursor = "pointer";
                this._hovered = true;
                this.requestUpdate();
                this._subscribe("mousedown", this._handleMouseDownInteraction);
                this._unsubscribe("mouseup", this._handleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: true });
                break;

            case InteractionState.DRAGGINGP1:
            case InteractionState.DRAGGINGP2:
            case InteractionState.DRAGGING:
                document.body.style.cursor = "grabbing";
                this._subscribe("mouseup", this._handleMouseUpInteraction);
                this.chart.applyOptions({ handleScroll: false });
                break;
        }
        this._state = state;
    }

    _onDrag(diff: DiffPoint) {
        if (this._state == InteractionState.DRAGGING || this._state == InteractionState.DRAGGINGP1) {
            this._addDiffToPoint(this.p1, diff.logical, diff.price);
        }
        if (this._state == InteractionState.DRAGGING || this._state == InteractionState.DRAGGINGP2) {
            this._addDiffToPoint(this.p2, diff.logical, diff.price);
        }
    }

    protected _onMouseDown() {
        this._startDragPoint = null;
        const hoverPoint = this._latestHoverPoint;
        if (!hoverPoint) return;

        const p1 = this._paneViews[0]._p1;
        const p2 = this._paneViews[0]._p2;

        if (!p1.x || !p2.x || !p1.y || !p2.y) return this._moveToState(InteractionState.DRAGGING);

        const tolerance = 10;
        if (Math.abs(hoverPoint.x - p1.x) < tolerance && Math.abs(hoverPoint.y - p1.y) < tolerance) {
            this._moveToState(InteractionState.DRAGGINGP1);
        }
        else if (Math.abs(hoverPoint.x - p2.x) < tolerance && Math.abs(hoverPoint.y - p2.y) < tolerance) {
            this._moveToState(InteractionState.DRAGGINGP2);
        }
        else {
            this._moveToState(InteractionState.DRAGGING);
        }
    }

    protected _mouseIsOverDrawing(param: MouseEventParams, tolerance = 4) {
        if (!param.point) return false;

        const x1 = this._paneViews[0]._p1.x;
        const y1 = this._paneViews[0]._p1.y;
        const x2 = this._paneViews[0]._p2.x;
        const y2 = this._paneViews[0]._p2.y;
        if (x1 === null || x2 === null || y1 === null || y2 === null) return false;

        const mouseX = param.point.x;
        const mouseY = param.point.y;

        // Check if mouse is within the bounding box of the profile area
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        const halfTol = tolerance / 2;

        // Hit test: within the bounding rectangle
        if (mouseX > minX - halfTol && mouseX < maxX + halfTol &&
            mouseY > minY - halfTol && mouseY < maxY + halfTol) {
            return true;
        }

        // Also hit test the vertical lines at exact x positions
        if (Math.abs(mouseX - x1) < tolerance && mouseY > minY - halfTol && mouseY < maxY + halfTol) return true;
        if (Math.abs(mouseX - x2) < tolerance && mouseY > minY - halfTol && mouseY < maxY + halfTol) return true;

        return false;
    }
}
