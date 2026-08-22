<?php

declare(strict_types=1);

namespace App\Controller\Employees;

use App\Entity\User;
use App\Exception\BadRequestException;
use App\Repository\EmployeeRepository;
use App\Service\EmployeePhotoStorage;
use App\Service\EmployeePhotoUploadValidator;
use App\Service\EmployeeResponseBuilder;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

/**
 * Self-service profile picture upload: any authenticated employee can set
 * or replace their OWN photo — unlike EmployeeCrudController's ImageField
 * (HR-admin-only, any employee). Reuses the same storage directory
 * (app.employee_photo_dir) and filename convention (EmployeePhotoStorage)
 * so the result is indistinguishable to EmployeeResponseBuilder::photoUrl()
 * from an HR-admin-uploaded photo.
 */
final class EmployeeMePhotoUploadController
{
    public function __construct(
        private readonly EmployeeRepository $employees,
        private readonly EmployeePhotoUploadValidator $validator,
        private readonly EmployeePhotoStorage $storage,
        private readonly EmployeeResponseBuilder $responseBuilder,
        private readonly EntityManagerInterface $em,
    ) {
    }

    #[Route('/api/v1/employees/me/photo/', name: 'employees_me_photo_upload', methods: ['POST'])]
    public function __invoke(Request $request, #[CurrentUser] User $user): JsonResponse
    {
        $employee = $this->employees->findByUser($user);
        if ($employee === null) {
            return new JsonResponse(['detail' => 'No employee profile linked to this account.'], 404);
        }

        $result = $this->validator->validate($request->files->get('photo'));
        if ($result->error !== null) {
            throw new BadRequestException($result->error);
        }

        $filename = $this->storage->store($request->files->get('photo'), $employee, $result->extension);
        $employee->setPhotoFilename($filename);
        $this->em->flush();

        return new JsonResponse($this->responseBuilder->buildDetail($employee, $user->hasAdminRole()));
    }
}
