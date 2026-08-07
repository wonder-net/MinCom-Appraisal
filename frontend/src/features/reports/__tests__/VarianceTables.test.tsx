/**
 * Tests for KDVarianceTable and CompetencyVarianceTable —
 * verifies colour-coding for variance values and the "Core" badge.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KDVarianceTable } from "../components/KDVarianceTable";
import { CompetencyVarianceTable } from "../components/CompetencyVarianceTable";
import type { KDVarianceRow, CompetencyVarianceRow } from "@/api/reports";

describe("KDVarianceTable", () => {
  it("renders positive variance with red text class", () => {
    const rows: KDVarianceRow[] = [
      {
        kd_title: "Financial",
        avg_self_rating: 4.5,
        avg_manager_rating: 3.5,
        variance: 1.0,
        count: 5,
      },
    ];

    render(<KDVarianceTable rows={rows} />);

    const varianceCell = screen.getByText("+1.00");
    expect(varianceCell).toHaveClass("text-red-700");
  });

  it("renders negative variance with green text class", () => {
    const rows: KDVarianceRow[] = [
      {
        kd_title: "Customer",
        avg_self_rating: 3.0,
        avg_manager_rating: 4.5,
        variance: -1.5,
        count: 3,
      },
    ];

    render(<KDVarianceTable rows={rows} />);

    const varianceCell = screen.getByText("-1.50");
    expect(varianceCell).toHaveClass("text-green-700");
  });
});

describe("CompetencyVarianceTable", () => {
  it("renders Core badge when is_core is true", () => {
    const rows: CompetencyVarianceRow[] = [
      {
        competency_name: "Communication",
        is_core: true,
        avg_self_rating: 4.0,
        avg_manager_rating: 3.5,
        variance: 0.5,
        count: 10,
      },
    ];

    render(<CompetencyVarianceTable rows={rows} />);

    expect(screen.getByText("Core")).toBeInTheDocument();
  });

  it("does not render Core badge when is_core is false", () => {
    const rows: CompetencyVarianceRow[] = [
      {
        competency_name: "Technical Skills",
        is_core: false,
        avg_self_rating: 3.0,
        avg_manager_rating: 4.0,
        variance: -1.0,
        count: 5,
      },
    ];

    render(<CompetencyVarianceTable rows={rows} />);

    expect(screen.queryByText("Core")).not.toBeInTheDocument();
  });

  it("renders positive competency variance with red class", () => {
    const rows: CompetencyVarianceRow[] = [
      {
        competency_name: "Leadership",
        is_core: true,
        avg_self_rating: 4.5,
        avg_manager_rating: 3.0,
        variance: 1.5,
        count: 8,
      },
    ];

    render(<CompetencyVarianceTable rows={rows} />);

    const varianceCell = screen.getByText("+1.50");
    expect(varianceCell).toHaveClass("text-red-700");
  });
});
