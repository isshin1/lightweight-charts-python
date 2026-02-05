import { LineStyle } from "lightweight-charts";


export interface DrawingOptions {
    lineColor: string;
    lineStyle: LineStyle
    width: number;
    // Label properties (optional)
    text?: string;
    textPosition?: 'above' | 'below';
    labelPos?: number;  // Position along the line (0 to 1, default 0.5)
    // Fixed width (from right edge)
    fixedWidth?: number;  // If set, line is only this many pixels wide from right edge
    // Axis label visibility
    axisLabelVisible?: boolean;  // If false, hide axis label (default true)
}

export const defaultOptions: DrawingOptions = {
    lineColor: '#000000',  // Black for visibility on white backgrounds
    lineStyle: LineStyle.Solid,
    width: 1,  // Default 1px line width
};
