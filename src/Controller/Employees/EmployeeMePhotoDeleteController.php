<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\User;
use App\Repository\EmployeeRepository;
use App\Service\EmployeePhotoStorage;
use App\Service\EmployeeResponseBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Removes the current employee's own profile picture, if one is set.
 * Idempotent — deleting when no photo is set just returns the (unchanged)
 * profile rather than erroring, matching how a "remove" action reads to
 * a user regardless of whether there was anything to remove.
 */
final class EmployeeMePhotoDeleteController
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeePhotoStorage $storage,
        private readonly EmployeeResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/employees/me/photo/', name: 'employees_me_photo_delete', methods: ['DELETE'])]
    public function __invoke(#[CurrentUser] User $user): JsonResponse
    {
        $employee = $this->employees->findByUser($user);
        if ($employee === null) {
            return new JsonResponse(['detail' => 'No employee profile linked to this account.'], 404);
        }

        if ($employee->getPhotoFilename() !== null) {
            $this->storage->delete($employee->getPhotoFilename());
            $employee->setPhotoFilename(null);
            $this->em->flush();
        }

        return new JsonResponse($this->responseBuilder->buildDetail($employee, $user->hasAdminRole()));
    }
}
