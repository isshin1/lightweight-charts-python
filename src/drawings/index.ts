/**
 * Drawings Module
 * 
 * This module consolidates all drawing-related functionality.
 * It re-exports from existing modules and adds any missing utilities.
 */

// Base classes and types - from existing drawing module
export { Drawing, InteractionState } from '../drawing/drawing';
export { defaultOptions } from '../drawing/options';
export type { DrawingOptions } from '../drawing/options';
export type { Point, DiffPoint } from '../drawing/data-source';
export { DrawingPaneView, TwoPointDrawingPaneView } from '../drawing/pane-view';
export { DrawingPaneRenderer, TwoPointDrawingPaneRenderer } from '../drawing/pane-renderer';
export { TwoPointDrawing } from '../drawing/two-point-drawing';

// Drawing tool
export { DrawingTool } from '../drawing/drawing-tool';

// Concrete drawing implementations
export { TrendLine } from '../trend-line/trend-line';
export { HorizontalLine } from '../horizontal-line/horizontal-line';
export { RayLine } from '../horizontal-line/ray-line';
export { VerticalLine } from '../vertical-line/vertical-line';
export { Box } from '../box/box';
export { TextAnnotation } from '../text-annotation/text-annotation';
export { ArrowMarker, ArrowUpMarker, ArrowDownMarker } from '../arrow-marker/arrow-marker';

// Context menu
export { ContextMenu, camelToTitle } from '../context-menu/context-menu';
export { ColorPicker } from '../context-menu/color-picker';
export { StylePicker } from '../context-menu/style-picker';
export { WidthPicker } from '../context-menu/width-picker';

// Toolbox component
export { ToolBox } from '../general/toolbox';

// Utility functions
export { showInputModal } from './input-modal';
export type { InputModalResult } from './input-modal';

// Canvas helpers
export { setLineStyle } from '../helpers/canvas-rendering';

