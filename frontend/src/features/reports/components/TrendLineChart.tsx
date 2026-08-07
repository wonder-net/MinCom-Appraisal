/**
 * TrendLineChart — lightweight SVG line chart for the cross-cycle
 * trend report. Renders cycle years on the x-axis and average total
 * scores on the y-axis. Null scores are shown as gaps in the line.
 *
 * Built without external chart libraries to avoid adding a dependency.
 */

import { useMemo } from "react";
import type { TrendDataPoint } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface ChartBounds {
  minY: number;
  maxY: number;
  rangeY: number;
}

/**
 * Compute the Y-axis bounds from data points, padding by 10% on each end.
 * Falls back to 0–5 when no valid scores exist.
 */
function computeBounds(points: TrendDataPoint[]): ChartBounds {
  const scores = points
    .map((p) => p.avg_total_score)
    .filter((s): s is number => s !== null);

  if (scores.length === 0) {
    return { minY: 0, maxY: 5, rangeY: 5 };
  }

  const rawMin = Math.min(...scores);
  const rawMax = Math.max(...scores);
  const padding = Math.max((rawMax - rawMin) * 0.1, 0.25);
  const minY = Math.max(0, rawMin - padding);
  const maxY = rawMax + padding;
  return { minY, maxY, rangeY: maxY - minY };
}

/**
 * Format a score for display on the Y-axis.
 */
function formatAxisScore(value: number): string {
  return value.toFixed(1);
}

/**
 * Format a score for the tooltip / accessible label.
 */
function formatTooltipScore(score: number | null): string {
  return score === null ? "No data" : Number(score).toFixed(2);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_WIDTH = 600;
const CHART_HEIGHT = 300;
const PADDING_LEFT = 50;
const PADDING_RIGHT = 30;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 50;
const PLOT_WIDTH = CHART_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const Y_TICK_COUNT = 5;
const DOT_RADIUS = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TrendLineChartProps {
  dataPoints: TrendDataPoint[];
}

export function TrendLineChart({ dataPoints }: TrendLineChartProps) {
  const bounds = useMemo(() => computeBounds(dataPoints), [dataPoints]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= Y_TICK_COUNT; i++) {
      ticks.push(bounds.minY + (bounds.rangeY * i) / Y_TICK_COUNT);
    }
    return ticks;
  }, [bounds]);

  const pointCoords = useMemo(() => {
    const count = dataPoints.length;
    return dataPoints.map((point, index) => {
      const x =
        count === 1
          ? PADDING_LEFT + PLOT_WIDTH / 2
          : PADDING_LEFT + (index / (count - 1)) * PLOT_WIDTH;
      const y =
        point.avg_total_score === null
          ? null
          : PADDING_TOP +
            PLOT_HEIGHT -
            ((point.avg_total_score - bounds.minY) / bounds.rangeY) *
              PLOT_HEIGHT;
      return { x, y, point };
    });
  }, [dataPoints, bounds]);

  /** Build SVG path segments, breaking at null values. */
  const linePath = useMemo(() => {
    const segments: string[] = [];
    let inSegment = false;

    for (const coord of pointCoords) {
      if (coord.y === null) {
        inSegment = false;
        continue;
      }
      if (!inSegment) {
        segments.push(`M ${coord.x} ${coord.y}`);
        inSegment = true;
      } else {
        segments.push(`L ${coord.x} ${coord.y}`);
      }
    }

    return segments.join(" ");
  }, [pointCoords]);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full max-w-[600px] mx-auto h-auto"
        role="img"
        aria-label="Cross-cycle performance trend line chart"
      >
        {/* Y-axis gridlines and labels */}
        {yTicks.map((tick) => {
          const y =
            PADDING_TOP +
            PLOT_HEIGHT -
            ((tick - bounds.minY) / bounds.rangeY) * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line
                x1={PADDING_LEFT}
                y1={y}
                x2={PADDING_LEFT + PLOT_WIDTH}
                y2={y}
                className="stroke-gray-200"
                strokeWidth={1}
              />
              <text
                x={PADDING_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-gray-500 text-[11px]"
              >
                {formatAxisScore(tick)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {pointCoords.map((coord) => (
          <text
            key={coord.point.cycle_id}
            x={coord.x}
            y={CHART_HEIGHT - PADDING_BOTTOM + 20}
            textAnchor="middle"
            className="fill-gray-600 text-[11px]"
          >
            {coord.point.cycle_year}
          </text>
        ))}

        {/* X-axis cycle names (second line) */}
        {pointCoords.map((coord) => (
          <text
            key={`name-${coord.point.cycle_id}`}
            x={coord.x}
            y={CHART_HEIGHT - PADDING_BOTTOM + 35}
            textAnchor="middle"
            className="fill-gray-400 text-[9px]"
          >
            {coord.point.cycle_name.length > 12
              ? `${coord.point.cycle_name.slice(0, 12)}...`
              : coord.point.cycle_name}
          </text>
        ))}

        {/* Line path */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            className="stroke-secondary"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Data point dots */}
        {pointCoords.map((coord) =>
          coord.y !== null ? (
            <circle
              key={coord.point.cycle_id}
              cx={coord.x}
              cy={coord.y}
              r={DOT_RADIUS}
              className="fill-secondary stroke-white"
              strokeWidth={2}
            >
              <title>
                {coord.point.cycle_name} ({coord.point.cycle_year}): {formatTooltipScore(coord.point.avg_total_score)} ({coord.point.appraisal_count} appraisals)
              </title>
            </circle>
          ) : (
            <circle
              key={coord.point.cycle_id}
              cx={coord.x}
              cy={PADDING_TOP + PLOT_HEIGHT / 2}
              r={3}
              className="fill-gray-300 stroke-white"
              strokeWidth={1}
            >
              <title>
                {coord.point.cycle_name} ({coord.point.cycle_year}): No data
              </title>
            </circle>
          ),
        )}

        {/* Y-axis label */}
        <text
          x={14}
          y={PADDING_TOP + PLOT_HEIGHT / 2}
          textAnchor="middle"
          transform={`rotate(-90, 14, ${PADDING_TOP + PLOT_HEIGHT / 2})`}
          className="fill-gray-500 text-[11px]"
        >
          Avg Total Score
        </text>
      </svg>

      {/* Accessible data table (screen readers) */}
      <table className="sr-only" aria-label="Trend data">
        <thead>
          <tr>
            <th scope="col">Cycle</th>
            <th scope="col">Year</th>
            <th scope="col">Average Score</th>
            <th scope="col">Appraisals</th>
          </tr>
        </thead>
        <tbody>
          {dataPoints.map((point) => (
            <tr key={point.cycle_id}>
              <td>{point.cycle_name}</td>
              <td>{point.cycle_year}</td>
              <td>{formatTooltipScore(point.avg_total_score)}</td>
              <td>{point.appraisal_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
