"use client";

import { useMemo, useState } from "react";
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

// Tooltip measurements. Working out the real width of a piece of text means
// rendering it and measuring it, which isn't worth the complexity — so we
// estimate from the character count instead.
const CHAR_WIDTH = 6.7; // rough width of one character at 12px system-ui
const LINE_HEIGHT = 16;
const TOOLTIP_PADDING = 8;
const TOOLTIP_GAP = 12; // space between the dot and the tooltip box

/**
 * Chooses round numbers to label an axis with.
 *
 * Given the smallest and largest values in the data, this picks a step size of
 * 1, 2, 5 or 10 times some power of ten — the intervals people read
 * comfortably — then widens the range outward to whole steps, so the axis
 * begins and ends on a labelled line.
 *
 * Values from 512 to 1487 with a target of 6 labels produce a step of 200 and
 * ticks at 400, 600, 800, 1000, 1200, 1400, 1600.
 */
function chooseTicks(min: number, max: number, targetCount = 6) {
  // Every value is identical, so there's no range to divide up. Invent a small
  // one, or the division below would be by zero.
  if (min === max) {
    min = min - 0.5;
    max = max + 0.5;
  }

  // How far apart the labels would be if we simply divided the range evenly.
  // Almost never a round number — something like 162.83.
  const roughStep = (max - min) / targetCount;

  // Split that into a power of ten and what's left over. For 162.83, the
  // magnitude is 100 and the leftover is 1.6283.
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  // Round the leftover up to 1, 2, 5 or 10, then scale back up.
  // 1.6283 rounds to 2, so the step becomes 2 × 100 = 200.
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
  // Each tick is computed from `low` rather than by repeatedly adding `step`,
  // which would accumulate rounding error. The tiny tolerance covers the case
  // where floating-point arithmetic lands the last tick a hair above `high`
  // and it would otherwise be dropped.
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
}: {
  points: Point[];
  xLabel: string;
  yLabel: string;
  xFormat: MeasureFormat;
  yFormat: MeasureFormat;
}) {
  const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);

  // The range of the data on each axis, and the round tick values that follow
  // from it.
  //
  // useMemo matters here: moving the mouse across the chart re-renders this
  // component constantly, and without it we would rescan every point and
  // redo the tick arithmetic on every single mouse movement.
  const axes = useMemo(() => {
    if (points.length === 0) {
      return null;
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
  }, [points]);

  // This check comes AFTER the hooks above, never before. React requires every
  // hook to run in the same order on every render, so returning early above a
  // useState or useMemo would break it.
  if (axes === null) {
    return (
      <p className={styles.emptyMessage}>
        Nothing to plot — no college has data for both of these measures.
      </p>
    );
  }

  const xAxis = axes.x;
  const yAxis = axes.y;

  // The heart of the whole chart: a data value in, a pixel position out.
  //
  //   (value - low) / (high - low)  →  how far along the axis this value sits,
  //                                    as a fraction between 0 and 1
  //   × PLOT_WIDTH                  →  turns that fraction into a distance
  //   + PADDING.left                →  shifts it right, clear of the y labels
  function scaleX(value: number) {
    const fraction = (value - xAxis.low) / (xAxis.high - xAxis.low);
    return PADDING.left + fraction * PLOT_WIDTH;
  }

  // The same idea vertically, with one twist. SVG measures y downward from the
  // top of the image, but a chart's y-axis grows upward. So instead of adding
  // the distance to the top edge, we subtract it from the bottom edge.
  function scaleY(value: number) {
    const fraction = (value - yAxis.low) / (yAxis.high - yAxis.low);
    return PADDING.top + PLOT_HEIGHT - fraction * PLOT_HEIGHT;
  }

  /** Works out what the tooltip says and where it goes. */
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

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMin meet"
      className={styles.chart}
      role="img"
      aria-label={`${yLabel} plotted against ${xLabel}, ${points.length} colleges`}
    >
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

      {/* One circle per college. */}
      {points.map((point) => (
        <circle
          key={point.id}
          className={styles.point}
          cx={scaleX(point.x)}
          cy={scaleY(point.y)}
          r={4}
          onMouseEnter={() => setHoveredPoint(point)}
          onMouseLeave={() => setHoveredPoint(null)}
        />
      ))}

      {/* The hovered college, redrawn larger and outlined. Drawn after the
          others because SVG has no z-index: later elements sit on top. */}
      {hoveredPoint !== null && (
        <circle
          className={styles.highlightedPoint}
          cx={scaleX(hoveredPoint.x)}
          cy={scaleY(hoveredPoint.y)}
          r={6}
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
