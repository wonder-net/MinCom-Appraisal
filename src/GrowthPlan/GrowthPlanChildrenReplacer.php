<?php

declare(strict_types=1);

namespace App\GrowthPlan;

use App\Entity\CareerPlan;
use App\Entity\DevelopmentNeed;
use App\Entity\GrowthPlan;
use App\Entity\StrengthWeakness;
use App\Entity\TrainingNeed;
use App\Repository\CareerPlanRepository;
use App\Repository\DevelopmentNeedRepository;
use App\Repository\StrengthWeaknessRepository;
use App\Repository\TrainingNeedRepository;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Port of the shared delete-then-bulk_create replacement logic used by
 * both GrowthPlanViewSet.create() and .partial_update() for each of
 * the 4 child arrays. Stages persist()/remove() calls only — the
 * caller is responsible for flushing within its own transaction
 * boundary.
 */
final class GrowthPlanChildrenReplacer
{
    public function __construct(
        private readonly StrengthWeaknessRepository $strengthsWeaknesses,
        private readonly TrainingNeedRepository $trainingNeeds,
        private readonly CareerPlanRepository $careerPlans,
        private readonly DevelopmentNeedRepository $developmentNeeds,
        private readonly EntityManagerInterface $em,
    ) {
    }

    /**
     * @param list<ValidatedStrengthWeakness> $items
     */
    public function replaceStrengthsWeaknesses(GrowthPlan $growthPlan, array $items): void
    {
        foreach ($this->strengthsWeaknesses->findByGrowthPlanOrdered($growthPlan) as $existing) {
            $this->em->remove($existing);
        }
        foreach ($items as $item) {
            $this->em->persist(new StrengthWeakness($growthPlan, $item->type, $item->description, $item->sortOrder));
        }
    }

    /**
     * @param list<ValidatedTrainingNeed> $items
     */
    public function replaceTrainingNeeds(GrowthPlan $growthPlan, array $items): void
    {
        foreach ($this->trainingNeeds->findByGrowthPlanOrdered($growthPlan) as $existing) {
            $this->em->remove($existing);
        }
        foreach ($items as $item) {
            $entity = new TrainingNeed($growthPlan, $item->type, $item->description, $item->priority, $item->sortOrder);
            $entity->setCourseTitle($item->courseTitle);
            $entity->setInstitution($item->institution);
            $this->em->persist($entity);
        }
    }

    /**
     * @param list<ValidatedCareerPlan> $items
     */
    public function replaceCareerPlans(GrowthPlan $growthPlan, array $items): void
    {
        foreach ($this->careerPlans->findByGrowthPlanOrdered($growthPlan) as $existing) {
            $this->em->remove($existing);
        }
        foreach ($items as $item) {
            $this->em->persist(new CareerPlan($growthPlan, $item->aspiredRole, $item->priority));
        }
    }

    /**
     * @param list<ValidatedDevelopmentNeed> $items
     */
    public function replaceDevelopmentNeeds(GrowthPlan $growthPlan, array $items): void
    {
        foreach ($this->developmentNeeds->findByGrowthPlanOrdered($growthPlan) as $existing) {
            $this->em->remove($existing);
        }
        foreach ($items as $item) {
            $this->em->persist(new DevelopmentNeed($growthPlan, $item->description, $item->priority));
        }
    }
}
