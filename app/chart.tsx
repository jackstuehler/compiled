"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { formatTick, formatValue, type MeasureFormat } from "@/lib/measures";
import styles from "./chart.module.css";

export type Point = {
  id: number;
  label: string;
  x: number;
  y: number;
};

// The chart's own coordinate system. The SVG is scaled to fit whatever space
// it's given, so these behave like proportions rather than screen pixels.
const WIDTH = 1000;
const HEIGHT = 540;

// Room around the plot area for the tick labels and axis titles. The left side
// needs the most, because that's where the y-axis numbers go.
const PADDING = { top: 16, right: 24, bottom: 56, left: 84 };

// The plot area itself — the rectangle the dots live in.
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

// Tooltip dimensions are estimated from text length rather than measured.
const CHAR_WIDTH = 6.7; // rough width of one character at 12px system-ui
const LINE_HEIGHT = 16;
const TOOLTIP_PADDING = 8;
const TOOLTIP_GAP = 12; // space between the dot and the tooltip box

// Ignore very small drags so accidental clicks do not create a zoom window.
const MINIMUM_DRAG = 12;

// The "Reset zoom" control, drawn in the top-right corner of the plot area.
const RESET_WIDTH = 88;
const RESET_HEIGHT = 24;
const RESET_INSET = 8; // gap between the control and the edges of the plot area

// Unique SVG clip path for hiding points outside the plot area.
const CLIP_ID = "chart-plot-area";

/** The visible span of one axis, in data values. */
type AxisRange = {
  low: number;
  high: number;
};

/** The zoom window: a range on each axis, or null when fully zoomed out. */
type Zoom = {
  x: AxisRange;
  y: AxisRange;
};

/** A rectangle being dragged, in chart coordinates. */
type Drag = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

/** Keeps a number inside a range. */
function clamp(value: number, lowest: number, highest: number) {
  if (value < lowest) {
    return lowest;
  }
  if (value > highest) {
    return highest;
  }
  return value;
}

/** Converts a drag in any direction into a normalized rectangle. */
function dragToRectangle(drag: Drag) {
  let left = drag.startX;
  let right = drag.endX;
  if (right < left) {
    left = drag.endX;
    right = drag.startX;
  }

  let top = drag.startY;
  let bottom = drag.endY;
  if (bottom < top) {
    top = drag.endY;
    bottom = drag.startY;
  }

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Chooses readable axis ticks using 1, 2, 5, or 10 times a power of ten,
 * and expands the axis bounds outward to whole tick intervals.
 */
function chooseTicks(min: number, max: number, targetCount = 6) {
  // Avoid a zero-width axis when every value is identical.
  if (min === max) {
    min = min - 0.5;
    max = max + 0.5;
  }

  // How far apart the labels would be if we simply divided the range evenly.
  const roughStep = (max - min) / targetCount;

  // Split that into a power of ten and what's left over.
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  // Round the leftover up to 1, 2, 5 or 10, then scale back up.
  let niceMultiple: number;
  if (normalized <= 1) {
    niceMultiple = 1;
  } else if (normalized <= 2) {
    niceMultiple = 2;
  } else if (normalized <= 5) {
    niceMultiple = 5;
  } else {
    niceMultiple = 10;
  }
  const step = niceMultiple * magnitude;

  // Stretch the range out to the nearest whole step in each direction, so the
  // first and last ticks land exactly at the ends of the axis.
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  // Compute each tick from `low` to avoid accumulating floating-point error.
  const tolerance = step * 1e-9;
  for (let i = 0; low + i * step <= high + tolerance; i++) {
    ticks.push(low + i * step);
  }

  return { ticks, low, high, step };
}

export default function Chart({
  points,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  highlightedIds,
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  xFormat: MeasureFormat;
  yFormat: MeasureFormat;
  // null means no active highlighting.
  highlightedIds: Set<number> | null;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);

  // The part of the data currently on screen. null means "show everything".
  const [zoom, setZoom] = useState<Zoom | null>(null);

  // The rectangle the user is dragging right now, if any. Separate from `zoom`
  // because it changes on every mouse move and is thrown away when the drag
  // ends — only the final rectangle becomes a zoom.
  const [drag, setDrag] = useState<Drag | null>(null);

  // Needed to convert browser pointer coordinates into SVG coordinates.
  const svgRef = useRef<SVGSVGElement | null>(null);

  // The range of the data on each axis, and the round tick values that follow
  // from it.
  const axes = useMemo(() => {
    if (points.length === 0) {
      return null;
    }

    // Zoomed axes are derived from the selected data window.
    if (zoom !== null) {
      return {
        x: chooseTicks(zoom.x.low, zoom.x.high),
        y: chooseTicks(zoom.y.low, zoom.y.high),
      };
    }

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const point of points) {
      if (point.x < xMin) xMin = point.x;
      if (point.x > xMax) xMax = point.x;
      if (point.y < yMin) yMin = point.y;
      if (point.y > yMax) yMax = point.y;
    }

    return {
      x: chooseTicks(xMin, xMax),
      y: chooseTicks(yMin, yMax),
    };
  }, [points, zoom]);

  // New point data makes the previous zoom window meaningless.
  useEffect(() => {
    setZoom(null);
  }, [points]);

  if (axes === null) {
    return (
      <p className={styles.emptyMessage}>
        Nothing to plot — no college has data for both of these measures.
      </p>
    );
  }

  const xAxis = axes.x;
  const yAxis = axes.y;

  function scaleX(value: number) {
    const fraction = (value - xAxis.low) / (xAxis.high - xAxis.low);
    return PADDING.left + fraction * PLOT_WIDTH;
  }

  // SVG y coordinates increase downward, so the vertical scale is inverted.
  function scaleY(value: number) {
    const fraction = (value - yAxis.low) / (yAxis.high - yAxis.low);
    return PADDING.top + PLOT_HEIGHT - fraction * PLOT_HEIGHT;
  }

  function valueAtX(pixelX: number) {
    const fraction = (pixelX - PADDING.left) / PLOT_WIDTH;
    return xAxis.low + fraction * (xAxis.high - xAxis.low);
  }

  function valueAtY(pixelY: number) {
    const fraction = (PADDING.top + PLOT_HEIGHT - pixelY) / PLOT_HEIGHT;
    return yAxis.low + fraction * (yAxis.high - yAxis.low);
  }

  /**
   * Converts browser pointer coordinates into the SVG's coordinate system,
   * then clamps them to the plot area.
   */
  function chartPosition(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (svg === null) {
      return null;
    }

    const chartToScreen = svg.getScreenCTM();
    if (chartToScreen === null) {
      return null;
    }

    const screenPosition = new DOMPoint(event.clientX, event.clientY);
    const chartPoint = screenPosition.matrixTransform(chartToScreen.inverse());

    return {
      x: clamp(chartPoint.x, PADDING.left, PADDING.left + PLOT_WIDTH),
      y: clamp(chartPoint.y, PADDING.top, PADDING.top + PLOT_HEIGHT),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    // Only mouse/pen primary-button drags initiate zoom.
    if (event.button !== 0) {
      return;
    }

    // Preserve normal page scrolling on touch devices.
    if (event.pointerType === "touch") {
      return;
    }

    const start = chartPosition(event);
    if (start === null) {
      return;
    }

    // Keep receiving drag events even if the pointer leaves the SVG.
    event.currentTarget.setPointerCapture(event.pointerId);

    setDrag({ startX: start.x, startY: start.y, endX: start.x, endY: start.y });

    // A tooltip hovering over the rectangle you're drawing is just in the way.
    setHoveredPoint(null);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag === null) {
      return;
    }

    const current = chartPosition(event);
    if (current === null) {
      return;
    }

    setDrag({ ...drag, endX: current.x, endY: current.y });
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (drag === null) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const rectangle = dragToRectangle(drag);
    setDrag(null);

    if (rectangle.width < MINIMUM_DRAG || rectangle.height < MINIMUM_DRAG) {
      return;
    }

    // The rectangle is in pixels; the zoom window is in data values. Note the
    // y-axis flip: the *bottom* edge of the rectangle is the *low* data value.
    setZoom({
      x: { low: valueAtX(rectangle.left), high: valueAtX(rectangle.right) },
      y: { low: valueAtY(rectangle.bottom), high: valueAtY(rectangle.top) },
    });
  }

  // Losing the pointer mid-drag — a phone call arriving, the browser stealing
  // focus — should abandon the rectangle rather than freeze it on screen.
  function handlePointerCancel() {
    setDrag(null);
  }

  function handleResetZoom() {
    setZoom(null);
  }

  // Prevent the reset control from also starting a zoom drag.
  function handleResetPointerDown(event: ReactPointerEvent<SVGGElement>) {
    event.stopPropagation();
    handleResetZoom();
  }

  function buildTooltip(point: Point) {
    const lines = [
      point.label,
      `${xLabel}: ${formatValue(point.x, xFormat)}`,
      `${yLabel}: ${formatValue(point.y, yFormat)}`,
    ];

    let longestLineLength = 0;
    for (const line of lines) {
      if (line.length > longestLineLength) {
        longestLineLength = line.length;
      }
    }

    const width = longestLineLength * CHAR_WIDTH + TOOLTIP_PADDING * 2;
    const height = lines.length * LINE_HEIGHT + 12; // 12 = padding top + bottom

    // Preferred position: above and to the right of the dot.
    let x = scaleX(point.x) + TOOLTIP_GAP;
    let y = scaleY(point.y) - height - TOOLTIP_GAP;

    // If that would run off the right edge, put it to the left of the dot.
    if (x + width > WIDTH) {
      x = scaleX(point.x) - width - TOOLTIP_GAP;
    }
    // If it would run off the top edge, put it below the dot.
    if (y < 0) {
      y = scaleY(point.y) + TOOLTIP_GAP;
    }

    return { lines, width, height, x, y };
  }

  let tooltip = null;
  if (hoveredPoint !== null) {
    tooltip = buildTooltip(hoveredPoint);
  }

  let selection = null;
  if (drag !== null) {
    selection = dragToRectangle(drag);
  }

  // SVG has no z-index, so highlighted points are rendered in a second pass.
  const plainPoints: Point[] = [];
  const highlightedPoints: Point[] = [];
  for (const point of points) {
    if (highlightedIds !== null && highlightedIds.has(point.id)) {
      highlightedPoints.push(point);
    } else {
      plainPoints.push(point);
    }
  }

  // With a highlight running, the rest of the field steps back so the matches
  // read at a glance. With no highlight, the dots keep their normal weight.
  let plainPointClass = styles.point;
  if (highlightedIds !== null) {
    plainPointClass = `${styles.point} ${styles.fadedPoint}`;
  }

  // Preserve highlight styling when a highlighted point is hovered.
  let hoveredPointClass = styles.hoveredPoint;
  if (
    hoveredPoint !== null &&
    highlightedIds !== null &&
    highlightedIds.has(hoveredPoint.id)
  ) {
    hoveredPointClass = `${styles.hoveredPoint} ${styles.hoveredHighlightedPoint}`;
  }

  let description = `${yLabel} plotted against ${xLabel}, ${points.length} colleges`;
  if (zoom !== null) {
    description = `${description}, zoomed in`;
  }
  if (highlightedIds !== null) {
    description = `${description}, ${highlightedPoints.length} highlighted`;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMin meet"
      className={styles.chart}
      role="img"
      aria-label={description}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDoubleClick={handleResetZoom}
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
          />
        </clipPath>
      </defs>

      {/* Vertical grid lines and the numbers under them. */}
      {xAxis.ticks.map((tickValue) => (
        <g key={`x-${tickValue}`}>
          <line
            className={styles.gridLine}
            x1={scaleX(tickValue)}
            y1={PADDING.top}
            x2={scaleX(tickValue)}
            y2={PADDING.top + PLOT_HEIGHT}
          />
          <text
            className={styles.tickLabel}
            x={scaleX(tickValue)}
            y={PADDING.top + PLOT_HEIGHT + 18}
            textAnchor="middle"
          >
            {formatTick(tickValue, xFormat, xAxis.step)}
          </text>
        </g>
      ))}

      {/* Horizontal grid lines and the numbers beside them. */}
      {yAxis.ticks.map((tickValue) => (
        <g key={`y-${tickValue}`}>
          <line
            className={styles.gridLine}
            x1={PADDING.left}
            y1={scaleY(tickValue)}
            x2={PADDING.left + PLOT_WIDTH}
            y2={scaleY(tickValue)}
          />
          <text
            className={styles.tickLabel}
            x={PADDING.left - 10}
            y={scaleY(tickValue) + 4}
            textAnchor="end"
          >
            {formatTick(tickValue, yFormat, yAxis.step)}
          </text>
        </g>
      ))}

      {/* The two darker lines along the left and bottom edges. */}
      <line
        className={styles.axisLine}
        x1={PADDING.left}
        y1={PADDING.top}
        x2={PADDING.left}
        y2={PADDING.top + PLOT_HEIGHT}
      />
      <line
        className={styles.axisLine}
        x1={PADDING.left}
        y1={PADDING.top + PLOT_HEIGHT}
        x2={PADDING.left + PLOT_WIDTH}
        y2={PADDING.top + PLOT_HEIGHT}
      />

      <g clipPath={`url(#${CLIP_ID})`}>
        {/* One circle per college. When zoomed in, the ones outside the window
            are still here — the clip path is what hides them. */}
        {plainPoints.map((point) => (
          <circle
            key={point.id}
            className={plainPointClass}
            cx={scaleX(point.x)}
            cy={scaleY(point.y)}
            r={4}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        {/* The highlighted colleges, drawn second so they land on top. */}
        {highlightedPoints.map((point) => (
          <circle
            key={point.id}
            className={`${styles.point} ${styles.highlightedPoint}`}
            cx={scaleX(point.x)}
            cy={scaleY(point.y)}
            r={5}
            onMouseEnter={() => setHoveredPoint(point)}
            onMouseLeave={() => setHoveredPoint(null)}
          />
        ))}

        {/* The hovered college, redrawn larger and outlined. Drawn after the
            others because SVG has no z-index: later elements sit on top. */}
        {hoveredPoint !== null && (
          <circle
            className={hoveredPointClass}
            cx={scaleX(hoveredPoint.x)}
            cy={scaleY(hoveredPoint.y)}
            r={6}
          />
        )}
      </g>

      {/* The rectangle being dragged. */}
      {selection !== null && (
        <rect
          className={styles.selectionBox}
          x={selection.left}
          y={selection.top}
          width={selection.width}
          height={selection.height}
        />
      )}

      <text
        className={styles.axisTitle}
        x={PADDING.left + PLOT_WIDTH / 2}
        y={HEIGHT - 8}
        textAnchor="middle"
      >
        {xLabel}
      </text>

      {/* rotate(-90) turns the whole coordinate system a quarter turn
          anticlockwise, which is why x and y look swapped and negated here. */}
      <text
        className={styles.axisTitle}
        transform="rotate(-90)"
        x={-(PADDING.top + PLOT_HEIGHT / 2)}
        y={16}
        textAnchor="middle"
      >
        {yLabel}
      </text>

      {/* Only offered once there's something to reset. */}
      {zoom !== null && (
        <g
          className={styles.resetControl}
          onPointerDown={handleResetPointerDown}
        >
          <rect
            className={styles.resetBox}
            x={PADDING.left + PLOT_WIDTH - RESET_WIDTH - RESET_INSET}
            y={PADDING.top + RESET_INSET}
            width={RESET_WIDTH}
            height={RESET_HEIGHT}
            rx={4}
          />
          <text
            className={styles.resetLabel}
            x={PADDING.left + PLOT_WIDTH - RESET_WIDTH / 2 - RESET_INSET}
            y={PADDING.top + RESET_INSET + 16}
            textAnchor="middle"
          >
            Reset zoom
          </text>
        </g>
      )}

      {tooltip !== null && (
        <g className={styles.tooltip}>
          <rect
            className={styles.tooltipBox}
            x={tooltip.x}
            y={tooltip.y}
            width={tooltip.width}
            height={tooltip.height}
            rx={4}
          />
          {tooltip.lines.map((line, index) => (
            <text
              key={line}
              className={
                index === 0
                  ? `${styles.tooltipText} ${styles.tooltipTitle}`
                  : styles.tooltipText
              }
              x={tooltip.x + TOOLTIP_PADDING}
              y={tooltip.y + 20 + index * LINE_HEIGHT}
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
