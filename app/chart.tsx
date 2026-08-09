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

// Tooltip measurements. Working out the real width of a piece of text means
// rendering it and measuring it, which isn't worth the complexity — so we
// estimate from the character count instead.
const CHAR_WIDTH = 6.7; // rough width of one character at 12px system-ui
const LINE_HEIGHT = 16;
const TOOLTIP_PADDING = 8;
const TOOLTIP_GAP = 12; // space between the dot and the tooltip box

// A drag shorter than this in either direction is treated as a stray click
// rather than a zoom. Without it, a single mis-click would collapse both axes
// onto one value.
const MINIMUM_DRAG = 12;

// The "Reset zoom" control, drawn in the top-right corner of the plot area.
const RESET_WIDTH = 88;
const RESET_HEIGHT = 24;
const RESET_INSET = 8; // gap between the control and the edges of the plot area

// Points that fall outside the zoom window have to be hidden. SVG does that
// with a clip path referenced by id — and the id has to be unique on the page.
// There is only ever one chart rendered, so a constant is enough.
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

/**
 * Turns a drag into a plain rectangle.
 *
 * A drag can go in any direction — up and to the left is just as valid as down
 * and to the right — so the start point isn't necessarily the top-left corner.
 * This sorts the two corners out into edges that are always the right way round.
 */
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

	return { left, right, top, bottom, width: right - left, height: bottom - top };
}

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
	highlightedIds,
}: {
	points: Point[];
	xLabel: string;
	yLabel: string;
	xFormat: MeasureFormat;
	yFormat: MeasureFormat;
	// Which points to single out, by id. `null` means nothing is singled out —
	// draw every point the same way.
	//
	// A Set rather than an array because this is asked "is this id in here?" once
	// per point on every render; a Set answers that in one step, where an array
	// would scan from the beginning every time.
	//
	// Note what this prop does NOT say: it doesn't mention searching. The chart
	// has never known anything about colleges or majors, and keeping the name
	// generic is what preserves that.
	highlightedIds: Set<number> | null;
}) {
	const [hoveredPoint, setHoveredPoint] = useState<Point | null>(null);

	// The part of the data currently on screen. null means "show everything".
	const [zoom, setZoom] = useState<Zoom | null>(null);

	// The rectangle the user is dragging right now, if any. Separate from `zoom`
	// because it changes on every mouse move and is thrown away when the drag
	// ends — only the final rectangle becomes a zoom.
	const [drag, setDrag] = useState<Drag | null>(null);

	// A ref is a handle on the real DOM element React created. We need the actual
	// <svg> node to convert screen coordinates into chart coordinates, which is
	// something React state can't tell us.
	const svgRef = useRef<SVGSVGElement | null>(null);

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

		// When zoomed in, the axes come from the zoom window rather than from the
		// data. Note that chooseTicks widens whatever it's given outward to whole
		// steps, so the view ends up very slightly larger than the rectangle that
		// was dragged — the trade for axes that still start and end on a label.
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

	// Changing the major, an axis measure, or a filter replaces the points
	// wholesale, and a zoom window computed for the old numbers would frame
	// nothing meaningful in the new ones — worst case, an empty rectangle with no
	// hint of why. So zooming out is the right reset.
	//
	// The dependency is the `points` array itself. scatter-plot.tsx builds it in a
	// useMemo, so it only becomes a new array when one of those things actually
	// changed; a re-render on its own won't trip this. Searching deliberately
	// isn't one of those things — highlighting arrives as a separate prop, so
	// typing in the search box keeps whatever zoom you were already looking at.
	useEffect(() => {
		setZoom(null);
	}, [points]);

	// This check comes AFTER the hooks above, never before. React requires every
	// hook to run in the same order on every render, so returning early above a
	// useState, useMemo or useEffect would break it.
	if (axes === null) {
		return <p className={styles.emptyMessage}>Nothing to plot — no college has data for both of these measures.</p>;
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

	// Zooming needs the opposite of the two functions above: the user hands us a
	// position on screen, and we have to work out which data value they landed
	// on. Each of these is scaleX / scaleY run backwards, step for step.
	function valueAtX(pixelX: number) {
		const fraction = (pixelX - PADDING.left) / PLOT_WIDTH;
		return xAxis.low + fraction * (xAxis.high - xAxis.low);
	}

	function valueAtY(pixelY: number) {
		const fraction = (PADDING.top + PLOT_HEIGHT - pixelY) / PLOT_HEIGHT;
		return yAxis.low + fraction * (yAxis.high - yAxis.low);
	}

	/**
	 * Where in the chart's own coordinate system the pointer is.
	 *
	 * A pointer event reports its position in screen pixels, but the SVG is
	 * stretched to fit its container, so screen pixels and the 1000×540 grid the
	 * chart is drawn on are different units. getScreenCTM() hands back the exact
	 * transform the browser used to draw the SVG; inverting it converts a screen
	 * position back into chart coordinates. Doing the arithmetic by hand from the
	 * element's bounding box would get the scaling right and the letterboxing
	 * from preserveAspectRatio wrong.
	 *
	 * The result is clamped to the plot area, so a drag that wanders out over the
	 * axis labels still produces a sensible rectangle.
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
		// Left button only. Right-click opens the context menu and middle-click
		// does its own thing; neither should start drawing a rectangle.
		if (event.button !== 0) {
			return;
		}

		// Touch is deliberately left alone. A finger dragging across the chart is
		// how you scroll the page on a phone, and claiming that gesture for zoom
		// would trap the reader on the chart. Mouse and pen only.
		if (event.pointerType === "touch") {
			return;
		}

		const start = chartPosition(event);
		if (start === null) {
			return;
		}

		// Pointer capture routes every later move and release event to this element
		// even if the pointer leaves it. Without it, dragging off the edge of the
		// chart and letting go there would leave a rectangle stuck on screen.
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

		// Build a new object rather than editing the existing one — React only
		// re-renders when it sees a value it hasn't seen before.
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

	// The reset control sits inside the SVG, so a press on it would otherwise
	// bubble up and start a zoom drag underneath. Stopping it here also means the
	// press never reaches handlePointerDown, so no rectangle is ever created.
	function handleResetPointerDown(event: ReactPointerEvent<SVGGElement>) {
		event.stopPropagation();
		handleResetZoom();
	}

	/** Works out what the tooltip says and where it goes. */
	function buildTooltip(point: Point) {
		const lines = [point.label, `${xLabel}: ${formatValue(point.x, xFormat)}`, `${yLabel}: ${formatValue(point.y, yFormat)}`];

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

	// The colleges are drawn in two passes, because SVG has no z-index — whatever
	// comes later in the markup sits on top. Splitting them here means the
	// highlighted ones can be drawn over the faded crowd rather than under it.
	//
	// When nothing is highlighted, every college lands in `plainPoints` and the
	// second pass draws nothing at all.
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

	// The hover marker sits on top of whatever dot is underneath it, so it has to
	// pick up that dot's colour — otherwise hovering a match would turn it back
	// to the ordinary point colour, which reads as un-highlighting it.
	let hoveredPointClass = styles.hoveredPoint;
	if (hoveredPoint !== null && highlightedIds !== null && highlightedIds.has(hoveredPoint.id)) {
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
		<svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMin meet" className={styles.chart} role="img" aria-label={description} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onDoubleClick={handleResetZoom}>
			{/* Anything drawn inside a group referencing this clip path is trimmed to
          the plot rectangle. That's what keeps zoomed-out colleges from
          scribbling over the axis labels — and, because clipping applies to
          mouse hit-testing too, from being hoverable while off screen. */}
			<defs>
				<clipPath id={CLIP_ID}>
					<rect x={PADDING.left} y={PADDING.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} />
				</clipPath>
			</defs>

			{/* Vertical grid lines and the numbers under them. */}
			{xAxis.ticks.map((tickValue) => (
				<g key={`x-${tickValue}`}>
					<line className={styles.gridLine} x1={scaleX(tickValue)} y1={PADDING.top} x2={scaleX(tickValue)} y2={PADDING.top + PLOT_HEIGHT} />
					<text className={styles.tickLabel} x={scaleX(tickValue)} y={PADDING.top + PLOT_HEIGHT + 18} textAnchor="middle">
						{formatTick(tickValue, xFormat, xAxis.step)}
					</text>
				</g>
			))}

			{/* Horizontal grid lines and the numbers beside them. */}
			{yAxis.ticks.map((tickValue) => (
				<g key={`y-${tickValue}`}>
					<line className={styles.gridLine} x1={PADDING.left} y1={scaleY(tickValue)} x2={PADDING.left + PLOT_WIDTH} y2={scaleY(tickValue)} />
					<text className={styles.tickLabel} x={PADDING.left - 10} y={scaleY(tickValue) + 4} textAnchor="end">
						{formatTick(tickValue, yFormat, yAxis.step)}
					</text>
				</g>
			))}

			{/* The two darker lines along the left and bottom edges. */}
			<line className={styles.axisLine} x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={PADDING.top + PLOT_HEIGHT} />
			<line className={styles.axisLine} x1={PADDING.left} y1={PADDING.top + PLOT_HEIGHT} x2={PADDING.left + PLOT_WIDTH} y2={PADDING.top + PLOT_HEIGHT} />

			<g clipPath={`url(#${CLIP_ID})`}>
				{/* One circle per college. When zoomed in, the ones outside the window
            are still here — the clip path is what hides them. */}
				{plainPoints.map((point) => (
					<circle key={point.id} className={plainPointClass} cx={scaleX(point.x)} cy={scaleY(point.y)} r={4} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)} />
				))}

				{/* The highlighted colleges, drawn second so they land on top. */}
				{highlightedPoints.map((point) => (
					<circle key={point.id} className={`${styles.point} ${styles.highlightedPoint}`} cx={scaleX(point.x)} cy={scaleY(point.y)} r={5} onMouseEnter={() => setHoveredPoint(point)} onMouseLeave={() => setHoveredPoint(null)} />
				))}

				{/* The hovered college, redrawn larger and outlined. Drawn after the
            others because SVG has no z-index: later elements sit on top. */}
				{hoveredPoint !== null && <circle className={hoveredPointClass} cx={scaleX(hoveredPoint.x)} cy={scaleY(hoveredPoint.y)} r={6} />}
			</g>

			{/* The rectangle being dragged. */}
			{selection !== null && <rect className={styles.selectionBox} x={selection.left} y={selection.top} width={selection.width} height={selection.height} />}

			<text className={styles.axisTitle} x={PADDING.left + PLOT_WIDTH / 2} y={HEIGHT - 8} textAnchor="middle">
				{xLabel}
			</text>

			{/* rotate(-90) turns the whole coordinate system a quarter turn
          anticlockwise, which is why x and y look swapped and negated here. */}
			<text className={styles.axisTitle} transform="rotate(-90)" x={-(PADDING.top + PLOT_HEIGHT / 2)} y={16} textAnchor="middle">
				{yLabel}
			</text>

			{/* Only offered once there's something to reset. */}
			{zoom !== null && (
				<g className={styles.resetControl} onPointerDown={handleResetPointerDown}>
					<rect className={styles.resetBox} x={PADDING.left + PLOT_WIDTH - RESET_WIDTH - RESET_INSET} y={PADDING.top + RESET_INSET} width={RESET_WIDTH} height={RESET_HEIGHT} rx={4} />
					<text className={styles.resetLabel} x={PADDING.left + PLOT_WIDTH - RESET_WIDTH / 2 - RESET_INSET} y={PADDING.top + RESET_INSET + 16} textAnchor="middle">
						Reset zoom
					</text>
				</g>
			)}

			{tooltip !== null && (
				<g className={styles.tooltip}>
					<rect className={styles.tooltipBox} x={tooltip.x} y={tooltip.y} width={tooltip.width} height={tooltip.height} rx={4} />
					{tooltip.lines.map((line, index) => (
						<text key={line} className={index === 0 ? `${styles.tooltipText} ${styles.tooltipTitle}` : styles.tooltipText} x={tooltip.x + TOOLTIP_PADDING} y={tooltip.y + 20 + index * LINE_HEIGHT}>
							{line}
						</text>
					))}
				</g>
			)}
		</svg>
	);
}
