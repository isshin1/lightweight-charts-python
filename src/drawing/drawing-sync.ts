/**
 * drawing-sync.ts
 * 
 * Manages real-time synchronization of drawings across multiple charts
 * that share the same symbol. This is essential for split chart views
 * where users expect drawings to appear on all charts with the same symbol.
 */

import { Drawing } from '../drawing/drawing';
import { TrendLine } from '../trend-line/trend-line';
import { Box } from '../box/box';
import { HorizontalLine } from '../horizontal-line/horizontal-line';
import { RayLine } from '../horizontal-line/ray-line';
import { VerticalLine } from '../vertical-line/vertical-line';
import { TextAnnotation } from '../text-annotation/text-annotation';

interface ChartRegistration {
    handlerID: string;
    symbol: string;
    toolbox: any; // Reference to chart's ToolBox
    drawingTool: any; // Reference to chart's DrawingTool
}

declare const window: any;

/**
 * Global manager for synchronizing drawings across charts with the same symbol.
 * 
 * Usage:
 * 1. Register charts: DrawingSyncManager.registerChart(handlerID, symbol, toolbox)
 * 2. On drawing change: DrawingSyncManager.syncDrawings(sourceHandlerID)
 * 3. On symbol change: DrawingSyncManager.updateSymbol(handlerID, newSymbol)
 */
export class DrawingSyncManager {
    private static _instance: DrawingSyncManager;
    private _charts: Map<string, ChartRegistration> = new Map();
    private _syncInProgress: Set<string> = new Set();

    private constructor() {
        // Drawing sync initialized
    }

    static getInstance(): DrawingSyncManager {
        if (!DrawingSyncManager._instance) {
            DrawingSyncManager._instance = new DrawingSyncManager();
        }
        return DrawingSyncManager._instance;
    }

    /**
     * Register a chart for drawing synchronization.
     */
    registerChart(handlerID: string, symbol: string, toolbox: any): void {
        this._charts.set(handlerID, {
            handlerID,
            symbol,
            toolbox,
            drawingTool: toolbox._drawingTool
        });
    }

    /**
     * Unregister a chart (e.g., when closing a split).
     */
    unregisterChart(handlerID: string): void {
        this._charts.delete(handlerID);
    }

    /**
     * Update the symbol for a chart (e.g., when user changes symbol on one chart).
     */
    updateSymbol(handlerID: string, newSymbol: string): void {
        const chart = this._charts.get(handlerID);
        if (chart) {
            chart.symbol = newSymbol;
        }
    }

    /**
     * Get all charts with a specific symbol, excluding a source chart.
     */
    private _getChartsWithSymbol(symbol: string, excludeHandlerID?: string): ChartRegistration[] {
        const result: ChartRegistration[] = [];
        for (const [id, chart] of this._charts) {
            if (chart.symbol === symbol && id !== excludeHandlerID) {
                result.push(chart);
            }
        }
        return result;
    }

    /**
     * Sync drawings from source chart to all other charts with the same symbol.
     * 
     * This is the main entry point for syncing after a drawing is made.
     * Uses deferred execution to avoid interfering with the drawing process.
     */
    syncFromChart(sourceHandlerID: string): void {
        const sourceChart = this._charts.get(sourceHandlerID);
        if (!sourceChart) {
            console.warn(`[DrawingSyncManager] Source chart ${sourceHandlerID} not found`);
            return;
        }

        const symbol = sourceChart.symbol;
        const targetCharts = this._getChartsWithSymbol(symbol, sourceHandlerID);

        if (targetCharts.length === 0) {
            // No other charts to sync to
            return;
        }

        // Get current drawings from source chart
        const sourceDrawings = this._serializeDrawings(sourceChart.drawingTool.drawings);

        // Apply to all target charts (deferred to next frame to avoid UI conflicts)
        requestAnimationFrame(() => {
            for (const targetChart of targetCharts) {
                // Prevent sync loops
                if (this._syncInProgress.has(targetChart.handlerID)) {
                    continue;
                }

                this._applyDrawingsToChart(targetChart, sourceDrawings);
            }
        });
    }

    /**
     * Serialize drawings array to transferable format.
     */
    private _serializeDrawings(drawings: Drawing[]): any[] {
        return drawings.map(d => {
            const meta: any = {
                type: d._type,
                points: d.points.map(p => ({
                    time: p?.time,
                    logical: p?.logical,
                    price: p?.price
                })),
                options: { ...d._options }
            };

            // Special handling for TextAnnotation
            if (d._type === 'TextAnnotation' && (d as any)._text) {
                meta.options.text = (d as any)._text;
            }

            return meta;
        });
    }

    /**
     * Apply serialized drawings to a target chart.
     */
    private _applyDrawingsToChart(chart: ChartRegistration, drawings: any[]): void {
        try {
            this._syncInProgress.add(chart.handlerID);

            // Clear existing drawings on target
            chart.drawingTool.clearDrawings();

            // Load new drawings
            for (const d of drawings) {
                let newDrawing: Drawing | null = null;

                switch (d.type) {
                    case "Box":
                        newDrawing = new Box(d.points[0], d.points[1], d.options);
                        break;
                    case "TrendLine":
                        newDrawing = new TrendLine(d.points[0], d.points[1], d.options);
                        break;
                    case "HorizontalLine":
                        newDrawing = new HorizontalLine(d.points[0], d.options);
                        break;
                    case "RayLine":
                        newDrawing = new RayLine(d.points[0], d.options);
                        break;
                    case "VerticalLine":
                        newDrawing = new VerticalLine(d.points[0], d.options);
                        break;
                    case "TextAnnotation":
                        const text = (d.options?.text) || "Text";
                        newDrawing = new TextAnnotation(d.points[0], text, d.options);
                        break;
                }

                if (newDrawing) {
                    chart.drawingTool.addNewDrawing(newDrawing);
                }
            }
        } catch (e) {
            console.error(`[DrawingSyncManager] Error applying drawings to ${chart.handlerID}:`, e);
        } finally {
            // Clear sync flag after a short delay to prevent rapid re-sync
            setTimeout(() => {
                this._syncInProgress.delete(chart.handlerID);
            }, 100);
        }
    }

    /**
     * Load drawings from Python and apply to a specific chart (initial load).
     * Also syncs to other charts with the same symbol.
     */
    loadDrawingsForChart(handlerID: string, drawings: any[]): void {
        const chart = this._charts.get(handlerID);
        if (!chart) {
            console.warn(`[DrawingSyncManager] Chart ${handlerID} not found for loading`);
            return;
        }

        // Apply to specified chart
        this._applyDrawingsToChart(chart, drawings);
    }

    /**
     * Debug: Get all registered charts.
     */
    getRegisteredCharts(): string[] {
        return Array.from(this._charts.keys());
    }

    /**
     * Debug: Get charts grouped by symbol.
     */
    getChartsBySymbol(): Record<string, string[]> {
        const result: Record<string, string[]> = {};
        for (const [id, chart] of this._charts) {
            if (!result[chart.symbol]) {
                result[chart.symbol] = [];
            }
            result[chart.symbol].push(id);
        }
        return result;
    }
}

// Create singleton instance and expose globally for Python access
const drawingSyncManager = DrawingSyncManager.getInstance();

// Expose to window for Python bridge
if (typeof window !== 'undefined') {
    (window as any).DrawingSyncManager = drawingSyncManager;
}

export { drawingSyncManager };
