import { ViewPoint } from "../drawing/pane-view";
import { CanvasRenderingTarget2D } from "fancy-canvas";
import { TwoPointDrawingPaneRenderer } from "../drawing/pane-renderer";
import { VolumeProfileOptions } from "./volume-profile";


export interface RowScreenData {
    yTop: number;
    yBottom: number;
    upVolume: number;
    downVolume: number;
    totalVolume: number;
}


export class VolumeProfilePaneRenderer extends TwoPointDrawingPaneRenderer {
    declare _options: VolumeProfileOptions;

    private _rowScreenData: RowScreenData[] | null;
    private _pocY: number | null;
    private _maxVolume: number;
    private _chartWidth: number;

    constructor(
        p1: ViewPoint,
        p2: ViewPoint,
        options: VolumeProfileOptions,
        hovered: boolean,
        rowScreenData: RowScreenData[] | null,
        pocY: number | null,
        maxVolume: number,
        chartWidth: number,
    ) {
        super(p1, p2, options, hovered);
        this._rowScreenData = rowScreenData;
        this._pocY = pocY;
        this._maxVolume = maxVolume;
        this._chartWidth = chartWidth;
    }

    draw(target: CanvasRenderingTarget2D) {
        target.useBitmapCoordinateSpace(scope => {
            const ctx = scope.context;
            const scaled = this._getScaledCoordinates(scope);
            if (!scaled) return;

            const hratio = scope.horizontalPixelRatio;
            const vratio = scope.verticalPixelRatio;

            const leftX = Math.min(scaled.x1, scaled.x2);
            const rightX = Math.max(scaled.x1, scaled.x2);
            const topY = Math.min(scaled.y1, scaled.y2);
            const bottomY = Math.max(scaled.y1, scaled.y2);
            const profileWidth = rightX - leftX;

            // 1. Background tint — very subtle, matching TradingView
            if (this._options.backgroundTint && this._options.backgroundTint !== 'transparent') {
                ctx.fillStyle = this._options.backgroundTint;
                ctx.fillRect(leftX, topY, profileWidth, bottomY - topY);
            }

            // 3. Draw histogram bars — bars span from leftX rightward, proportional to volume
            if (this._rowScreenData && this._maxVolume > 0) {
                // Max-volume bar fills the FULL selection width (like TradingView)
                const maxBarWidth = profileWidth;
                const barGap = 1 * vratio; // 1px gap between bars

                for (const row of this._rowScreenData) {
                    if (row.totalVolume <= 0) continue;

                    const yT = Math.round(row.yTop * vratio);
                    const yB = Math.round(row.yBottom * vratio);
                    const rowPixelHeight = Math.abs(yB - yT) - barGap;
                    if (rowPixelHeight <= 0) continue;

                    const rowTop = Math.min(yT, yB) + barGap / 2;

                    const totalBarWidth = (row.totalVolume / this._maxVolume) * maxBarWidth;

                    // Split into up (left, cyan) and down (right, magenta) — TradingView style
                    const upFraction = row.totalVolume > 0 ? row.upVolume / row.totalVolume : 0;
                    const upBarWidth = totalBarWidth * upFraction;
                    const downBarWidth = totalBarWidth - upBarWidth;

                    // Up volume bar (from left edge, cyan)
                    if (upBarWidth > 0) {
                        ctx.fillStyle = this._options.upColor;
                        ctx.fillRect(leftX, rowTop, upBarWidth, rowPixelHeight);
                    }

                    // Down volume bar (continues after up, magenta)
                    if (downBarWidth > 0) {
                        ctx.fillStyle = this._options.downColor;
                        ctx.fillRect(leftX + upBarWidth, rowTop, downBarWidth, rowPixelHeight);
                    }
                }
            }

            // 4. POC line — dashed red line at max volume row, extending to chart right edge
            if (this._pocY !== null) {
                const pocYScaled = Math.round(this._pocY * vratio);
                const chartRightScaled = this._chartWidth * hratio;

                ctx.strokeStyle = this._options.pocColor;
                ctx.lineWidth = 1.5 * hratio;
                ctx.setLineDash([4 * hratio, 3 * hratio]);
                ctx.beginPath();
                ctx.moveTo(leftX, pocYScaled);
                ctx.lineTo(chartRightScaled, pocYScaled);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 5. (Grid lines removed — TradingView doesn't show them)

            // 6. Endpoint circles (when hovered, for drag handles)
            if (this._hovered) {
                this._drawEndCircle(scope, scaled.x1, scaled.y1);
                this._drawEndCircle(scope, scaled.x2, scaled.y2);
            }
        });
    }
}
