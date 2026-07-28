<?php

declare(strict_types=1);

namespace App\Service;

use App\Entity\Appraisal;
use App\Entity\CompetencyRating;
use App\Entity\DevelopmentNeed;
use App\Entity\KeyDeliverable;
use App\Entity\Signature;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Enum\StrengthWeaknessType;
use App\Repository\CareerPlanRepository;
use App\Repository\CompetencyRatingRepository;
use App\Repository\DevelopmentNeedRepository;
use App\Repository\EmployeeRepository;
use App\Repository\GrowthPlanRepository;
use App\Repository\KeyDeliverableRepository;
use App\Repository\SignatureRepository;
use App\Repository\StrengthWeaknessRepository;
use App\Repository\TrainingNeedRepository;

/**
 * Port of apps.reports.views.{_fetch_deliverables_data,
 * _fetch_competency_ratings_data, _fetch_growth_plan_data,
 * _fetch_signatures_data} + apps.reports.services.{_build_kd_context,
 * _build_cr_context, _build_growth_plan_context, _build_signature_context,
 * build_appraisal_pdf_context}. Builds the Twig context for
 * pdf/appraisal_report.html.twig.
 */
final class AppraisalPdfContextBuilder
{
    public function __construct(
        private readonly KeyDeliverableRepository $keyDeliverables,
        private readonly CompetencyRatingRepository $competencyRatings,
        private readonly GrowthPlanRepository $growthPlans,
        private readonly StrengthWeaknessRepository $strengthWeaknesses,
        private readonly TrainingNeedRepository $trainingNeeds,
        private readonly CareerPlanRepository $careerPlans,
        private readonly DevelopmentNeedRepository $developmentNeeds,
        private readonly SignatureRepository $signatures,
        private readonly EmployeeRepository $employees,
        private readonly PdfLogo $logo,
        private readonly ReportCalculations $calculations,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function build(Appraisal $appraisal): array
    {
        $employee = $appraisal->getEmployee();
        $cycle = $appraisal->getCycle();

        return [
            'employee_name' => $employee->getName(),
            'employee_id' => $employee->getEmployeeNumber(),
            'job_title' => $employee->getJobTitle(),
            'department_name' => $employee->getDepartment()->getName(),
            'cycle_name' => $cycle->getPeriodName(),
            'cycle_year' => (int) $cycle->getStartDate()->format('Y'),
            'cycle_start' => $cycle->getStartDate()->format('Y-m-d'),
            'cycle_end' => $cycle->getEndDate()->format('Y-m-d'),
            // weight/weighted_score are stored at 4dp but Django's PDF
            // template applies |floatformat:2 uniformly to every numeric
            // KD column, so both are rounded to 2dp for display only
            // (the JSON API contract elsewhere keeps full 4dp precision).
            'key_deliverables' => array_map(fn (KeyDeliverable $kd) => [
                'description' => $kd->getDescription(),
                'bsc_perspective' => $kd->getPerspective()->getName(),
                'weight' => $this->calculations->roundHalfEven($kd->getWeight(), 2),
                'self_rating' => $kd->getSelfRating(),
                'manager_rating' => $kd->getManagerRating(),
                'weighted_score' => $kd->getWeightedScore() !== null ? $this->calculations->roundHalfEven($kd->getWeightedScore(), 2) : null,
            ], $this->keyDeliverables->findByAppraisalOrderedBySortOrder($appraisal)),
            'competency_ratings' => array_map(fn (CompetencyRating $cr) => [
                'competency_name' => $cr->getCompetency()->getName(),
                'self_rating' => $cr->getSelfRating(),
                'manager_rating' => $cr->getManagerRating(),
            ], $this->competencyRatings->findByAppraisalOrdered($appraisal)),
            'kd_average' => $appraisal->getKdAverageScore(),
            'kd_descriptor' => $appraisal->getKdDescriptor(),
            'competency_average' => $appraisal->getBcAverageScore(),
            'bc_descriptor' => $appraisal->getBcDescriptor(),
            'total_score' => $appraisal->getTotalScore(),
            'performance_descriptor' => $appraisal->getPerformanceDescriptor(),
            'growth_plan' => $this->buildGrowthPlanContext($appraisal),
            'signatures' => array_map(fn (Signature $s) => $this->buildSignatureRow($s), $this->signatures->findByAppraisalOrderedBySignedAt($appraisal)),
            'generated_at' => (new \DateTimeImmutable())->format(\DateTimeInterface::ATOM),
            'logo_b64' => $this->logo->base64DataUri(),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildGrowthPlanContext(Appraisal $appraisal): ?array
    {
        $growthPlan = $this->growthPlans->findOneByAppraisal($appraisal);
        if ($growthPlan === null) {
            return null;
        }

        $strengthsAndWeaknesses = $this->strengthWeaknesses->findByGrowthPlanOrdered($growthPlan);

        return [
            'overall_assessment' => $growthPlan->getOverallAssessment() ?? '',
            'strengths' => array_values(array_map(
                static fn (StrengthWeakness $sw) => $sw->getDescription(),
                array_filter($strengthsAndWeaknesses, static fn (StrengthWeakness $sw) => StrengthWeaknessType::STRENGTH === $sw->getType()),
            )),
            'weaknesses' => array_values(array_map(
                static fn (StrengthWeakness $sw) => $sw->getDescription(),
                array_filter($strengthsAndWeaknesses, static fn (StrengthWeakness $sw) => StrengthWeaknessType::WEAKNESS === $sw->getType()),
            )),
            'training_needs' => array_map(
                static fn (TrainingNeed $tn) => $tn->getDescription(),
                $this->trainingNeeds->findByGrowthPlanOrdered($growthPlan),
            ),
            'career_plans' => array_map(
                static fn ($cp) => $cp->getAspiredRole(),
                $this->careerPlans->findByGrowthPlanOrdered($growthPlan),
            ),
            'development_needs' => array_map(
                static fn (DevelopmentNeed $dn) => $dn->getDescription(),
                $this->developmentNeeds->findByGrowthPlanOrdered($growthPlan),
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildSignatureRow(Signature $signature): array
    {
        $signerProfile = $this->employees->findByUser($signature->getSigner());

        return [
            'signer_name' => $signerProfile?->getName() ?? '',
            'signer_role' => $signature->getSignerRole()->label(),
            'action' => $signature->getAction()->label(),
            'reason' => $signature->getReason(),
            'signed_at' => $signature->getSignedAt()->format(\DateTimeInterface::ATOM),
        ];
    }
}
