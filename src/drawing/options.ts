import { LineStyle } from "lightweight-charts";


export interface DrawingOptions {
    lineColor: string;
    lineStyle: LineStyle
    width: number;
}

export const defaultOptions: DrawingOptions = {
    lineColor: '#000000',  // Black for visibility on white backgrounds
    lineStyle: LineStyle.Solid,
    width: 2,  // Thinner lines (was 4)
};
