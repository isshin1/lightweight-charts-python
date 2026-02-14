import { VolumeProfile, VolumeProfileOptions } from './volume-profile';
import { VolumeProfilePaneRenderer } from './pane-renderer';
import { TwoPointDrawingPaneView } from '../drawing/pane-view';
import { Coordinate, Logical } from 'lightweight-charts';


export class VolumeProfilePaneView extends TwoPointDrawingPaneView {
    _source: VolumeProfile;

    constructor(source: VolumeProfile) {
        super(source);
        this._source = source;
    }

    update() {
        if (!this._source.p1 || !this._source.p2) return;
        const series = this._source.series;
        const chart = this._source.chart;
        const timeScale = chart.timeScale();

        // Get logical positions
        const logical1 = this._source.p1.logical;
        const logical2 = this._source.p2.logical;

        // Find the last available data bar to clamp
        let lastDataLogical: number | null = null;
        const rightEdge = timeScale.coordinateToLogical(timeScale.width());
        if (rightEdge !== null) {
            for (let i = 0; i < 500; i++) {
                const idx = (rightEdge - i) as Logical;
                const d = series.dataByIndex(idx);
                if (d) {
                    lastDataLogical = idx;
                    break;
                }
            }
        }

        // Clamp logical positions to last data bar
        let clampedLogical1 = logical1;
        let clampedLogical2 = logical2;
        if (lastDataLogical !== null) {
            clampedLogical1 = Math.min(logical1, lastDataLogical) as Logical;
            clampedLogical2 = Math.min(logical2, lastDataLogical) as Logical;
        }

        // Convert X coordinates from logical positions
        const x1 = timeScale.logicalToCoordinate(clampedLogical1);
        const x2 = timeScale.logicalToCoordinate(clampedLogical2);

        // Compute volume profile FIRST so we get data-derived price range
        this._source.computeProfile();

        const profileData = this._source._profileData;

        // Use data-derived priceHigh/priceLow for Y-coordinates (like TradingView)
        // The click-point Y is irrelevant — only the X (bar selection) matters
        let y1: number | null = null;
        let y2: number | null = null;
        if (profileData) {
            y1 = series.priceToCoordinate(profileData.priceHigh) as Coordinate | null;
            y2 = series.priceToCoordinate(profileData.priceLow) as Coordinate | null;
        } else {
            // Fallback to click points if no profile data yet
            y1 = series.priceToCoordinate(this._source.p1.price);
            y2 = series.priceToCoordinate(this._source.p2.price);
        }

        this._p1 = { x: x1, y: y1 };
        this._p2 = { x: x2, y: y2 };
    }

    renderer() {
        const profileData = this._source._profileData;
        const series = this._source.series;
        const chart = this._source.chart;

        // Convert profile row prices to screen Y coordinates
        let rowScreenData: { yTop: number; yBottom: number; upVolume: number; downVolume: number; totalVolume: number }[] | null = null;
        let pocY: number | null = null;
        let maxVolume = 0;

        if (profileData && profileData.rows.length > 0) {
            rowScreenData = [];
            maxVolume = profileData.maxVolume;

            for (let r = 0; r < profileData.rows.length; r++) {
                const row = profileData.rows[r];
                const yTop = series.priceToCoordinate(row.priceTop);
                const yBottom = series.priceToCoordinate(row.priceBottom);
                if (yTop === null || yBottom === null) continue;

                rowScreenData.push({
                    yTop: yTop as number,
                    yBottom: yBottom as number,
                    upVolume: row.upVolume,
                    downVolume: row.downVolume,
                    totalVolume: row.totalVolume,
                });
            }

            // POC Y coordinate
            const pocRow = profileData.rows[profileData.pocIndex];
            pocY = series.priceToCoordinate(pocRow.priceMid) as number | null;
        }

        // Get chart right edge for POC line extension
        const chartWidth = chart.timeScale().width();

        return new VolumeProfilePaneRenderer(
            this._p1,
            this._p2,
            this._source._options as VolumeProfileOptions,
            this._source.hovered,
            rowScreenData,
            pocY,
            maxVolume,
            chartWidth,
        );
    }
}
